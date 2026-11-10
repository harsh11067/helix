// rows — from recalled memories to settled rows, and the Memory Time Machine replay (N1).
// Pure: no Node imports. Bundled for the browser with records.ts and calibration.ts, so the scrubber on the
// Memory page re-computes calibration "as of <time>" with exactly the code the server runs for the live page.

import { type MemRecord, str, num, assetOf, bucketOfConviction, recordTs, pYou } from './records.ts';
import { bucketStats, suggestCommit, oddsFromPrice, MIN_N, type SettledRow, type BucketStats, type CommitSuggestion } from './calibration.ts';

/** CONVICTION ⋈ OUTCOME (WIN/LOSS) by tx. BTC rows need every voice; ETH/SUI have no Predict market (P5). */
export function settledRows(recs: MemRecord[]): SettledRow[] {
  const outcomes = new Map<string, MemRecord>();
  for (const r of recs) if (r.type === 'OUTCOME' && str(r, 'tx')) outcomes.set(str(r, 'tx')!, r);
  const rows: SettledRow[] = [];
  for (const c of recs) {
    if (c.type !== 'CONVICTION') continue;
    const tx = str(c, 'tx'); const o = tx ? outcomes.get(tx) : undefined;
    const res = str(o, 'result');
    if (!o || (res !== 'WIN' && res !== 'LOSS')) continue;
    const pyou = num(c, 'p_you'), pm = num(c, 'p_mkt'), ph = num(c, 'p_hlx');
    if (pyou == null || (assetOf(c) === 'BTC' && (pm == null || ph == null))) continue;
    rows.push({
      tx: tx!, won: res === 'WIN' ? 1 : 0, p_you: pyou, p_mkt: pm, p_hlx: ph, p_crowd: num(c, 'p_crowd'), p_council: num(c, 'p_council'),
      structure: str(c, 'structure') ?? 'directional', regime: str(c, 'regime'),
      commit: num(c, 'commit') ?? 0, payoff: num(o, 'payoff'), ts: num(c, 'ts') ?? 0,
    });
  }
  return rows;
}

export const bucketOfRow = (recs: MemRecord[], tx: string): string | null => {
  const c = recs.find((r) => r.type === 'CONVICTION' && str(r, 'tx') === tx);
  return c ? bucketOfConviction(c) : null;
};

/** Settled rows grouped by calibration bucket. */
export function bucketRows(recs: MemRecord[], rows: SettledRow[]): Map<string, SettledRow[]> {
  const buckets = new Map<string, SettledRow[]>();
  for (const r of rows) { const b = bucketOfRow(recs, r.tx); if (b) (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(r); }
  return buckets;
}

// ---------------------------------------------------------------- time machine
/** The setup the scrubber answers "what would memory suggest?" for (the Canvas conviction, or the latest one remembered). */
export interface Setup { bucket: string; commit: number; p_you: number; price: number | null }

export interface ReplayState {
  at: number;                       // seconds; the moment replayed (Infinity = everything)
  count: number;                    // memories at or before `at`
  overall: BucketStats;
  buckets: { bucket: string; stats: BucketStats }[];
  lessons: { ts: number; bucket: string | null; text: string | null; blob_id?: string }[];
  suggestion: (CommitSuggestion & { bucket: string; n: number; posterior: number | null; gap_you: number | null }) | null;
}

export const recordsUpTo = (recs: MemRecord[], at: number) => (at === Infinity ? recs : recs.filter((r) => recordTs(r) <= at));

/** Calibration as of `at`, from the memories that existed then. At `Infinity` this is exactly the live page's state. */
export function replayState(recs: MemRecord[], at: number, setup: Setup | null = null): ReplayState {
  const then = recordsUpTo(recs, at);
  const rows = settledRows(then);
  const overall = bucketStats(rows);
  const buckets = [...bucketRows(then, rows)].map(([bucket, rs]) => ({ bucket, stats: bucketStats(rs) }));
  const lessons = then.filter((r) => r.type === 'LESSON').map((r) => ({ ts: recordTs(r), bucket: str(r, 'bucket'), text: str(r, 'text'), blob_id: r.blob_id }));
  let suggestion: ReplayState['suggestion'] = null;
  if (setup) {
    const st = buckets.find((b) => b.bucket === setup.bucket)?.stats ?? null;
    const b = setup.price != null ? oddsFromPrice(setup.price) : 1;
    const s = suggestCommit(setup.commit, setup.p_you, st, b);
    suggestion = { ...s, bucket: setup.bucket, n: st?.n ?? 0, posterior: st && st.n >= MIN_N ? st.posterior : null, gap_you: st?.gap_you ?? null };
  }
  return { at, count: then.length, overall, buckets, lessons, suggestion };
}

/** The setup of the latest remembered conviction (what the Memory page replays when the Canvas has none). */
export function latestSetup(recs: MemRecord[]): Setup | null {
  const c = [...recs].reverse().find((r) => r.type === 'CONVICTION' && bucketOfConviction(r));
  if (!c) return null;
  const conf = num(c, 'conf') ?? 0.5;
  return { bucket: bucketOfConviction(c)!, commit: num(c, 'commit') ?? 0, p_you: num(c, 'p_you') ?? pYou(conf * 100), price: num(c, 'price') };
}

export interface KeyMoment { ts: number; kind: 'first_lesson' | 'first_n3' | 'weights_shift' | 'first_outcome'; label: string }

/**
 * Moments worth a tick on the scrubber track: the first settled outcome, the first bucket to reach n ≥ 3
 * (memory starts changing the product), the first LESSON, and the biggest Council weight shift.
 */
export function keyMoments(recs: MemRecord[], councilHistory: { ts: number; weights: Record<string, number> }[] = []): KeyMoment[] {
  const out: KeyMoment[] = [];
  const sorted = [...recs].sort((a, b) => recordTs(a) - recordTs(b));
  const firstOutcome = sorted.find((r) => r.type === 'OUTCOME' && (str(r, 'result') === 'WIN' || str(r, 'result') === 'LOSS'));
  if (firstOutcome) out.push({ ts: recordTs(firstOutcome), kind: 'first_outcome', label: 'first settled call' });
  const firstLesson = sorted.find((r) => r.type === 'LESSON');
  if (firstLesson) out.push({ ts: recordTs(firstLesson), kind: 'first_lesson', label: 'first lesson' });
  const seen = new Map<string, number>();
  for (const r of sorted) {
    if (r.type !== 'OUTCOME') continue;
    const b = str(r, 'tx') ? bucketOfRow(sorted, str(r, 'tx')!) : null;
    if (!b) continue;
    const n = (seen.get(b) ?? 0) + 1; seen.set(b, n);
    if (n === MIN_N) { out.push({ ts: recordTs(r), kind: 'first_n3', label: `${b} reaches n=${MIN_N}` }); break; }
  }
  let best: KeyMoment | null = null, bestD = 0;
  for (let i = 1; i < councilHistory.length; i++) {
    const a = councilHistory[i - 1].weights, b = councilHistory[i].weights;
    const d = Object.keys({ ...a, ...b }).reduce((s, k) => s + Math.abs((b[k] ?? 0) - (a[k] ?? 0)), 0);
    if (d > bestD) { bestD = d; best = { ts: councilHistory[i].ts, kind: 'weights_shift', label: 'biggest Council re-weighting' }; }
  }
  if (best && bestD > 1e-6) out.push(best);
  return out.sort((a, b) => a.ts - b.ts);
}
