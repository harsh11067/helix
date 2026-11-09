// calibration — who was right, in which setup (TOTAL_RECALL.md §1 "Calibration math").
// Pure functions; every number the UI shows about memory comes from here.
//
//  • posterior win rate per bucket: Beta(2,2) prior → (wins + 2) / (n + 4)
//  • Brier per voice: mean((p − o)²), o ∈ {0,1}; lower is better
//  • over-confidence gap: mean(p_you) − posterior
//  • blended probability: weights ∝ 1 / max(brier, 0.05); falls back to the market when n < 3
//  • suggested commit: fractional Kelly (¼) at the remembered posterior, as a share of the
//    Kelly the user's own stated probability implies, capped at the user's commit
//  • structure bias: ranges vs directional posterior in the same regime, n ≥ 3 each, gap > 0.15

export const MIN_N = 3;
export const KELLY_FRACTION = 0.25;
export const MIN_ORDER_USDC = 1.5;   // Predict refuses premiums under 1 USDC; fees on top

export interface SettledRow {
  tx: string;
  won: 0 | 1;
  p_you: number;
  p_mkt: number;
  p_hlx: number;
  p_crowd: number | null;
  structure: string;          // directional | bracketed_range | range
  regime: string | null;
  commit: number;
  payoff: number | null;      // realized PnL in dUSDC
  ts: number;
}

