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
import { gql } from '../shared/tatum.ts';

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
    arguments: [tx.pure.vector('u8', [...Buffer.from(hashHexStr, 'hex')]), tx.pure.address(market), tx.pure.u64(BigInt(expiryMs)), tx.object(CLOCK)],
  });
  return tx;
}

/** Every ConvictionCommitted by `owner`, from chain events via Tatum (the anti-cherry-picking source). */
export async function commitsBy(owner: string, max = 500): Promise<CommitEvent[]> {
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
