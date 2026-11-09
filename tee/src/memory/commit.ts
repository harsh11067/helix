// commit — Commit mode (RECOVERY.md §1): paper convictions with on-chain commit–reveal.
//
// The CONVICTION body (every field except hash / tx / commit_tx) is hashed with sha256 and
// committed on Sui testnet via `helix::journal::commit(hash, market, expiry_ms, clock)` BEFORE
// the market settles. The memory written to Walrus is `body | hash=… | tx=… | commit_tx=…`;
// anyone can strip those three fields, re-hash, and compare with the on-chain event.
// Pure helpers here (unit-tested); the build/record/resolve flow lives in service.ts.

import { createHash } from 'node:crypto';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { gql } from '../shared/tatum.ts';
import { isSponsorablePassportCall } from '../passport/onchain/sponsor.ts';

/** v5 of the HELIX package: first version defining `journal` → call target AND event type identity. */
export const JOURNAL_PKG = normalizeSuiAddress(process.env.HELIX_JOURNAL_PACKAGE ?? '0x5bcf3bf66f6c71f53aaf681842b554edde5b6c141c7315ba0ac6b4cd6766652f');
export const COMMIT_EVENT = `${JOURNAL_PKG}::journal::ConvictionCommitted`;
export const CLOCK = '0x6';

export const sha256hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const UNHASHED = /^(hash|tx|commit_tx)=/;
/** The committed body: the memory line without the fields only known after signing. */
export function commitBody(text: string): string {
  return String(text).split(' | ').filter((seg) => !UNHASHED.test(seg.trim())).join(' | ');
}
/** Memory line = body + hash + the commit digest (also `tx`, so OUTCOME/CALIBRATION link as for mints). */
export const commitMemoryText = (body: string, hash: string, digest: string) => `${body} | hash=${hash} | tx=${digest} | commit_tx=${digest}`;
/** True when sha256(body of `text`) equals the on-chain committed hash. */
export const verifyReveal = (text: string, onchainHashHex: string | null | undefined) =>
  !!onchainHashHex && sha256hex(commitBody(text)) === onchainHashHex.toLowerCase();

/** `vector<u8>` as rendered by GraphQL JSON (number array, base64 or hex) → lowercase hex. */
export function hashHex(v: unknown): string | null {
  if (Array.isArray(v)) return Buffer.from(v.map(Number)).toString('hex');
  if (typeof v !== 'string' || !v) return null;
  if (/^(0x)?[0-9a-f]{64}$/i.test(v)) return v.replace(/^0x/i, '').toLowerCase();
  const b = Buffer.from(v, 'base64');
  return b.length === 32 ? b.toString('hex') : null;
}

export interface CommitEvent { owner: string; hash: string | null; oracle: string; expiry_ms: number; committed_ms: number; digest?: string }
export function parseCommitEvent(json: any, digest?: string): CommitEvent | null {
  if (!json || json.owner == null) return null;
  return {
    owner: normalizeSuiAddress(String(json.owner)), hash: hashHex(json.hash), oracle: normalizeSuiAddress(String(json.oracle)),
    expiry_ms: Number(json.expiry_ms), committed_ms: Number(json.committed_ms), digest,
  };
}

/** The ConvictionCommitted event(s) inside an executed transaction (SDK v2 result or GraphQL). */
export function commitEventsOf(txResult: any): CommitEvent[] {
  const t = txResult?.Transaction ?? txResult?.transaction ?? txResult;
  const evs: any[] = t?.events ?? [];
  return evs
    .filter((e) => String(e.eventType ?? e.type ?? e.contents?.type?.repr ?? '').replace(/^0x0*/, '0x').endsWith('::journal::ConvictionCommitted')
      && normalizeSuiAddress(String(e.eventType ?? e.type ?? e.contents?.type?.repr).split('::')[0]) === JOURNAL_PKG)
    .map((e) => parseCommitEvent(e.json ?? e.parsedJson ?? e.contents?.json, t?.digest))
    .filter((x): x is CommitEvent => !!x);
}

/** Checks a commit event against the body it claims to commit. Returns the reason it fails, or null. */
export function checkCommit(ev: CommitEvent | undefined, body: { address: string; hash: string; market: string; expiryMs: number }): string | null {
  if (!ev) return 'no ConvictionCommitted event in that transaction';
  if (ev.owner !== normalizeSuiAddress(body.address)) return 'committed by a different address';
  if (ev.hash !== body.hash) return 'on-chain hash does not match sha256(conviction text)';
  if (ev.oracle !== normalizeSuiAddress(body.market)) return 'committed market differs from the conviction';
  if (ev.expiry_ms !== body.expiryMs) return 'committed expiry differs from the conviction';
  if (!(ev.committed_ms < ev.expiry_ms)) return 'committed after expiry';
  return null;
}

/** PTB: journal::commit(hash, market, expiry_ms, &Clock). */
export function commitTx(sender: string, hashHexStr: string, market: string, expiryMs: number): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({
    target: `${JOURNAL_PKG}::journal::commit`,
    arguments: [tx.pure.vector('u8', [...Buffer.from(hashHexStr, 'hex')]), tx.pure.address(market), tx.pure.u64(BigInt(expiryMs)), tx.object.clock()],
  });
  return tx;
}

