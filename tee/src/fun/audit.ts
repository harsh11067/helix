// fun/audit — continuous chain audit of every call ever committed (Proof-of-Forecast, through Tatum).
//
// The ticker and passports count ConvictionCommitted events from the event index. The audit re-derives
// each one from its own transaction, fetched through Tatum's Sui gateway, and checks it independently:
//   exists         the transaction is found by digest
//   success        it executed successfully
//   sender         its sender is the event's owner (sponsored commits included: the sponsor only pays gas)
//   event          the transaction's own ConvictionCommitted carries the same hash, market and expiry
//   before_expiry  its checkpoint timestamp (consensus time, not the Move Clock) is before the market's expiry,
//                  so the call provably predates the outcome
//   clock          the Move Clock value in the event is within 60s of that checkpoint time
// Full re-audits run on a schedule and are batched (BATCH transactions per GraphQL request) so they never
// crowd the shared 3 req/s queue. Chain data is immutable: a failure means the index, the gateway or the
// record disagree with each other, which is exactly what an audit exists to catch. Kill switch: AUDIT=0.

import { normalizeSuiAddress } from '@mysten/sui/utils';
import { gql, stats as tatumStats } from '../shared/tatum.ts';
import { parseCommitEvent, type CommitEvent } from '../memory/commit.ts';
import { commitEvents, ticker } from './ticker.ts';

export const AUDIT_CHECKS = ['exists', 'success', 'sender', 'event', 'before_expiry', 'clock'] as const;
export type AuditCheck = typeof AUDIT_CHECKS[number];
export interface CommitAudit { digest: string; owner: string; ok: boolean; failed: AuditCheck[]; checkpoint: number | null; tx_ms: number | null; lead_s: number | null }

const BATCH = 20;
const CLOCK_TOLERANCE_MS = 60_000;
const TX_FIELDS = `digest sender { address } effects { status timestamp checkpoint { sequenceNumber }
  events { nodes { contents { type { repr } json } } } }`;

const isCommitType = (repr: unknown) => typeof repr === 'string' && repr.endsWith('::journal::ConvictionCommitted');

/** Pure: one indexed commit event against the transaction Tatum returned for its digest (null = not found). */
export function auditCommit(ev: CommitEvent, tx: any): CommitAudit {
  const failed: AuditCheck[] = [];
  let txMs: number | null = null, checkpoint: number | null = null;
  if (!tx) failed.push('exists');
  else {
    if (tx.effects?.status !== 'SUCCESS') failed.push('success');
    const sender = tx.sender?.address ? normalizeSuiAddress(String(tx.sender.address)) : null;
    if (sender !== ev.owner) failed.push('sender');
    const own = (tx.effects?.events?.nodes ?? [])
      .map((n: any) => n?.contents)
      .filter((c: any) => isCommitType(c?.type?.repr))
      .map((c: any) => parseCommitEvent(c.json))
      .filter(Boolean) as CommitEvent[];
    if (!own.some((o) => o.owner === ev.owner && o.hash === ev.hash && o.oracle === ev.oracle && o.expiry_ms === ev.expiry_ms)) failed.push('event');
    const t = Date.parse(tx.effects?.timestamp ?? '');
    txMs = Number.isFinite(t) ? t : null;
    checkpoint = tx.effects?.checkpoint?.sequenceNumber != null ? Number(tx.effects.checkpoint.sequenceNumber) : null;
    if (txMs == null || txMs >= ev.expiry_ms) failed.push('before_expiry');
    if (txMs != null && Math.abs(txMs - ev.committed_ms) > CLOCK_TOLERANCE_MS) failed.push('clock');
  }
  return {
    digest: ev.digest ?? '', owner: ev.owner, ok: failed.length === 0, failed, checkpoint, tx_ms: txMs,
    lead_s: txMs == null ? null : Math.round((ev.expiry_ms - txMs) / 1000),
  };
}

