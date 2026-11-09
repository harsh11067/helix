// regime — live features for the (tested) Regime Classifier, and HELIX's own voice.
//
// Features come from a rolling buffer of DeepBook Predict forward prices (one sample
// per compile plus a 30s background sampler), and the SVI skew from the live pricer.
// p_hlx is a transparent HEURISTIC: it starts from the market-implied probability and
// tilts it by the classified regime. It is labeled as such everywhere it is shown;
// memory then scores it against outcomes like any other voice.

import { classify, Regime, type RegimeName } from '../regime/classifier.ts';
import type { StructKind } from './predict.ts';

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const MAX_SAMPLES = 240;
const samples: { t: number; f: number }[] = [];
let lastRho = 0;

export function recordForward(f: number, rho: number | null = null, t = Date.now()): void {
  if (!Number.isFinite(f) || f <= 0) return;
  const last = samples[samples.length - 1];
  if (last && t - last.t < 5000) { last.f = f; last.t = t; }
  else samples.push({ t, f });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  if (rho != null && Number.isFinite(rho)) lastRho = rho;
}
export function __resetSamples(): void { samples.length = 0; lastRho = 0; }

export interface RegimeView {
  regime: RegimeName; word: string; confidence: number;
  features: { realizedVol: number; trend: number; skew: number; n: number; windowMin: number };
}

export function currentRegime(now = Date.now()): RegimeView {
  const win = samples.filter((s) => now - s.t < 45 * 60_000);
  let realizedVol = 0, trend = 0;
  if (win.length >= 3) {
    const rets: { r: number; dt: number }[] = [];
    for (let i = 1; i < win.length; i++) {
      const dt = (win[i].t - win[i - 1].t) / YEAR_MS;
      if (dt > 0) rets.push({ r: Math.log(win[i].f / win[i - 1].f), dt });
    }
    const varRate = rets.reduce((a, x) => a + (x.r * x.r) / x.dt, 0) / Math.max(1, rets.length);
    realizedVol = Math.sqrt(Math.max(varRate, 0));
    const span = (win[win.length - 1].t - win[0].t) / YEAR_MS;
    const drift = Math.log(win[win.length - 1].f / win[0].f);
    const sd = realizedVol * Math.sqrt(Math.max(span, 1e-12));
    trend = sd > 0 ? Math.max(-1, Math.min(1, drift / (2 * sd))) : 0;
  }
  const r = classify({ realizedVol, ivTermSlope: 0, skew: -lastRho, trend, volumeZ: 0 });
  const windowMin = win.length ? (win[win.length - 1].t - win[0].t) / 60000 : 0;
  return {
    regime: r.regime, word: r.regime.toLowerCase(), confidence: win.length >= 3 ? r.confidence : 0.5,
    features: { realizedVol, trend, skew: -lastRho, n: win.length, windowMin },
  };
}

/** HELIX's probability that THIS order wins, given the regime (heuristic tilt of p_mkt). */
export function helixProbability(pMkt: number, kind: StructKind, side: 'up' | 'down' | 'range', rv: RegimeView): number {
  const c = rv.features.n >= 3 ? rv.confidence : 0;     // no history → no tilt
  let p = pMkt;
  const rangeish = kind !== 'directional';
  switch (rv.regime) {
    case Regime.TRENDING_BULL:
      if (side === 'up') p += 0.08 * c; else if (side === 'down') p -= 0.08 * c; else p -= 0.04 * c;
      break;
    case Regime.TRENDING_BEAR:
      if (side === 'down') p += 0.08 * c; else if (side === 'up') p -= 0.08 * c; else p -= 0.04 * c;
      break;
    case Regime.RANGE_BOUND:
      p = rangeish ? p + 0.05 * c : 0.5 + (p - 0.5) * (1 - 0.3 * c);
      break;
    case Regime.HIGH_VOLATILITY:
      if (rangeish) p -= 0.06 * c;
      break;
  }
  return Math.max(0.02, Math.min(0.98, p));
}
