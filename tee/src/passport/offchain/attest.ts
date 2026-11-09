// passport/offchain/attest — the HELIX attestation key and the two signed forms of a passport.
//
//  1. Signed JSON (P2): raw Ed25519 over the UTF-8 bytes of the passport's canonical JSON
//     (keys sorted recursively). Anyone can verify offline with the public key published at
//     /.well-known/helix-attestation.json (tee/scripts/verify-attestation.mjs).
//  2. BCS attestation (LANES.md §0, the contract with the on-chain passport): raw Ed25519 over
//     BCS(Attestation{owner, ns, n_settled, wins, brier_bps, gap_bps, gap_negative, hidden, badges,
//     issued_ms, expires_ms}) — what `helix_passport::passport::claim` checks with ed25519_verify.

import { Ed25519Keypair, Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';

let kp: Ed25519Keypair | null | undefined;
export function attestationKey(): Ed25519Keypair | null {
  if (kp !== undefined) return kp;
  const sk = process.env.HELIX_ATTESTATION_KEY?.trim();
  try { kp = sk ? Ed25519Keypair.fromSecretKey((decodeSuiPrivateKey(sk) as any).secretKey) : null; } catch { kp = null; }
  return kp;
}
/** Test hook. */
export function __setAttestationKey(k: Ed25519Keypair | null): void { kp = k; }
export const pubkeyHex = () => { const k = attestationKey(); return k ? Buffer.from(k.getPublicKey().toRawBytes()).toString('hex') : null; };

/** Deterministic JSON: object keys sorted at every depth; no whitespace. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export async function signJson(passport: unknown): Promise<{ alg: 'ed25519'; pubkey_hex: string; sig_b64: string; signed: string }> {
  const k = attestationKey();
  if (!k) throw new Error('HELIX_ATTESTATION_KEY not configured');
  const sig = await k.sign(new TextEncoder().encode(canonicalJson(passport)));
  return { alg: 'ed25519', pubkey_hex: pubkeyHex()!, sig_b64: Buffer.from(sig).toString('base64'), signed: 'raw Ed25519 over the UTF-8 bytes of canonical JSON (keys sorted) of `passport`' };
}

export async function verifyJson(passport: unknown, sigB64: string, pubHex: string): Promise<boolean> {
  try {
    const pk = new Ed25519PublicKey(Buffer.from(pubHex, 'hex'));
    return await pk.verify(new TextEncoder().encode(canonicalJson(passport)), Buffer.from(sigB64, 'base64'));
  } catch { return false; }
}

// ---------------------------------------------------------------- BCS attestation (LANES.md §0)
export const AttestationBcs = bcs.struct('Attestation', {
  owner: bcs.Address, ns: bcs.string(), n_settled: bcs.u64(), wins: bcs.u64(), brier_bps: bcs.u64(),
  gap_bps: bcs.u64(), gap_negative: bcs.bool(), hidden: bcs.u64(), badges: bcs.u64(), issued_ms: bcs.u64(), expires_ms: bcs.u64(),
});
export interface AttestationFields {
  owner: string; ns: string; n_settled: number; wins: number; brier_bps: number; gap_bps: number; gap_negative: boolean;
  hidden: number; badges: number; issued_ms: number; expires_ms: number;
}

export async function signAttestation(f: AttestationFields): Promise<{ payload_b64: string; sig_b64: string; pubkey_hex: string; fields: AttestationFields }> {
  const k = attestationKey();
  if (!k) throw new Error('HELIX_ATTESTATION_KEY not configured');
  const payload = AttestationBcs.serialize({ ...f, n_settled: BigInt(f.n_settled), wins: BigInt(f.wins), brier_bps: BigInt(f.brier_bps), gap_bps: BigInt(f.gap_bps), hidden: BigInt(f.hidden), badges: BigInt(f.badges), issued_ms: BigInt(f.issued_ms), expires_ms: BigInt(f.expires_ms) }).toBytes();
  const sig = await k.sign(payload);
  return { payload_b64: Buffer.from(payload).toString('base64'), sig_b64: Buffer.from(sig).toString('base64'), pubkey_hex: pubkeyHex()!, fields: f };
}

// ---------------------------------------------------------------- badges (bitmask shared with the on-chain passport)
export const BADGES = [
  { bit: 1, name: 'Calibrated', rule: 'Brier < 0.20 with n ≥ 10 settled' },
  { bit: 2, name: 'Honest Loser', rule: '≥ 10 committed losses, hidden 0' },
  { bit: 4, name: 'Contrarian', rule: 'won against the market\'s lean ≥ 5 times' },
  { bit: 8, name: 'Council Member', rule: 'one of the HELIX Council agents' },
  { bit: 16, name: 'Multi-asset', rule: 'n ≥ 3 settled in ≥ 2 assets' },
] as const;
export function badgeMask(x: { n: number; brier: number | null; losses: number; hidden: number; contrarianWins: number; councilMember: boolean; assetsWith3: number }): number {
  let m = 0;
  if (x.n >= 10 && x.brier != null && x.brier < 0.2) m |= 1;
  if (x.losses >= 10 && x.hidden === 0) m |= 2;
  if (x.contrarianWins >= 5) m |= 4;
  if (x.councilMember) m |= 8;
  if (x.assetsWith3 >= 2) m |= 16;
  return m;
}
export const badgeNames = (mask: number) => BADGES.filter((b) => mask & b.bit).map((b) => b.name);
