// chain — helix_passport on Sui testnet: ids, transaction builders and reads (all through Tatum).
//
// Published 2026-11-09 by LANE_B_DEPLOYER (DEPLOYMENT.md "HELIX Forecaster Passport"):
//   publish     DXYCsg3SXN8dE4nngUzCmAh7yPkaLt65TjbNijZR4WTW
//   set_attestor HVz2K4j4WSxKSuRLWopVDz385inNL7dPYgp9umJFCN4k  (pubkey 18a0e777…6a6f = HELIX_ATTESTATION_KEY)
//
// `buildClaimTx` / `buildRefreshTx` are pure (no network) so in-process agents can build, sign with
// their OWN key, and execute (`executeAs`). The browser path builds bytes server-side (`buildBytes`).

import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { gql, suiClient, recordExecution } from '../../shared/tatum.ts';
import type { AttestationResponse } from './attestation.ts';
import { PASSPORT_SPONSOR_GAS_BUDGET } from './sponsor.ts';

export const PASSPORT_PACKAGE = normalizeSuiAddress(process.env.PASSPORT_PACKAGE_ID ?? '0xe4241667de38a2df7c286a8f3fbbeeb481c3aed1adb4cf5a17e0337d2dd7f4e3');
export const PASSPORT_REGISTRY = normalizeSuiAddress(process.env.PASSPORT_REGISTRY_ID ?? '0x7c6acbeee7273c0c0ea60192811338ce1f08ab31f2a35536d815f5d9b6ec57a7');
export const PASSPORT_TYPE = `${PASSPORT_PACKAGE}::passport::ForecasterPassport`;
export const PASSPORT_DISPLAY = '0x8c65d337e3fed137c8064d15e3c3c96c848369f2b82828b0bba2b086de498e69';
export const SUISCAN = 'https://suiscan.xyz/testnet';

const bytesOf = (b64: string) => [...Buffer.from(b64, 'base64')];

export interface BuildOpts { sponsor?: string | null }

function sponsorGas(tx: Transaction, o: BuildOpts) {
  if (o.sponsor) { tx.setGasOwner(o.sponsor); tx.setGasBudget(PASSPORT_SPONSOR_GAS_BUDGET); }
}

/** PTB: passport::claim(&mut registry, payload, sig, &Clock), sent by `owner`. */
export function buildClaimTx(owner: string, att: AttestationResponse, o: BuildOpts = {}): Transaction {
  const tx = new Transaction();
  tx.setSender(normalizeSuiAddress(owner));
  tx.moveCall({
    target: `${PASSPORT_PACKAGE}::passport::claim`,
    arguments: [tx.object(PASSPORT_REGISTRY), tx.pure.vector('u8', bytesOf(att.payload_b64)), tx.pure.vector('u8', bytesOf(att.sig_b64)), tx.object.clock()],
  });
  sponsorGas(tx, o);
  return tx;
}

/** PTB: passport::refresh(&mut passport, &registry, payload, sig, &Clock), sent by `owner`. */
export function buildRefreshTx(owner: string, passportId: string, att: AttestationResponse, o: BuildOpts = {}): Transaction {
  const tx = new Transaction();
  tx.setSender(normalizeSuiAddress(owner));
  tx.moveCall({
    target: `${PASSPORT_PACKAGE}::passport::refresh`,
    arguments: [tx.object(passportId), tx.object(PASSPORT_REGISTRY), tx.pure.vector('u8', bytesOf(att.payload_b64)), tx.pure.vector('u8', bytesOf(att.sig_b64)), tx.object.clock()],
  });
  sponsorGas(tx, o);
  return tx;
}

/** Build to base64 bytes via Tatum (the dry run surfaces Move aborts before any wallet prompt). */
export async function buildBytes(tx: Transaction): Promise<string> {
  try { return Buffer.from(await tx.build({ client: suiClient('testnet') as any })).toString('base64'); }
  catch (e) { throw friendlyAbort(e); }
}

/** Server-side signer (e.g. a Council agent with its own key): build, sign, execute through Tatum. */
export async function executeAs(kp: Ed25519Keypair, tx: Transaction): Promise<{ digest: string; success: boolean; error: string | null; passportId: string | null }> {
  tx.setSenderIfNotSet(kp.toSuiAddress());
  const client: any = suiClient('testnet');
  const bytes = Buffer.from(await buildBytes(tx), 'base64');
  const { signature } = await kp.signTransaction(bytes);
  const r: any = await client.executeTransaction({ transaction: bytes, signatures: [signature], include: { effects: true, objectTypes: true } });
  const t = r?.Transaction ?? r?.FailedTransaction ?? r;
  if (t?.digest) recordExecution('testnet', t.digest);
  return { digest: t?.digest, success: !!t?.effects?.status?.success, error: t?.effects?.status?.error ?? null, passportId: createdPassportId(t) };
}

/** The ForecasterPassport created by an executed claim (SDK v2 result), if any. */
export function createdPassportId(t: any): string | null {
  const types = t?.objectTypes ?? {};
  const hit = (t?.effects?.changedObjects ?? []).find((o: any) => o.idOperation === 'Created' && String(types[o.objectId] ?? '').endsWith('::passport::ForecasterPassport'));
  return hit?.objectId ?? null;
}

