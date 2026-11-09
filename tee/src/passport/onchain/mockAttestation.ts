// mockAttestation — stand-in for Lane A's `GET /passport/:ns/attestation?owner=` until it ships
// (LANES.md §0). Same JSON shape, same BCS layout, same HELIX_ATTESTATION_KEY, so passports minted
// from it verify against the same on-chain attestor key and can be refreshed from the real endpoint.
//
// "Mock" refers to the source, not the numbers: every field is computed from the owner's real
// Walrus Memory record and on-chain commit ledger (`timelineFor`), never invented. It covers wallet
// namespaces only (ns = namespaceFor(owner)); Council agents need the real endpoint.

import { normalizeSuiAddress } from '@mysten/sui/utils';
import { namespaceFor, type MemRecord } from '../../memory/format.ts';
import { attestorKeypair, badgesFor, signAttestation, toBps, type AttestationResponse } from './attestation.ts';

export const ATTESTATION_TTL_MS = Number(process.env.PASSPORT_ATTESTATION_TTL_MS ?? 10 * 60_000);
/** HELIX Council agents (Lane A, NEXT_BIG.md §2): their passports carry badge 8 (Council Member). */
export const COUNCIL_ADDRESSES = new Set([
  '0x92608f0b7b1f5872fa0b3a314b7aba05f228e45b24e19d197914a2e2949f7d31', // momentum
  '0xe89018db81101846e5526e56d7c758cf95d8e6099eb664f0386f9282097d5d58', // reversion
  '0x97dd8db5d9e2c5a88fd64ec36e6bcebecc97a561f265156100b54eed9be2fa3f', // surface
  '0x392a02dbb7829a518da3522feb621a9c2706f8010b0c4822aa29ed9a4df1a746', // crowd
]);
/** Brier for a forecaster with nothing settled: 0.25, the score of a coin flip (as Lane A's endpoint), never 0. */
export const UNSCORED_BRIER_BPS = 2_500;

export interface PassportStats {
  n_settled: number; wins: number; brier_bps: number; gap_bps: number; gap_negative: boolean; hidden: number; badges: number;
}

/**
 * Passport numbers from a `timelineFor(address)` result (memory/service.ts). Pure.
 * Throws when the on-chain commit ledger could not be read: `hidden` is never assumed to be 0.
 */
export function statsFromTimeline(t: any, settledRows: (recs: MemRecord[]) => { won: 0 | 1; p_mkt: number }[], owner?: string): PassportStats {
  const o = t?.overall;
  const c = t?.commits;
  if (!o || typeof o.n !== 'number') throw new Error('no calibration summary for this address');
  if (!c || c.error || typeof c.missing_memory !== 'number') throw new Error(`cannot count hidden commits right now${c?.error ? ` (${c.error})` : ''}; try again shortly`);
  const brierYou: number | null = o.brier?.you ?? null;
  const brier_bps = o.n > 0 && brierYou != null && Number.isFinite(brierYou) ? toBps(brierYou) : UNSCORED_BRIER_BPS;
  const gap: number = Number.isFinite(o.gap_you) && o.n > 0 ? o.gap_you : 0;
  const recs: MemRecord[] = (t.timeline ?? []).map((e: any) => ({ type: e.type, version: 1, f: e.fields ?? {}, text: e.text ?? '', blob_id: e.blob_id, created_at: e.created_at }));
  const rows = settledRows(recs);
  const contrarian_wins = rows.filter((r) => r.won === 1 && r.p_mkt < 0.5).length;
  const losses = Math.max(0, o.n - o.wins);   // settled losses, as Lane A's passport summary counts them
  const hidden = c.missing_memory;
  return {
    n_settled: o.n, wins: o.wins, brier_bps, gap_bps: toBps(Math.abs(gap)), gap_negative: gap < 0, hidden,
    badges: badgesFor({ n: o.n, brier_bps: o.n > 0 && brierYou != null ? brier_bps : null, losses, hidden, contrarian_wins, council: !!owner && COUNCIL_ADDRESSES.has(normalizeSuiAddress(owner)), assets_with_n3: 1 }),
  };
}

/** Sign an attestation for (`ns`, `owner`) over `stats`. */
export async function mockAttestation(ns: string, owner: string, stats: PassportStats, now = Date.now()): Promise<AttestationResponse> {
  const kp = attestorKeypair();
  if (!kp) throw new Error('HELIX_ATTESTATION_KEY is not configured on this server');
  return signAttestation({ owner: normalizeSuiAddress(owner), ns, ...stats, issued_ms: now, expires_ms: now + ATTESTATION_TTL_MS }, kp);
}

/** The full mock endpoint: live stats from Walrus Memory + the commit ledger, then sign. */
export async function mockAttestationFor(ns: string, owner: string): Promise<AttestationResponse> {
  const o = normalizeSuiAddress(owner);
  if (ns !== namespaceFor(o)) throw new Error('the interim attestation signer covers wallet namespaces only (ns = namespaceFor(owner))');
  const svc = await import('../../memory/service.ts');
  const t = await svc.timelineFor(o);
  return mockAttestation(ns, o, statsFromTimeline(t, svc.settledRows, o));
}
