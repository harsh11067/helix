// attestation — the HELIX Forecaster Passport attestation (LANES.md §0), shared by Lane A's
// `GET /passport/:ns/attestation` endpoint and Lane B's on-chain claim path.
//
//   payload = BCS(Attestation { owner: address, ns: String, n_settled: u64, wins: u64, brier_bps: u64,
//                               gap_bps: u64, gap_negative: bool, hidden: u64, badges: u64,
//                               issued_ms: u64, expires_ms: u64 })
//   sig     = raw Ed25519 signature over the payload bytes (NOT an intent-wrapped personal message)
//
// `helix_passport::passport::claim/refresh` verifies exactly this with `sui::ed25519::ed25519_verify`
// and decodes it with `sui::bcs` (field order matters). Test vectors generated from this file are
// verified inside a Move test (contracts-passport/tests/vectors.move), so the two provably agree.

import { bcs } from '@mysten/sui/bcs';
import { Ed25519Keypair, Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { normalizeSuiAddress, isValidSuiAddress } from '@mysten/sui/utils';

export const AttestationBcs = bcs.struct('Attestation', {
  owner: bcs.Address,
  ns: bcs.string(),
  n_settled: bcs.u64(),
  wins: bcs.u64(),
  brier_bps: bcs.u64(),
  gap_bps: bcs.u64(),
  gap_negative: bcs.bool(),
  hidden: bcs.u64(),
  badges: bcs.u64(),
  issued_ms: bcs.u64(),
  expires_ms: bcs.u64(),
});

export interface AttestationFields {
  owner: string;
  ns: string;
  n_settled: number;
  wins: number;
  brier_bps: number;
  gap_bps: number;
  gap_negative: boolean;
  hidden: number;
  badges: number;
  issued_ms: number;
  expires_ms: number;
}

/** The JSON shape of `GET /passport/:ns/attestation?owner=` (LANES.md §0). */
export interface AttestationResponse {
  payload_b64: string;
  sig_b64: string;
  pubkey_hex: string;
  fields: AttestationFields;
}

const U64_FIELDS = ['n_settled', 'wins', 'brier_bps', 'gap_bps', 'hidden', 'badges', 'issued_ms', 'expires_ms'] as const;

/** Normalizes and range-checks the fields; throws on anything the Move decoder would read differently. */
export function normalizeFields(f: AttestationFields): AttestationFields {
  if (!f || typeof f.owner !== 'string' || !isValidSuiAddress(normalizeSuiAddress(f.owner))) throw new Error('attestation: invalid owner');
  if (typeof f.ns !== 'string' || !f.ns || f.ns.length > 128) throw new Error('attestation: invalid ns');
  const out: any = { owner: normalizeSuiAddress(f.owner), ns: f.ns, gap_negative: f.gap_negative === true };
  for (const k of U64_FIELDS) {
    const v = Number((f as any)[k]);
    if (!Number.isSafeInteger(v) || v < 0) throw new Error(`attestation: ${k} must be a non-negative integer`);
    out[k] = v;
  }
  if (typeof f.gap_negative !== 'boolean') throw new Error('attestation: gap_negative must be a boolean');
  return out as AttestationFields;
}

/** BCS bytes of the attestation, in LANES.md §0 field order. */
export function encodeAttestation(f: AttestationFields): Uint8Array {
  const n = normalizeFields(f);
  return AttestationBcs.serialize(n).toBytes();
}

/** Inverse of `encodeAttestation` (rejects trailing bytes, like the Move decoder). */
export function decodeAttestation(bytes: Uint8Array): AttestationFields {
  const v: any = AttestationBcs.parse(bytes);
  if (AttestationBcs.serialize(v).toBytes().length !== bytes.length) throw new Error('attestation: trailing bytes');
  const out: any = { owner: normalizeSuiAddress(v.owner), ns: v.ns, gap_negative: v.gap_negative };
  for (const k of U64_FIELDS) out[k] = Number(v[k]);
  return out as AttestationFields;
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

/** Sign the attestation (raw Ed25519 over the BCS payload) and return the endpoint's JSON shape. */
export async function signAttestation(fields: AttestationFields, kp: Ed25519Keypair): Promise<AttestationResponse> {
  const f = normalizeFields(fields);
  const payload = encodeAttestation(f);
  const sig = await kp.sign(payload);
  return { payload_b64: b64(payload), sig_b64: b64(sig), pubkey_hex: hex(kp.getPublicKey().toRawBytes()), fields: f };
}

/**
 * Check an attestation response the way the chain will: the signature verifies over the payload with
 * `expectedPubkeyHex` (or the response's own key when omitted), and `fields` equal the decoded payload.
 * Returns the reason it fails, or null.
 */
export async function attestationProblem(r: AttestationResponse, expectedPubkeyHex?: string | null): Promise<string | null> {
  if (!r || typeof r.payload_b64 !== 'string' || typeof r.sig_b64 !== 'string') return 'malformed attestation response';
  const pkHex = (expectedPubkeyHex ?? r.pubkey_hex ?? '').toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(pkHex)) return 'no attestor public key';
  if (r.pubkey_hex && r.pubkey_hex.toLowerCase().replace(/^0x/, '') !== pkHex) return 'signed by a different attestor key than the on-chain registry holds';
  const payload = Uint8Array.from(Buffer.from(r.payload_b64, 'base64'));
  const sig = Uint8Array.from(Buffer.from(r.sig_b64, 'base64'));
  if (sig.length !== 64) return 'signature must be 64 bytes';
  let decoded: AttestationFields;
  try { decoded = decodeAttestation(payload); } catch (e) { return (e as Error).message; }
  const ok = await new Ed25519PublicKey(Buffer.from(pkHex, 'hex')).verify(payload, sig).catch(() => false);
  if (!ok) return 'signature does not verify';
  if (r.fields) {
    let f: AttestationFields;
    try { f = normalizeFields(r.fields); } catch (e) { return (e as Error).message; }
    for (const k of Object.keys(decoded) as (keyof AttestationFields)[]) if (f[k] !== decoded[k]) return `fields.${k} differs from the signed payload`;
  }
  return null;
}

/** Ed25519 keypair from `suiprivkey…`, or 32 raw bytes in hex / base64. */
export function keypairFrom(secret: string): Ed25519Keypair {
  const s = secret.trim();
  if (s.startsWith('suiprivkey')) {
    const d: any = decodeSuiPrivateKey(s);
    if (d.scheme !== 'ED25519') throw new Error('attestation key must be Ed25519');
    return Ed25519Keypair.fromSecretKey(d.secretKey);
  }
  const raw = /^(0x)?[0-9a-fA-F]{64}$/.test(s) ? Buffer.from(s.replace(/^0x/, ''), 'hex') : Buffer.from(s, 'base64');
  if (raw.length !== 32) throw new Error('attestation key must be 32 bytes');
  return Ed25519Keypair.fromSecretKey(raw);
}

let attestorKp: Ed25519Keypair | null | undefined;
/** The HELIX attestation signer from `HELIX_ATTESTATION_KEY` (server-side only), or null. */
export function attestorKeypair(): Ed25519Keypair | null {
  if (attestorKp !== undefined) return attestorKp;
  const k = process.env.HELIX_ATTESTATION_KEY?.trim();
  try { attestorKp = k ? keypairFrom(k) : null; } catch { attestorKp = null; }
  return attestorKp;
}
/** Test hook. */
export function __setAttestor(kp: Ed25519Keypair | null): void { attestorKp = kp; }
export const attestorPubkeyHex = (): string | null => {
  const kp = attestorKeypair();
  return kp ? hex(kp.getPublicKey().toRawBytes()) : null;
};

// ---------------------------------------------------------------- badges (shared bitmask, LANES.md §2)
export const BADGE = { CALIBRATED: 1, HONEST_LOSER: 2, CONTRARIAN: 4, COUNCIL_MEMBER: 8, MULTI_ASSET: 16 } as const;
export const BADGE_LABEL: Record<number, string> = {
  1: 'Calibrated', 2: 'Honest Loser', 4: 'Contrarian', 8: 'Council Member', 16: 'Multi-asset',
};

export interface BadgeInputs {
  n: number;                 // settled calls
  brier_bps: number | null;  // your Brier in basis points (null = not scored)
  losses: number;            // committed calls that settled as a loss
  hidden: number;            // on-chain commits with no memory (cherry-picking signal)
  contrarian_wins: number;   // wins where the market leaned against your call (p_mkt < 0.5)
  council?: boolean;         // a HELIX Council agent
  assets_with_n3?: number;   // assets with n >= 3 settled
}

/** Badge bits from real counts only: 1 Calibrated · 2 Honest Loser · 4 Contrarian · 8 Council · 16 Multi-asset. */
export function badgesFor(s: BadgeInputs): number {
  let b = 0;
  if (s.brier_bps != null && s.brier_bps < 2000 && s.n >= 10) b |= BADGE.CALIBRATED;
  if (s.losses >= 10 && s.hidden === 0) b |= BADGE.HONEST_LOSER;
  if (s.contrarian_wins >= 5) b |= BADGE.CONTRARIAN;
  if (s.council) b |= BADGE.COUNCIL_MEMBER;
  if ((s.assets_with_n3 ?? 0) >= 2) b |= BADGE.MULTI_ASSET;
  return b;
}
export const badgeNames = (bits: number) => Object.entries(BADGE_LABEL).filter(([k]) => (bits & Number(k)) !== 0).map(([, v]) => v);

/** A probability-space score (0..1) → basis points, rounded. */
export const toBps = (x: number) => Math.max(0, Math.round(x * 10_000));
