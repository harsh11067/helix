// routes — P4 On-chain Forecaster Passport HTTP API. Flag: FEATURE_ONCHAIN_PASSPORT=1 (else no routes → 404).
//
//   GET  /passport/:ns/onchain?owner=0x…[&fresh=1]  the owner's ForecasterPassport (or null) + package ids
//   POST /passport/:ns/claim-tx    { owner }        unsigned passport::claim, from a fresh attestation
//   POST /passport/:ns/refresh-tx  { owner }        unsigned passport::refresh (409 when not newer)
//
// The browser signs the returned `txBytes` and executes through the existing POST /tx/execute.
// Gas: the owner's own SUI, or HELIX's sponsor when the owner has none (needs the integrator's
// `isSponsorablePassportCall` wiring in `sponsorRefusal`; PASSPORT_SPONSOR=0 disables it).
//
// Attestation source, first match wins:
//   1. an in-process provider registered with `setAttestationProvider` (Lane A's signer after the merge)
//   2. PASSPORT_ATTESTATION_URL → GET {url}/passport/:ns/attestation?owner=   (LANES.md §0 shape)
//   3. the interim signer in mockAttestation.ts (same key, numbers from the owner's real memory)
// Every attestation is checked against the ON-CHAIN registry key before a transaction is built.

import { normalizeSuiAddress } from '@mysten/sui/utils';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { HttpError } from '../../shared/http.ts';
import { sponsorAddress } from '../../memory/commit.ts';
import { attestationProblem, badgeNames, type AttestationResponse } from './attestation.ts';
import { mockAttestationFor } from './mockAttestation.ts';
import {
  PASSPORT_PACKAGE, PASSPORT_REGISTRY, PASSPORT_TYPE, SUISCAN, buildBytes, buildClaimTx, buildRefreshTx, executeAs,
  forgetPassport, passportOf, registryState, suiBalance, type OnchainPassport,
} from './chain.ts';

export type AttestationProvider = (ns: string, owner: string) => Promise<AttestationResponse>;
let provider: AttestationProvider | null = null;
/** Integrator hook: make claim/refresh use Lane A's in-process attestation signer. */
export function setAttestationProvider(p: AttestationProvider | null): void { provider = p; }

