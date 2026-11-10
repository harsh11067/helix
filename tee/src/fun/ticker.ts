// fun/ticker — F1 live proof ticker (NEXT_BIG.md §5): "N commits · M settled · last settled 3 min ago ·
// hidden 0", computed from chain events (every ConvictionCommitted ever emitted by helix::journal) and,
// for "hidden", from each committer's memory — refreshed in the background, never estimated.

import { gql } from '../shared/tatum.ts';
import { COMMIT_EVENT, parseCommitEvent, type CommitEvent } from '../memory/commit.ts';
import { recallForAddress } from '../memory/store.ts';
import { commitLedger } from '../memory/service.ts';

let all: CommitEvent[] = [];
let cursor: string | null = null;
let hiddenBySender = new Map<string, number | null>();
let at = 0, hiddenAt = 0, hiddenSynced = false;   // hidden is unknown until one full check has finished

/** All ConvictionCommitted events, fetched incrementally (forward pages from the last cursor).
 *  Single-flight: many callers share this log (the Council, passports, ledgers), and two syncs racing
 *  from the same cursor would append the same page twice. Events are also de-duplicated by key. */
let syncing: Promise<void> | null = null;
const seen = new Set<string>();
const evKey = (c: CommitEvent) => `${c.digest ?? ''}|${c.hash}|${c.expiry_ms}|${c.owner}`;
function syncEvents(): Promise<void> {
  return (syncing ??= syncEventsOnce().finally(() => { syncing = null; }));
}
async function syncEventsOnce(): Promise<void> {
  for (let page = 0; page < 20; page++) {
    const r: any = await gql('testnet', `query($t:String!,$a:String){ events(first:50, after:$a, filter:{type:$t}) {
      pageInfo { hasNextPage endCursor } nodes { contents { json } transaction { digest } } } }`, { t: COMMIT_EVENT, a: cursor });
    if (r.errors?.length) throw new Error(r.errors[0].message);
    const ev = r.data?.events;
    for (const n of ev?.nodes ?? []) {
      const c = parseCommitEvent(n.contents?.json, n.transaction?.digest);
      if (c && !seen.has(evKey(c))) { seen.add(evKey(c)); all.push(c); }
    }
    if (ev?.pageInfo?.endCursor) cursor = ev.pageInfo.endCursor;
    if (!ev?.pageInfo?.hasNextPage) break;
  }
}

async function syncHidden(): Promise<void> {
  const senders = [...new Set(all.map((e) => e.owner))];
  const next = new Map<string, number>();
  for (const s of senders) {
    const l: any = await commitLedger(s, await recallForAddress(s)).catch(() => null);
    // unknown (ledger unreadable or memory still being recalled) keeps the last known count, never becomes 0
    next.set(s, typeof l?.missing_memory === 'number' ? l.missing_memory : (hiddenBySender.get(s) ?? null));
  }
  hiddenBySender = next;
  hiddenAt = Date.now();
  hiddenSynced = true;
}

/** Every ConvictionCommitted event ever emitted (synced incrementally through Tatum, at most every 30s). */
export async function commitEvents(now = Date.now()): Promise<CommitEvent[]> {
  if (now - at > 60_000 || !all.length) { at = now; await syncEvents(); }
  return all.slice();
}

export async function ticker(now = Date.now()) {
  if (now - at > 60_000) { at = now; await syncEvents().catch((e) => console.warn('[ticker]', (e as Error).message)); }
  if (now - hiddenAt > 5 * 60_000) { hiddenAt = now; void syncHidden().catch((e) => console.warn('[ticker] hidden', (e as Error).message)); }
  const settled = all.filter((e) => e.expiry_ms <= now);
  const lastSettled = settled.reduce((m, e) => Math.max(m, e.expiry_ms), 0);
  const lastCommit = all.reduce((m, e) => Math.max(m, e.committed_ms), 0);
  const committers = new Set(all.map((e) => e.owner)).size;
  return {
    commits: all.length, settled: settled.length, pending: all.length - settled.length, committers,
    last_settled_ms: lastSettled || null, last_commit_ms: lastCommit || null,
    // null until every committer's memory has been checked at least once
    hidden: hiddenSynced && hiddenBySender.size && [...hiddenBySender.values()].every((v) => typeof v === 'number')
      ? [...hiddenBySender.values()].reduce((a: number, b) => a + (b as number), 0) : null,
    hidden_checked_ms: hiddenSynced ? hiddenAt : null,
    source: 'helix::journal ConvictionCommitted events on Sui testnet (via Tatum) · hidden from each committer\'s Walrus Memory',
  };
}
