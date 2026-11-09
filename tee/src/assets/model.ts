// assets/model — the HELIX model voice for ETH and SUI: a transparent lognormal from the asset's own
// realized volatility (LANES.md §3). No Predict market exists for these assets, so there is no
// market-implied surface to tilt; HELIX says what the asset's recent Pyth prices imply, and labels it.
//
//   log-returns r_i = ln(p_i / p_{i-1}) over Δt_i;  σ² = Σ r_i² / Σ Δt_i;  μ = Σ r_i / Σ Δt_i (per second)
//   ln S_T ~ N(ln S_0 + μT, σ²T)  →  P(S_T > K) = Φ((ln(S_0/K) + μT) / (σ√T)), clamped to [0.02, 0.98]

import { normCdf } from '../shared/math.ts';

export const MIN_POINTS = 10;
const YEAR_S = 365.25 * 86_400;

export interface Realized { n: number; span_s: number; sigma_s: number; mu_s: number; sigma_annual: number }

/** Realized vol and drift (per second) from timestamped prices; null with fewer than MIN_POINTS points. */
export function realized(series: { publish_time: number; price: number }[]): Realized | null {
  const s = series.filter((p) => p.price > 0 && Number.isFinite(p.publish_time)).sort((a, b) => a.publish_time - b.publish_time);
  if (s.length < MIN_POINTS) return null;
  let sumR = 0, sumR2 = 0, sumDt = 0;
  for (let i = 1; i < s.length; i++) {
    const dt = s[i].publish_time - s[i - 1].publish_time;
    if (dt <= 0) continue;
    const r = Math.log(s[i].price / s[i - 1].price);
    sumR += r; sumR2 += r * r; sumDt += dt;
  }
  if (sumDt <= 0 || sumR2 <= 0) return null;
  const sigma_s = Math.sqrt(sumR2 / sumDt), mu_s = sumR / sumDt;
  return { n: s.length, span_s: sumDt, sigma_s, mu_s, sigma_annual: sigma_s * Math.sqrt(YEAR_S) };
}

/** P(price at expiry is above `strike`) under the lognormal above. */
export function lognormalUp(spot: number, strike: number, horizonS: number, m: Pick<Realized, 'sigma_s' | 'mu_s'>): number {
  const sd = m.sigma_s * Math.sqrt(Math.max(1, horizonS));
  const z = (Math.log(spot / strike) + m.mu_s * horizonS) / sd;
  return Math.min(0.98, Math.max(0.02, normCdf(z)));
}

/** The HELIX voice for a directional call ('up' = above `strike` at expiry). */
export function helixDirectional(side: 'up' | 'down', spot: number, strike: number, horizonS: number, m: Realized | null): number | null {
  if (!m) return null;
  const up = lognormalUp(spot, strike, horizonS, m);
  return side === 'up' ? up : 1 - up;
}