/** Pure: roll per-commit results into the public summary. */
export function summarize(rows: CommitAudit[], extra: { started_ms: number; finished_ms: number; tatum_requests: number; hidden: number | null }) {
  // a transaction that can't be found can't pass any other check either: it counts as failing all of them
  const by = Object.fromEntries(AUDIT_CHECKS.map((c) => [c, rows.filter((r) => !r.failed.includes('exists') && !r.failed.includes(c)).length]));
  const leads = rows.map((r) => r.lead_s).filter((x): x is number => x != null).sort((a, b) => a - b);
  return {
    audited: rows.length,
    ok: rows.filter((r) => r.ok).length,
    passed: by,                                          // per check: how many commits pass it
    failures: rows.filter((r) => !r.ok).slice(0, 50).map((r) => ({ digest: r.digest, owner: r.owner, failed: r.failed })),
    min_lead_s: leads[0] ?? null,                        // the closest-to-expiry commit, in seconds before expiry
    median_lead_s: leads.length ? leads[Math.floor(leads.length / 2)] : null,
    hidden: extra.hidden,                                // commits whose call was never remembered (from the ticker)
    started_ms: extra.started_ms, finished_ms: extra.finished_ms, duration_ms: extra.finished_ms - extra.started_ms,
    tatum_requests: extra.tatum_requests,
    checks: {
      exists: 'transaction found by digest through Tatum', success: 'executed successfully',
      sender: "sender = the event's owner", event: "the transaction's own ConvictionCommitted has the same hash, market and expiry",
      before_expiry: "checkpoint (consensus) time is before the market's expiry", clock: 'Move Clock within 60s of checkpoint time',
    },
    source: "helix::journal ConvictionCommitted events, each re-fetched as a transaction through Tatum's Sui gateway (testnet)",
  };
}
export type AuditSummary = ReturnType<typeof summarize>;

/** Fetch transactions by digest, BATCH per GraphQL request (aliases + variables, no string interpolation of data). */
async function fetchTxs(digests: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  for (let i = 0; i < digests.length; i += BATCH) {
    const chunk = digests.slice(i, i + BATCH);
    const vars = Object.fromEntries(chunk.map((d, k) => [`d${k}`, d]));
    const q = `query(${chunk.map((_, k) => `$d${k}: String!`).join(', ')}) { ${chunk.map((_, k) => `t${k}: transaction(digest: $d${k}) { ${TX_FIELDS} }`).join(' ')} }`;
    const r: any = await gql('testnet', q, vars);
    if (!r.data && r.errors?.length) throw new Error(r.errors[0].message);
    chunk.forEach((d, k) => out.set(d, r.data?.[`t${k}`] ?? null));
  }
  return out;
}

let last: AuditSummary | null = null;
let running: Promise<AuditSummary> | null = null;

export function runAudit(): Promise<AuditSummary> {
  running ??= (async () => {
    const started = Date.now(), req0 = tatumStats.requests;
    const events = (await commitEvents()).filter((e) => e.digest);
    const txs = await fetchTxs(events.map((e) => e.digest!));
    const rows = events.map((e) => auditCommit(e, txs.get(e.digest!) ?? null));
    const t = await ticker().catch(() => null);
    last = summarize(rows, { started_ms: started, finished_ms: Date.now(), tatum_requests: tatumStats.requests - req0, hidden: t?.hidden_checked_ms ? t.hidden : null });   // unknown until the ticker has checked memory
    const bad = last.audited - last.ok;
    console.log(`[audit] ${last.ok}/${last.audited} commits re-verified through Tatum in ${last.duration_ms}ms (${last.tatum_requests} requests)${bad ? ` — ${bad} FAILED` : ''}`);
    return last;
  })().finally(() => { running = null; });
  return running;
}

/** The latest audit (runs one if none has completed yet). */
export async function latestAudit(): Promise<AuditSummary | { status: 'running' | 'unavailable'; reason?: string }> {
  if (last) return last;
  try { return await runAudit(); } catch (e) { return { status: 'unavailable', reason: (e as Error).message.slice(0, 160) }; }
}
export const lastAudit = () => last;

let started = false;
export function startAudit(everyMs = 30 * 60_000): void {
  if (started || process.env.OFFLINE === '1' || process.env.AUDIT === '0') return;
  started = true;
  const run = () => { runAudit().catch((e) => console.warn('[audit]', (e as Error).message)); };
  setTimeout(run, 90_000).unref?.();           // after startup warm-up
  setInterval(run, everyMs).unref?.();
}