const ABORTS: Record<number, string> = {
  0: 'the passport registry has no attestor key yet',
  1: 'bad attestor public key',
  2: 'the attestation signature does not verify against the on-chain attestor key',
  3: 'this attestation was issued for a different address',
  4: 'the attestation expired; request a new one',
  5: 'the passport already holds this attestation or a newer one (anti-rollback)',
  6: 'the attestation is for a different memory namespace than this passport',
  7: 'this address already holds a passport; refresh it instead',
  8: 'malformed attestation payload',
};
/** Turn a dry-run MoveAbort in helix_passport::passport into a sentence; other errors pass through. */
export function friendlyAbort(e: unknown): Error {
  const msg = (e as Error)?.message ?? String(e);
  if (/::passport::/.test(msg)) {
    // GraphQL: "MoveAbort in 1st command, abort code: 7, in '0x…::passport::claim'"; JSON-RPC style: "MoveAbort(…, 7)"
    const m = msg.match(/abort code:?\s*(\d+)/i) ?? msg.match(/MoveAbort\(.*,\s*(\d+)\)/);
    const code = m ? Number(m[1]) : NaN;
    if (Number.isFinite(code) && ABORTS[code]) { const err = new Error(ABORTS[code]); (err as any).code = `EPASSPORT_${code}`; return err; }
  }
  return e as Error;
}

// ---------------------------------------------------------------- reads
export interface OnchainPassport {
  id: string; owner: string; ns: string; n_settled: number; wins: number; brier_bps: number; gap_bps: number;
  gap_negative: boolean; hidden: number; badges: number; issued_ms: number; version: number;
}
export function parsePassportJson(id: string, j: any): OnchainPassport | null {
  if (!j || j.owner == null) return null;
  const n = (k: string) => Number(j[k] ?? 0);
  return {
    id: normalizeSuiAddress(id), owner: normalizeSuiAddress(String(j.owner)), ns: String(j.ns ?? ''),
    n_settled: n('n_settled'), wins: n('wins'), brier_bps: n('brier_bps'), gap_bps: n('gap_bps'), gap_negative: j.gap_negative === true,
    hidden: n('hidden'), badges: n('badges'), issued_ms: n('issued_ms'), version: n('version'),
  };
}

const ownedCache = new Map<string, { at: number; v: OnchainPassport | null }>();
/** The owner's ForecasterPassport (one per address, enforced on-chain), 10s cache. */
export async function passportOf(owner: string, fresh = false): Promise<OnchainPassport | null> {
  const key = normalizeSuiAddress(owner), hit = ownedCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 10_000) return hit.v;
  const r: any = await gql('testnet', `query($a:SuiAddress!,$t:String!){ address(address:$a){ objects(filter:{type:$t}, first:5){ nodes { address contents { json } } } } }`, { a: key, t: PASSPORT_TYPE });
  if (r.errors?.length) throw new Error(r.errors[0].message ?? 'graphql error');
  const node = r.data?.address?.objects?.nodes?.[0];
  const v = node ? parsePassportJson(node.address, node.contents?.json) : null;
  ownedCache.set(key, { at: Date.now(), v });
  if (ownedCache.size > 500) ownedCache.clear();
  return v;
}
export const forgetPassport = (owner: string) => { ownedCache.delete(normalizeSuiAddress(owner)); };

/** `vector<u8>` as rendered by GraphQL JSON (number array, base64 or hex) → lowercase hex. */
export function vecHex(v: unknown): string | null {
  if (Array.isArray(v)) return Buffer.from(v.map(Number)).toString('hex');
  if (typeof v !== 'string' || !v) return null;
  if (/^(0x)?[0-9a-f]{64}$/i.test(v)) return v.replace(/^0x/i, '').toLowerCase();
  return Buffer.from(v, 'base64').toString('hex');
}

let regCache: { at: number; v: { pubkey_hex: string | null; version: number } } | null = null;
/** The registry's attestor key and version (5 min cache: it changes only on an admin rotation). */
export async function registryState(): Promise<{ pubkey_hex: string | null; version: number }> {
  if (regCache && Date.now() - regCache.at < 300_000) return regCache.v;
  const r: any = await gql('testnet', `query($id:SuiAddress!){ object(address:$id){ asMoveObject { contents { json } } } }`, { id: PASSPORT_REGISTRY });
  if (r.errors?.length) throw new Error(r.errors[0].message ?? 'graphql error');
  const j = r.data?.object?.asMoveObject?.contents?.json;
  const v = { pubkey_hex: vecHex(j?.pubkey), version: Number(j?.version ?? 0) };
  if (v.pubkey_hex && v.pubkey_hex.length === 64) regCache = { at: Date.now(), v };
  return v;
}

/** Testnet SUI held by an address (MIST). */
export async function suiBalance(owner: string): Promise<bigint> {
  const r: any = await gql('testnet', `query($a:SuiAddress!){ address(address:$a){ balance(coinType:"0x2::sui::SUI"){ totalBalance } } }`, { a: owner });
  return BigInt(r.data?.address?.balance?.totalBalance ?? 0);
}