/** Every ConvictionCommitted by `owner`, from chain events via Tatum (the anti-cherry-picking source). 15s cache. */
const commitsCache = new Map<string, { at: number; v: CommitEvent[] }>();
export async function commitsBy(owner: string, max = 500): Promise<CommitEvent[]> {
  const key = normalizeSuiAddress(owner), hit = commitsCache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.v;
  const v = await commitsByUncached(key, max);
  commitsCache.set(key, { at: Date.now(), v });
  if (commitsCache.size > 200) commitsCache.clear();
  return v;
}
async function commitsByUncached(owner: string, max: number): Promise<CommitEvent[]> {
  const out: CommitEvent[] = [];
  let after: string | null = null;
  for (let page = 0; page < Math.ceil(max / 50); page++) {
    const r: any = await gql('testnet', `query($t:String!,$s:SuiAddress!,$a:String){ events(first:50, after:$a, filter:{type:$t, sender:$s}) {
      pageInfo { hasNextPage endCursor } nodes { contents { json } transaction { digest } } } }`, { t: COMMIT_EVENT, s: normalizeSuiAddress(owner), a: after });
    if (r.errors?.length) throw new Error(r.errors[0].message ?? 'graphql error');
    const ev = r.data?.events;
    for (const n of ev?.nodes ?? []) { const c = parseCommitEvent(n.contents?.json, n.transaction?.digest); if (c) out.push(c); }
    if (!ev?.pageInfo?.hasNextPage) break;
    after = ev.pageInfo.endCursor;
  }
  return out;
}

// ---------------------------------------------------------------- sponsored commits (gas paid by HELIX)
// A new zkLogin or wallet address has no testnet SUI, so committing would fail on gas. When
// SPONSOR_SUI_KEY is set, HELIX pays the gas for journal::commit — and ONLY for that: the sponsor
// co-signs a transaction solely if it is exactly one journal::commit call, its gas owner is the
// sponsor, the budget is capped, and the sender is under a daily limit.
export const SPONSOR_GAS_BUDGET = 4_000_000;      // MIST; a commit only emits an event
const SPONSOR_DAILY_LIMIT = Number(process.env.SPONSOR_DAILY_LIMIT ?? 40);
// global cap: fresh addresses cost nothing to make, so the per-sender limit alone cannot stop a drain
const SPONSOR_HOURLY_LIMIT = Number(process.env.SPONSOR_HOURLY_LIMIT ?? 30);
const sponsoredAll: number[] = [];
let sponsorKp: Ed25519Keypair | null | undefined;
export function sponsor(): Ed25519Keypair | null {
  if (sponsorKp !== undefined) return sponsorKp;
  const sk = process.env.SPONSOR_SUI_KEY?.trim();
  try { sponsorKp = sk ? Ed25519Keypair.fromSecretKey((decodeSuiPrivateKey(sk) as any).secretKey) : null; }
  catch { sponsorKp = null; }
  return sponsorKp;
}
export const sponsorAddress = () => sponsor()?.toSuiAddress() ?? null;
/** Test hook. */
export function __setSponsor(kp: Ed25519Keypair | null): void { sponsorKp = kp; sponsoredBy.clear(); sponsoredAll.length = 0; }

const sponsoredBy = new Map<string, number[]>();
function underDailyLimit(sender: string, now = Date.now()): boolean {
  const recent = (sponsoredBy.get(sender) ?? []).filter((t) => now - t < 86_400_000);
  sponsoredBy.set(sender, recent);
  return recent.length < SPONSOR_DAILY_LIMIT;
}

/**
 * If `txBytesB64` asks the sponsor to pay gas, return the reason it may not, or null when it is a valid
 * sponsored journal::commit. `undefined` means the transaction is not sponsored at all.
 */
export function sponsorRefusal(txBytesB64: string): string | null | undefined {
  const sp = sponsorAddress();
  if (!sp) return undefined;
  let data: any;
  try { data = Transaction.from(txBytesB64).getData(); } catch { return undefined; }
  const owner = data?.gasData?.owner ? normalizeSuiAddress(data.gasData.owner) : null;
  if (owner !== sp) return undefined;
  const cmds = data.commands ?? [];
  const call = cmds[0]?.MoveCall;
  const isCommit = cmds.length === 1 && !!call && normalizeSuiAddress(call.package) === JOURNAL_PKG && call.module === 'journal' && call.function === 'commit';
  if (isCommit) { if (Number(data.gasData.budget ?? Infinity) > SPONSOR_GAS_BUDGET) return 'sponsored gas budget too high'; }
  else {
    // the on-chain Forecaster Passport (claim / refresh) is the only other call HELIX pays gas for
    const why = process.env.PASSPORT_SPONSOR === '0' ? 'passport sponsorship is off' : isSponsorablePassportCall(data);
    if (why) return why.startsWith('HELIX only sponsors a single') ? 'HELIX only sponsors gas for helix::journal::commit and the passport claim/refresh' : why;
  }
  const sender = normalizeSuiAddress(data.sender ?? '');
  if (sender === sp) return 'sponsor cannot be the sender';
  if (!underDailyLimit(sender)) return `daily sponsored-commit limit reached (${SPONSOR_DAILY_LIMIT}); fund this address with testnet SUI to keep committing`;
  const now = Date.now();
  while (sponsoredAll.length && now - sponsoredAll[0] > 3_600_000) sponsoredAll.shift();
  if (sponsoredAll.length >= SPONSOR_HOURLY_LIMIT) return 'HELIX is sponsoring many commits right now; fund this address with testnet SUI or try again later';
  return null;
}

/** Co-sign a validated sponsored commit; records it against the sender's daily limit. */
export async function sponsorSign(txBytesB64: string): Promise<string> {
  const kp = sponsor();
  if (!kp) throw new Error('no sponsor configured');
  const data: any = Transaction.from(txBytesB64).getData();
  const sender = normalizeSuiAddress(data.sender);
  sponsoredBy.set(sender, [...(sponsoredBy.get(sender) ?? []), Date.now()]);
  sponsoredAll.push(Date.now());
  return (await kp.signTransaction(Uint8Array.from(Buffer.from(txBytesB64, 'base64')))).signature;
}
