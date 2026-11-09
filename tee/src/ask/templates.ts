// templates — "Ask your memory", Plan B (LANES.md §4): deterministic answers from parsed calibration.
//
// Free text maps to the nearest of 13 question templates by keyword scoring. Every answer is computed
// from the forecaster's own Walrus Memory records with the existing calibration math (bucketStats,
// settledRows) and cites the records its numbers came from (memories_used, with blob ids). An answer
// with no cited memories is the no-data reply. Numbers always carry their n. Pure: no I/O here.

import { str, num, bucketOfConviction, confBand, type MemRecord } from '../memory/format.ts';
import { bucketStats, MIN_N, RANGEISH, type SettledRow, type BucketStats } from '../memory/calibration.ts';
import { settledRows } from '../memory/service.ts';

export const NO_DATA = "I don't have memories about that yet.";

export interface Cited { text: string; blob_id: string; type: string }
export interface StatsAnswer { answer: string; template: string | null; memories_used: Cited[]; memories_total: number; n: number | null }
export interface CommitLedger { onchain: number; with_memory: number; missing_memory: number; recording?: number }
export interface AskData {
  recs: MemRecord[];                                   // the forecaster's records (recallAll(ns))
  now: number;                                         // ms
  ledger?: CommitLedger | null;                        // on-chain commits vs memories (hidden template)
  council?: { name: string; recs: MemRecord[] }[] | null;   // Council agents' own records (council template)
}

// ---------------------------------------------------------------- formatting
const pct = (p: number | null | undefined) => (p == null || !Number.isFinite(p) ? 'n/a' : `${Math.round(p * 100)}%`);
const b2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(2));
const calls = (n: number, word = 'calls') => `${n} ${n === 1 ? word.replace(/s$/, '') : word}`;
const pts = (x: number) => `${Math.round(Math.abs(x) * 100)} points`;
const DIR: Record<string, string> = { up: 'bullish', down: 'bearish', neutral: 'neutral' };
const BAND: Record<string, string> = { high: 'high-confidence', mid: 'medium-confidence', low: 'low-confidence' };
/** "up/high/choppy" → "high-confidence bullish calls in choppy markets". */
export function readableBucket(b: string): string {
  const [d, c, v] = String(b).split('/');
  return `${BAND[c] ?? c} ${DIR[d] ?? d} calls in ${v ?? '?'} markets`;
}
const unquote = (s: string | null) => String(s ?? '').replace(/^"+|"+$/g, '');
const VOICE_LABEL: Record<string, string> = { you: 'You', market: 'the Predict market', helix: 'the HELIX model', crowd: 'the Polymarket crowd', council: 'the Council' };

// ---------------------------------------------------------------- record plumbing
const tsOf = (r: MemRecord) => num(r, 'ts') ?? 0;

interface Settled { row: SettledRow; conv: MemRecord; out: MemRecord; bucket: string | null }
/** Settled calls with the CONVICTION and OUTCOME records they came from; optional asset filter (default BTC). */
export function settledWithRecords(recs: MemRecord[], asset?: string | null): Settled[] {
  const conv = new Map<string, MemRecord>(), out = new Map<string, MemRecord>();
  for (const r of recs) {
    const tx = str(r, 'tx');
    if (!tx) continue;
    if (r.type === 'CONVICTION') conv.set(tx, r);
    else if (r.type === 'OUTCOME') out.set(tx, r);
  }
  return settledRows(recs)
    .map((row) => ({ row, conv: conv.get(row.tx)!, out: out.get(row.tx)! }))
    .filter((s) => s.conv && s.out && (!asset || (str(s.conv, 'asset') ?? 'BTC').toUpperCase() === asset))
    .map((s) => ({ ...s, bucket: bucketOfConviction(s.conv) }));
}

/** Cite records: newest first, unique blob ids, at most `cap` shown, total counted. */
export function cite(recs: (MemRecord | null | undefined)[], cap = 8): { memories_used: Cited[]; memories_total: number } {
  const seen = new Map<string, MemRecord>();
  for (const r of recs) if (r?.blob_id && !seen.has(r.blob_id)) seen.set(r.blob_id, r);
  const all = [...seen.values()].sort((a, b) => tsOf(b) - tsOf(a));
  return { memories_used: all.slice(0, cap).map((r) => ({ text: r.text, blob_id: r.blob_id!, type: r.type })), memories_total: all.length };
}
const latest = (recs: MemRecord[], type: string, bucket?: string) =>
  recs.filter((r) => r.type === type && (!bucket || str(r, 'bucket') === bucket)).sort((a, b) => tsOf(b) - tsOf(a))[0] ?? null;