export interface BucketStats {
  n: number;
  wins: number;
  realized: number | null;    // raw win rate
  posterior: number;          // Beta(2,2)
  mean_p_you: number | null;
  gap_you: number | null;
  brier: { you: number | null; market: number | null; helix: number | null; crowd: number | null };
  n_crowd: number;
  pnl: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const brierOf = (pairs: [number, number][]) => mean(pairs.map(([p, o]) => (p - o) ** 2));
export const posteriorOf = (wins: number, n: number) => (wins + 2) / (n + 4);

export function bucketStats(rows: SettledRow[]): BucketStats {
  const n = rows.length;
  const wins = rows.filter((r) => r.won === 1).length;
  const crowd = rows.filter((r) => r.p_crowd != null);
  const mpy = mean(rows.map((r) => r.p_you));
  const post = posteriorOf(wins, n);
  return {
    n, wins,
    realized: n ? wins / n : null,
    posterior: post,
    mean_p_you: mpy,
    gap_you: mpy == null ? null : mpy - post,
    brier: {
      you: brierOf(rows.map((r) => [r.p_you, r.won])),
      market: brierOf(rows.map((r) => [r.p_mkt, r.won])),
      helix: brierOf(rows.map((r) => [r.p_hlx, r.won])),
      crowd: brierOf(crowd.map((r) => [r.p_crowd as number, r.won])),
    },
    n_crowd: crowd.length,
    pnl: rows.reduce((a, r) => a + (r.payoff ?? 0), 0),
  };
}

export type VoiceName = 'you' | 'market' | 'helix' | 'crowd';
/** Weighted blend of the voices' current probabilities by inverse remembered Brier. */
export function blendedProbability(
  now: Record<VoiceName, number | null>, stats: BucketStats | null,
): { p: number | null; weights: Partial<Record<VoiceName, number>>; basis: 'memory' | 'market' } {
  if (!stats || stats.n < MIN_N) return { p: now.market, weights: { market: 1 }, basis: 'market' };
  const raw: Partial<Record<VoiceName, number>> = {};
  for (const v of ['you', 'market', 'helix', 'crowd'] as VoiceName[]) {
    const b = stats.brier[v];
    const p = now[v];
    if (p == null || b == null) continue;
    if (v === 'crowd' && stats.n_crowd < MIN_N) continue;
    raw[v] = 1 / Math.max(b, 0.05);
  }
  const tot = Object.values(raw).reduce((a, b) => a + (b as number), 0);
  if (!tot) return { p: now.market, weights: { market: 1 }, basis: 'market' };
  const weights: Partial<Record<VoiceName, number>> = {};
  let p = 0;
  for (const [v, w] of Object.entries(raw) as [VoiceName, number][]) {
    weights[v] = w / tot;
    p += (w / tot) * (now[v] as number);
  }
  return { p, weights, basis: 'memory' };
}

/** Full Kelly fraction for a bet paying net odds b at win probability p (never negative). */
export const kelly = (p: number, b: number) => (b > 0 ? Math.max(0, (p * b - (1 - p)) / b) : 0);

/** Net payoff odds of a Predict contract bought at `pricePerContract` (pays $1). */
export const oddsFromPrice = (pricePerContract: number) =>
  pricePerContract > 0 && pricePerContract < 1 ? (1 - pricePerContract) / pricePerContract : 0;

export interface CommitSuggestion {
  suggested: number;
  basis: 'no_history' | 'kelly';
  f_you: number;          // ¼-Kelly at your stated probability
  f_memory: number;       // ¼-Kelly at the remembered posterior
}

/**
 * Suggested commit: scale the user's commit by how much Kelly shrinks when the stated
 * probability is replaced by the remembered posterior. Never above the user's commit,
 * never below the smallest order Predict accepts; with n < 3 it is the user's commit.
 */
export function suggestCommit(commit: number, p_you: number, stats: BucketStats | null, b: number): CommitSuggestion {
  const f_you = KELLY_FRACTION * kelly(p_you, b);
  if (!stats || stats.n < MIN_N) return { suggested: commit, basis: 'no_history', f_you, f_memory: f_you };
  const f_memory = KELLY_FRACTION * kelly(stats.posterior, b);
  let s: number;
  if (f_you <= 0) s = commit;                       // no stated edge to scale from
  else s = commit * Math.min(1, f_memory / f_you);
  s = Math.max(Math.min(MIN_ORDER_USDC, commit), Math.min(commit, s));
  return { suggested: Math.round(s * 100) / 100, basis: 'kelly', f_you, f_memory };
}

export const RANGEISH = new Set(['range', 'bracketed_range']);

/** Prefer a structure family when its remembered posterior beats the other by > 0.15. */
export function structureBias(rowsInRegime: SettledRow[]): {
  prefer: 'range' | 'directional' | null; post_range: number | null; post_dir: number | null; n_range: number; n_dir: number;
} {
  const rng = rowsInRegime.filter((r) => RANGEISH.has(r.structure));
  const dir = rowsInRegime.filter((r) => r.structure === 'directional');
  const pr = rng.length ? posteriorOf(rng.filter((r) => r.won).length, rng.length) : null;
  const pd = dir.length ? posteriorOf(dir.filter((r) => r.won).length, dir.length) : null;
  let prefer: 'range' | 'directional' | null = null;
  if (rng.length >= MIN_N && dir.length >= MIN_N && pr != null && pd != null) {
    if (pr - pd > 0.15) prefer = 'range';
    else if (pd - pr > 0.15) prefer = 'directional';
  }
  return { prefer, post_range: pr, post_dir: pd, n_range: rng.length, n_dir: dir.length };
}

/** The voice with the lowest remembered Brier (needs n ≥ 3; crowd needs its own n ≥ 3). */
export function bestVoice(stats: BucketStats): VoiceName | null {
  if (stats.n < MIN_N) return null;
  let best: VoiceName | null = null, bv = Infinity;
  for (const v of ['you', 'market', 'helix', 'crowd'] as VoiceName[]) {
    const b = stats.brier[v];
    if (b == null || (v === 'crowd' && stats.n_crowd < MIN_N)) continue;
    if (b < bv) { bv = b; best = v; }
  }
  return best;
}

export const VOICE_LABEL: Record<VoiceName, string> = {
  you: 'your own confidence', market: 'the Predict market', helix: "HELIX's regime model", crowd: 'the Polymarket crowd',
};

/** A plain-language lesson, only when the bucket has n ≥ 3 and a clear pattern. */
export function lessonFor(bucket: string, stats: BucketStats, bias: ReturnType<typeof structureBias> | null): string | null {
  if (stats.n < MIN_N) return null;
  const bits: string[] = [];
  if (stats.gap_you != null && Math.abs(stats.gap_you) >= 0.15) {
    bits.push(stats.gap_you > 0
      ? `Won ${stats.wins}/${stats.n} here; stated confidence runs ~${Math.round(stats.gap_you * 100)} points hot. Size down.`
      : `Won ${stats.wins}/${stats.n} here; stated confidence runs ~${Math.round(-stats.gap_you * 100)} points cold. You are better than you think.`);
  }
  if (bias?.prefer === 'range') bits.push(`Ranges won more than directional bets in this regime (${Math.round((bias.post_range ?? 0) * 100)}% vs ${Math.round((bias.post_dir ?? 0) * 100)}%). Prefer ranges.`);
  if (bias?.prefer === 'directional') bits.push(`Directional bets beat ranges in this regime (${Math.round((bias.post_dir ?? 0) * 100)}% vs ${Math.round((bias.post_range ?? 0) * 100)}%).`);
  const bv = bestVoice(stats);
  if (bv && bv !== 'you' && stats.brier.you != null && stats.brier[bv] != null && stats.brier.you - (stats.brier[bv] as number) >= 0.05) {
    bits.push(`${VOICE_LABEL[bv][0].toUpperCase()}${VOICE_LABEL[bv].slice(1)} has been closer than you (Brier ${(stats.brier[bv] as number).toFixed(2)} vs ${stats.brier.you.toFixed(2)}).`);
  }
  return bits.length ? `${bucket}: ${bits.join(' ')}` : null;
}
