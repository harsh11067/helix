// pricing — Black-Scholes leg pricing + grid-based structure metrics.
// HELIX reads the SVI surface (it does not recompute pricing per ADR-010); we
// use BS with the surface IV per strike to price legs and a terminal-lognormal
// grid to compute max profit/loss, breakevens, win probability and a Sharpe est.
import { normCdf, normPdf } from './math.ts';
import type { Leg, Greeks, StructureMetrics } from './types.ts';
import { sviIV, type SviParams } from './mockOracle.ts';

const R = 0.0; // ~0 risk-free for sub-hour crypto horizons

function ivForStrike(svi: SviParams, spot: number, strike: number): number {
  return sviIV(svi, Math.log(strike / spot));
}

interface LegGreeks extends Greeks { price: number }

function bs(type: 'call' | 'put', S: number, K: number, sigma: number, T: number): LegGreeks {
  const sqrtT = Math.sqrt(T);
  const vol = Math.max(sigma, 1e-4);
  const d1 = (Math.log(S / K) + (R + 0.5 * vol * vol) * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  const pdf = normPdf(d1);
  const disc = Math.exp(-R * T);
  const gamma = pdf / (S * vol * sqrtT);
  const vega = (S * pdf * sqrtT) / 100; // per 1 vol-point
  if (type === 'call') {
    const nd1 = normCdf(d1), nd2 = normCdf(d2);
    return {
      price: S * nd1 - K * disc * nd2,
      delta: nd1, gamma, vega,
      theta: (-(S * pdf * vol) / (2 * sqrtT) - R * K * disc * nd2) / 365,
      rho: (K * T * disc * nd2) / 100,
    };
  } else {
    const nmd1 = normCdf(-d1), nmd2 = normCdf(-d2);
    return {
      price: K * disc * nmd2 - S * nmd1,
      delta: normCdf(d1) - 1, gamma, vega,
      theta: (-(S * pdf * vol) / (2 * sqrtT) + R * K * disc * nmd2) / 365,
      rho: (-K * T * disc * nmd2) / 100,
    };
  }
}

export function priceStructure(legs: Leg[], spot: number, svi: SviParams, T: number): StructureMetrics {
  let cost = 0;
  const greeks: Greeks = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  for (const leg of legs) {
    const sigma = ivForStrike(svi, spot, leg.strike);
    const g = bs(leg.type, spot, leg.strike, sigma, T);
    cost += leg.qty * g.price;
    greeks.delta += leg.qty * g.delta;
    greeks.gamma += leg.qty * g.gamma;
    greeks.vega += leg.qty * g.vega;
    greeks.theta += leg.qty * g.theta;
    greeks.rho += leg.qty * g.rho;
  }

  const lo = spot * 0.4, hi = spot * 1.6, steps = 400, dS = (hi - lo) / steps;
  const atmVol = ivForStrike(svi, spot, spot);
  const mu = Math.log(spot) + (R - 0.5 * atmVol * atmVol) * T;
  const sd = Math.max(atmVol * Math.sqrt(T), 1e-6);

  const payoffs: number[] = [], prices: number[] = [], dens: number[] = [];
  let maxProfit = -Infinity, maxLoss = Infinity, densSum = 0;
  for (let i = 0; i <= steps; i++) {
    const S = lo + i * dS;
    let intrinsic = 0;
    for (const leg of legs) {
      const v = leg.type === 'call' ? Math.max(S - leg.strike, 0) : Math.max(leg.strike - S, 0);
      intrinsic += leg.qty * v;
    }
    const pnl = intrinsic - cost;
    payoffs.push(pnl); prices.push(S);
    if (pnl > maxProfit) maxProfit = pnl;
    if (pnl < maxLoss) maxLoss = pnl;
    const d = S > 0 ? Math.exp(-((Math.log(S) - mu) ** 2) / (2 * sd * sd)) / (S * sd * Math.sqrt(2 * Math.PI)) : 0;
    dens.push(d); densSum += d * dS;
  }
  const norm = densSum > 0 ? densSum : 1;

  let winProb = 0, ePnl = 0;
  for (let i = 0; i <= steps; i++) {
    const p = (dens[i] * dS) / norm;
    if (payoffs[i] > 0) winProb += p;
    ePnl += p * payoffs[i];
  }
  let varPnl = 0;
  for (let i = 0; i <= steps; i++) {
    const p = (dens[i] * dS) / norm;
    varPnl += p * (payoffs[i] - ePnl) ** 2;
  }
  const sharpe = varPnl > 0 ? ePnl / Math.sqrt(varPnl) : 0;

  const breakevens: number[] = [];
  for (let i = 1; i <= steps; i++) {
    if ((payoffs[i - 1] <= 0 && payoffs[i] > 0) || (payoffs[i - 1] >= 0 && payoffs[i] < 0)) {
      breakevens.push(Math.round((prices[i - 1] + prices[i]) / 2));
    }
  }

  return { cost, maxProfit, maxLoss, breakevens, winProb, expectedPnl: ePnl, sharpe, greeks };
}