const ofSettled = (xs: Settled[]) => xs.flatMap((s) => [s.out, s.conv]);
const stats = (xs: Settled[]) => bucketStats(xs.map((s) => s.row));
function groupBy(xs: Settled[], key: (s: Settled) => string | null): Map<string, Settled[]> {
  const m = new Map<string, Settled[]>();
  for (const s of xs) { const k = key(s); if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
  return m;
}
const done = (template: string, answer: string, cited: { memories_used: Cited[]; memories_total: number }, n: number | null): StatsAnswer =>
  ({ answer, template, ...cited, n });
const noisy = (n: number) => (n < MIN_N ? ` (n=${n}, under ${MIN_N}: still noisy)` : '');

// ---------------------------------------------------------------- templates
type Ctx = { d: AskData; q: string; asset: string | null; S: Settled[] };
interface Template { id: string; question: string; keywords: string[]; answer: (c: Ctx) => StatsAnswer | null }

function setupRanking(c: Ctx, pick: 'best' | 'worst'): StatsAnswer | null {
  const groups = [...groupBy(c.S, (s) => s.bucket)].map(([b, xs]) => ({ b, xs, st: stats(xs) }));
  if (!groups.length) return null;
  const eligible = groups.filter((g) => g.st.n >= MIN_N);
  const pool = eligible.length ? eligible : groups;
  pool.sort((a, b) => (pick === 'best' ? b.st.posterior - a.st.posterior : a.st.posterior - b.st.posterior) || b.st.n - a.st.n);
  const g = pool[0];
  const lesson = latest(c.d.recs, 'LESSON', g.b);
  return done(pick === 'best' ? 'best_setup' : 'worst_setup',
    `Your ${pick} setup is ${readableBucket(g.b)} (${g.b}): you won ${g.st.wins} of ${g.st.n}, a remembered win rate of ${pct(g.st.posterior)}, Brier ${b2(g.st.brier.you)}.`
    + (eligible.length ? '' : ` Every setup still has fewer than ${MIN_N} settled calls, so this is noisy.`)
    + (lesson ? ` Memory's lesson there: "${unquote(str(lesson, 'text'))}"` : ''),
    cite([lesson, latest(c.d.recs, 'CALIBRATION', g.b), ...ofSettled(g.xs)]), g.st.n);
}

function voices(st: BucketStats, xs: Settled[] = []): { k: string; brier: number; n: number }[] {
  const nMkt = xs.length ? xs.filter((s) => s.row.p_mkt != null).length : st.n;         // ETH/SUI calls have no market voice
  const nHlx = xs.length ? xs.filter((s) => s.row.p_hlx != null).length : st.n;
  const nFor: Record<string, number> = { you: st.n, market: nMkt, helix: nHlx, crowd: st.n_crowd, council: (st as any).n_council ?? 0 };
  return Object.entries(st.brier)
    .filter(([k, v]) => v != null && Number.isFinite(v) && (nFor[k] ?? 0) >= MIN_N)
    .map(([k, v]) => ({ k, brier: v as number, n: nFor[k] }))
    .sort((a, b) => a.brier - b.brier);
}

export const TEMPLATES: Template[] = [
  {
    id: 'overconfident', question: 'When am I most overconfident?',
    keywords: ['overconfident', 'overconfidence', 'too confident', 'too sure', 'overestimat', 'hot', 'cocky'],
    answer: (c) => {
      const groups = [...groupBy(c.S, (s) => s.bucket)].map(([b, xs]) => ({ b, xs, st: stats(xs) })).filter((g) => g.st.gap_you != null);
      if (!groups.length) return null;
      const eligible = groups.filter((g) => g.st.n >= MIN_N);
      const pool = (eligible.length ? eligible : groups).sort((a, b) => (b.st.gap_you! - a.st.gap_you!) || b.st.n - a.st.n);
      const g = pool[0], gap = g.st.gap_you!;
      const lesson = latest(c.d.recs, 'LESSON', g.b);
      const cited = cite([lesson, latest(c.d.recs, 'CALIBRATION', g.b), ...ofSettled(g.xs)]);
      if (gap <= 0) return done('overconfident', `You aren't overconfident in any setup${eligible.length ? ` with at least ${MIN_N} settled calls` : ''}: in each one you win at least as often as you say. Closest: ${readableBucket(g.b)} (${g.b}), stated ${pct(g.st.mean_p_you)} vs remembered ${pct(g.st.posterior)} over ${g.st.n} calls.`, cited, g.st.n);
      return done('overconfident',
        `You're most overconfident on ${readableBucket(g.b)} (${g.b}): you state ${pct(g.st.mean_p_you)} on average but won ${g.st.wins} of ${g.st.n}, a remembered win rate of ${pct(g.st.posterior)}, so you run ${pts(gap)} too sure there.`
        + (eligible.length ? '' : ` Every setup still has fewer than ${MIN_N} settled calls, so this is noisy.`)
        + (lesson ? ` Memory's lesson: "${unquote(str(lesson, 'text'))}"` : ''), cited, g.st.n);
    },
  },
  { id: 'best_setup', question: "What's my best setup?", keywords: ['best', 'strongest', 'good at', 'my edge', 'works best', 'sweet spot', 'most profitable'], answer: (c) => setupRanking(c, 'best') },
  { id: 'worst_setup', question: "What's my worst setup?", keywords: ['worst', 'weakest', 'bad at', 'avoid', 'lose most', 'losing'], answer: (c) => setupRanking(c, 'worst') },
  {
    id: 'trust_voice', question: 'Which voice should I trust in choppy markets?',
    keywords: ['trust', 'voice', 'listen to', 'rely on', 'which source', 'who should', 'follow', 'choppy', 'calm'],
    answer: (c) => {
      const vol = /chopp/.test(c.q) ? 'choppy' : /\bcalm|quiet/.test(c.q) ? 'calm' : null;
      const xs = vol ? c.S.filter((s) => str(s.conv, 'vol') === vol) : c.S;
      if (!xs.length) return null;
      const st = stats(xs), vs = voices(st, xs);
      const where = vol ? `in ${vol} markets` : 'across all your settled calls';
      if (!vs.length) return done('trust_voice', `No voice has ${MIN_N} scored calls ${where} yet (${st.n} settled), so I can't rank them honestly.`, cite(ofSettled(xs)), st.n);
      const top = vs[0];
      return done('trust_voice',
        `${where[0].toUpperCase()}${where.slice(1)} (${calls(st.n, 'settled calls')}), the most accurate voice was ${VOICE_LABEL[top.k]}: Brier ${b2(top.brier)} over ${calls(top.n)} (lower is better).`
        + (vs.length > 1 ? ` Then ${vs.slice(1).map((v) => `${VOICE_LABEL[v.k]} ${b2(v.brier)} (n=${v.n})`).join(', ')}.` : ''),
        cite(ofSettled(xs)), st.n);
    },
  },
  {
    id: 'trend_week', question: 'How has my calibration changed this week?',
    keywords: ['changed', 'change', 'trend', 'this week', 'week', 'improv', 'getting better', 'getting worse', 'progress'],
    answer: (c) => {
      const cut = c.d.now / 1000 - 7 * 86_400;
      const week = c.S.filter((s) => s.row.ts >= cut), before = c.S.filter((s) => s.row.ts < cut);
      if (!week.length) return null;
      const w = stats(week);
      if (!before.length) return done('trend_week', `${w.n === 1 ? 'Your only settled call is' : `All ${w.n} of your settled calls are`} from the last 7 days, so there's no earlier period to compare yet. This week: Brier ${b2(w.brier.you)}, stated ${pct(w.mean_p_you)} vs remembered win rate ${pct(w.posterior)}.`, cite(ofSettled(week)), w.n);
      const p = stats(before), diff = (w.brier.you ?? 0) - (p.brier.you ?? 0);
      return done('trend_week',
        `Last 7 days: Brier ${b2(w.brier.you)} over ${calls(w.n)}${noisy(w.n)}. Before that: Brier ${b2(p.brier.you)} over ${p.n}. Your calibration ${Math.abs(diff) < 0.005 ? 'held steady' : diff < 0 ? `improved by ${b2(-diff)}` : `got worse by ${b2(diff)}`} (lower Brier is better).`,
        cite(ofSettled([...week, ...before])), w.n + p.n);
    },
  },
  {
    id: 'record', question: "What's my track record?",
    keywords: ['record', 'overall', 'win rate', 'how am i doing', 'how have i done', 'stats', 'summary', 'score'],
    answer: (c) => {
      if (!c.S.length) return null;
      const st = stats(c.S);
      return done('record',
        `You have ${calls(st.n, 'settled calls')} and won ${st.wins} (${pct(st.realized)}); your remembered win rate is ${pct(st.posterior)}. Your Brier is ${b2(st.brier.you)}`
        + (st.brier.market == null ? ' (no Predict market priced these calls).'
          : c.S.every((s) => s.row.p_mkt != null) ? ` against the Predict market's ${b2(st.brier.market)} on the same calls (lower is better).`
          : `; the Predict market's is ${b2(st.brier.market)} on the ${c.S.filter((s) => s.row.p_mkt != null).length} calls it priced (lower is better).`),
        cite(ofSettled(c.S)), st.n);
    },
  },
  {
    id: 'vs_market', question: 'Do I beat the market?',
    keywords: ['beat the market', 'market', 'versus', 'vs', 'better than', 'outperform'],
    answer: (c) => {
      const S = c.S.filter((s) => s.row.p_mkt != null);       // only calls a Predict market priced (BTC)
      if (!S.length) return null;
      const st = stats(S);
      const closer = S.filter((s) => (s.row.p_you - s.row.won) ** 2 < ((s.row.p_mkt as number) - s.row.won) ** 2).length;
      const beats = (st.brier.you ?? 1) < (st.brier.market ?? 0);
      return done('vs_market',
        `${beats ? 'Yes' : 'Not yet'}: your Brier is ${b2(st.brier.you)} vs the Predict market's ${b2(st.brier.market)} over ${calls(st.n, 'settled calls')} (lower is better). You were closer than the market on ${closer} of ${st.n} calls.`,
        cite(ofSettled(S)), st.n);
    },
  },
  {
    id: 'lesson', question: 'What has memory taught me?',
    keywords: ['lesson', 'learned', 'learn', 'taught', 'advice', 'tip', 'what should i'],
    answer: (c) => {
      const byBucket = new Map<string, MemRecord>();
      for (const r of c.d.recs.filter((r) => r.type === 'LESSON').sort((a, b) => tsOf(b) - tsOf(a))) {
        const b = str(r, 'bucket') ?? r.blob_id ?? '';
        if (!byBucket.has(b)) byBucket.set(b, r);
      }
      const ls = [...byBucket.values()].slice(0, 3);
      if (!ls.length) return null;
      return done('lesson', `Memory's latest lesson${ls.length > 1 ? 's' : ''}: ${ls.map((l, i) => `${ls.length > 1 ? `${i + 1}) ` : ''}${unquote(str(l, 'text'))}`).join(' ')}`,
        cite(ls), ls.reduce((a, l) => a + (num(l, 'n') ?? 0), 0) || null);
    },
  },
  {
    id: 'hidden', question: 'Have I hidden any calls?',
    keywords: ['hidden', 'hide', 'cherry', 'delete', 'missing', 'honest', 'all my commits'],
    answer: (c) => {
      const L = c.d.ledger;
      const convs = c.d.recs.filter((r) => r.type === 'CONVICTION');
      if (!L || !convs.length) return null;
      return done('hidden',
        `You committed ${L.onchain} conviction${L.onchain === 1 ? '' : 's'} on-chain (helix::journal); ${L.with_memory} have their memory and ${L.missing_memory} ${L.missing_memory === 1 ? 'has' : 'have'} none${L.missing_memory ? ' (each counts as a loss once its window passes)' : ': hidden 0'}.`,
        cite(convs), L.onchain);
    },
  },
  {
    id: 'council', question: 'Which Council agent is most reliable?',
    keywords: ['council', 'agent', 'momentum', 'reversion', 'surface', 'bot'],
    answer: (c) => {
      const agents = (c.d.council ?? []).map((a) => ({ name: a.name, recs: a.recs, S: settledWithRecords(a.recs, c.asset) }))
        .map((a) => ({ ...a, st: stats(a.S) })).filter((a) => a.st.n > 0 && a.st.brier.you != null);
      if (!agents.length) return null;
      const eligible = agents.filter((a) => a.st.n >= MIN_N);
      const pool = (eligible.length ? eligible : agents).sort((a, b) => a.st.brier.you! - b.st.brier.you!);
      const top = pool[0];
      return done('council',
        `${c.asset && c.asset !== 'BTC' ? `On ${c.asset}, the` : 'The'} most reliable Council agent so far is ${top.name}: Brier ${b2(top.st.brier.you)} over ${calls(top.st.n, 'settled calls')} (won ${top.st.wins}).`
        + (pool.length > 1 ? ` Then ${pool.slice(1).map((a) => `${a.name} ${b2(a.st.brier.you)} (n=${a.st.n})`).join(', ')}.` : '')
        + (eligible.length ? '' : ` No agent has ${MIN_N} settled calls yet, so this is noisy.`),
        cite(agents.flatMap((a) => ofSettled(a.S.slice(-2)))), agents.reduce((s, a) => s + a.st.n, 0));
    },
  },
  {
    id: 'recent', question: 'How did my last calls go?',
    keywords: ['last', 'recent', 'latest', 'lately', 'streak', 'today', 'yesterday'],
    answer: (c) => {
      const xs = [...c.S].sort((a, b) => b.row.ts - a.row.ts).slice(0, 5);
      if (!xs.length) return null;
      const items = xs.map((s) => `${s.row.won ? 'WIN' : 'LOSS'} (${str(s.conv, 'dir') ?? '?'} ${s.row.structure} at ${pct(s.row.p_you)})`);
      return done('recent', `Your last ${xs.length} settled call${xs.length === 1 ? '' : 's'}, newest first: ${items.join(', ')}. ${xs.filter((s) => s.row.won).length} of ${xs.length} won.`, cite(ofSettled(xs)), xs.length);
    },
  },
  {
    id: 'confidence', question: "Am I better when I'm confident?",
    keywords: ['confident', 'confidence', 'certain', 'conviction strength'],
    answer: (c) => {
      const g = groupBy(c.S, (s) => { const v = num(s.conv, 'conf'); return v == null ? null : confBand(v); });
      if (!g.size) return null;
      const order = ['high', 'mid', 'low'].filter((k) => g.has(k));
      const parts = order.map((k) => { const st = stats(g.get(k)!); return `${BAND[k]}: won ${st.wins}/${st.n} (remembered ${pct(st.posterior)})`; });
      const hi = g.get('high'), lo = g.get('low') ?? g.get('mid');
      const verdict = hi && lo && hi.length >= MIN_N && lo.length >= MIN_N
        ? (stats(hi).posterior > stats(lo).posterior ? ' Your confident calls do win more often.' : ' Your confident calls do not win more often; confidence is not paying for itself.')
        : ` Not enough calls in each band (n ≥ ${MIN_N}) to compare yet.`;
      return done('confidence', `By stated confidence: ${parts.join('; ')}.${verdict}`, cite(ofSettled(c.S)), c.S.length);
    },
  },
  {
    id: 'structure', question: 'Do ranges work better than directional bets for me?',
    keywords: ['range', 'ranges', 'directional', 'structure', 'bracket'],
    answer: (c) => {
      const g = groupBy(c.S, (s) => (RANGEISH.has(s.row.structure) ? 'ranges' : 'directional bets'));
      if (!g.size) return null;
      const parts = [...g].map(([k, xs]) => { const st = stats(xs); return `${k}: won ${st.wins}/${st.n} (remembered ${pct(st.posterior)}, Brier ${b2(st.brier.you)})`; });
      return done('structure', `By structure: ${parts.join('; ')}.`, cite(ofSettled(c.S)), c.S.length);
    },
  },
];

export const SUGGESTED = TEMPLATES.map((t) => t.question);

// ---------------------------------------------------------------- matching
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const kwRe = new Map<string, RegExp>();
const re = (kw: string) => kwRe.get(kw) ?? kwRe.set(kw, new RegExp(`\\b${esc(kw)}`, 'i')).get(kw)!;

/** The nearest template by keyword hits (word-start matches); ties go to the earlier template. */
export function matchTemplate(question: string): { id: string; score: number } | null {
  const q = String(question ?? '').toLowerCase().trim();
  const exact = TEMPLATES.find((t) => t.question.toLowerCase() === q);
  if (exact) return { id: exact.id, score: 99 };
  let best: { id: string; score: number } | null = null;
  for (const t of TEMPLATES) {
    const score = t.keywords.filter((k) => re(k).test(q)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: t.id, score };
  }
  return best;
}
export const assetIn = (q: string) => (/\b(eth|ethereum)\b/i.test(q) ? 'ETH' : /\bsui\b/i.test(q) ? 'SUI' : /\b(btc|bitcoin)\b/i.test(q) ? 'BTC' : null);

/** Answer from stats. Unmatched questions and templates without data get the no-data reply and no citations. */
export function answerFromStats(question: string, d: AskData): StatsAnswer {
  const m = matchTemplate(question);
  const none: StatsAnswer = { answer: NO_DATA, template: m?.id ?? null, memories_used: [], memories_total: 0, n: null };
  if (!m) return none;
  const q = String(question).toLowerCase(), asset = assetIn(q);
  const t = TEMPLATES.find((x) => x.id === m.id)!;
  const r = t.answer({ d, q, asset, S: settledWithRecords(d.recs, asset) });
  return r && r.memories_used.length ? r : none;      // grounding rule: no cited memories → no-data reply
}