export type AttestationSource = 'provider' | 'http' | 'mock';
export async function attestationFor(ns: string, owner: string): Promise<{ att: AttestationResponse; source: AttestationSource }> {
  if (provider) return { att: await provider(ns, owner), source: 'provider' };
  const base = process.env.PASSPORT_ATTESTATION_URL?.trim().replace(/\/+$/, '');
  if (base) {
    const r = await fetch(`${base}/passport/${encodeURIComponent(ns)}/attestation?owner=${owner}`, { signal: AbortSignal.timeout(30_000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 502, { error: `attestation endpoint: ${j.error ?? `HTTP ${r.status}`}` });
    return { att: j as AttestationResponse, source: 'http' };
  }
  return { att: await mockAttestationFor(ns, owner), source: 'mock' };
}

/** The attestation must verify against the registry's on-chain key, name this owner and ns, and not be about to expire. */
export async function checkAttestation(att: AttestationResponse, ns: string, owner: string, pubkeyHex: string | null, now = Date.now()): Promise<void> {
  if (!pubkeyHex) throw new HttpError(503, { error: 'cannot read the attestor key from the passport registry right now' });
  const why = await attestationProblem(att, pubkeyHex);
  if (why) throw new HttpError(502, { error: `attestation rejected: ${why}` });
  if (normalizeSuiAddress(att.fields.owner) !== normalizeSuiAddress(owner)) throw new HttpError(502, { error: 'attestation rejected: issued for a different address' });
  if (att.fields.ns !== ns) throw new HttpError(502, { error: 'attestation rejected: issued for a different namespace' });
  if (att.fields.expires_ms < now + 60_000) throw new HttpError(502, { error: 'attestation rejected: expires too soon to sign' });
}

const SPONSOR_BELOW_MIST = 20_000_000n;   // an owner with less than 0.02 SUI gets sponsored gas
async function sponsorFor(owner: string): Promise<string | null> {
  if (process.env.PASSPORT_SPONSOR === '0') return null;
  const sp = sponsorAddress();
  if (!sp || normalizeSuiAddress(sp) === normalizeSuiAddress(owner)) return null;
  return (await suiBalance(owner).catch(() => 0n)) < SPONSOR_BELOW_MIST ? sp : null;
}

const needAddr = (a: unknown): string => {
  if (typeof a !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(a)) throw new HttpError(400, { error: 'invalid Sui address (0x + 64 hex)' });
  return a.toLowerCase();
};
const needNs = (ns: unknown): string => {
  if (typeof ns !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(ns)) throw new HttpError(400, { error: 'invalid namespace' });
  return ns;
};

// a claim/refresh build recalls the owner's whole memory: keep it to a few per minute per owner
const builds = new Map<string, number[]>();
function throttle(owner: string, now = Date.now()): void {
  const recent = (builds.get(owner) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 6) throw new HttpError(429, { error: 'too many passport builds for this address; wait a minute' });
  recent.push(now); builds.set(owner, recent);
  if (builds.size > 1000) builds.clear();
}

const view = (p: OnchainPassport | null) => (p ? { ...p, badge_names: badgeNames(p.badges), url: `${SUISCAN}/object/${p.id}` } : null);
const FIELDS = ['n_settled', 'wins', 'brier_bps', 'gap_bps', 'gap_negative', 'hidden', 'badges'] as const;

export async function buildClaimFor(ns: string, owner: string) {
  const existing = await passportOf(owner, true);
  if (existing) throw new HttpError(409, { error: 'this address already holds a passport; refresh it instead', passport: view(existing) });
  const [{ att, source }, reg] = await Promise.all([attestationFor(ns, owner), registryState().catch(() => ({ pubkey_hex: null, version: 0 }))]);
  await checkAttestation(att, ns, owner, reg.pubkey_hex);
  const sponsor = await sponsorFor(owner);
  const txBytes = await buildBytes(buildClaimTx(owner, att, { sponsor }));
  return { txBytes, sponsored: !!sponsor, fields: att.fields, badge_names: badgeNames(att.fields.badges), attestation_source: source, package: PASSPORT_PACKAGE, registry: PASSPORT_REGISTRY };
}

export async function buildRefreshFor(ns: string, owner: string) {
  const current = await passportOf(owner, true);
  if (!current) throw new HttpError(404, { error: 'no passport for this address yet; mint one first' });
  const [{ att, source }, reg] = await Promise.all([attestationFor(ns, owner), registryState().catch(() => ({ pubkey_hex: null, version: 0 }))]);
  await checkAttestation(att, ns, owner, reg.pubkey_hex);
  if (att.fields.issued_ms <= current.issued_ms) throw new HttpError(409, { error: 'the passport already holds the latest attestation', passport: view(current) });
  const sponsor = await sponsorFor(owner);
  const txBytes = await buildBytes(buildRefreshTx(owner, current.id, att, { sponsor }));
  const changed = FIELDS.filter((k) => (att.fields as any)[k] !== (current as any)[k]);
  return { txBytes, sponsored: !!sponsor, passportId: current.id, previous: view(current), fields: att.fields, changed, badge_names: badgeNames(att.fields.badges), attestation_source: source, package: PASSPORT_PACKAGE };
}

/**
 * For in-process signers with their OWN key (e.g. Council agents after the merge): mint the passport,
 * or refresh it when one exists. Pays gas from the signer's SUI. Never pass another process's key.
 */
export async function claimOrRefreshAs(kp: Ed25519Keypair, ns: string) {
  const owner = kp.toSuiAddress();
  const current = await passportOf(owner, true);
  const [{ att }, reg] = await Promise.all([attestationFor(ns, owner), registryState()]);
  await checkAttestation(att, ns, owner, reg.pubkey_hex);
  if (current && att.fields.issued_ms <= current.issued_ms) return { action: 'none' as const, passportId: current.id, digest: null, success: true, error: null };
  const r = await executeAs(kp, current ? buildRefreshTx(owner, current.id, att) : buildClaimTx(owner, att));
  forgetPassport(owner);
  return { action: current ? 'refresh' as const : 'claim' as const, ...r, passportId: r.passportId ?? current?.id ?? null };
}

export function passportOnchainRoutes(): Record<string, (...a: any[]) => unknown> {
  if (process.env.FEATURE_ONCHAIN_PASSPORT !== '1') return {};
  return {
    'GET /passport/:ns/onchain': async (_b: any, u: URL, p: Record<string, string>) => {
      const ns = needNs(p.ns), owner = needAddr(u.searchParams.get('owner'));
      const fresh = u.searchParams.get('fresh') === '1';
      const [passport, reg] = await Promise.all([passportOf(owner, fresh), registryState().catch(() => null)]);
      return {
        enabled: true, ns, owner, package: PASSPORT_PACKAGE, registry: PASSPORT_REGISTRY, type: PASSPORT_TYPE,
        attestor_pubkey_hex: reg?.pubkey_hex ?? null, passport: view(passport), ns_matches: passport ? passport.ns === ns : null,
      };
    },
    'POST /passport/:ns/claim-tx': async (b: any, _u: URL, p: Record<string, string>) => {
      const ns = needNs(p.ns), owner = needAddr(b.owner ?? b.address);
      throttle(owner);
      return buildClaimFor(ns, owner);
    },
    'POST /passport/:ns/refresh-tx': async (b: any, _u: URL, p: Record<string, string>) => {
      const ns = needNs(p.ns), owner = needAddr(b.owner ?? b.address);
      throttle(owner);
      return buildRefreshFor(ns, owner);
    },
  };
}
