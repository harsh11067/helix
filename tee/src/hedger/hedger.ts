// hedger — the Hedging Agent core (architecture.md §4.2, plan Phase 3).
// Computes net Greeks across a portfolio's strategies, detects tolerance
// breaches, and generates a delta-neutralizing hedge PTB. Week-3 scope is a
// simple delta hedge (Paper 4's full D4PG distributional RL is roadmap).
import type { Greeks } from '../shared/types.ts';
import { sign } from '../shared/attestation.ts';
import type { Attestation } from '../shared/types.ts';

export interface PortfolioPosition { strategyId: string; greeks: Greeks }

export interface Tolerances { deltaTolerance: number; vegaTolerance: number }

export interface HedgeResult {
  breached: boolean;
  netBefore: Greeks;
  netAfter: Greeks;
  hedge?: { kind: 'spot'; qty: number };  // qty BTC to trade (sign = direction)
  attestation?: Attestation;
}

export function netGreeks(positions: PortfolioPosition[]): Greeks {
  const net: Greeks = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  for (const p of positions) {
    net.delta += p.greeks.delta;
    net.gamma += p.greeks.gamma;
    net.vega += p.greeks.vega;
    net.theta += p.greeks.theta;
    net.rho += p.greeks.rho;
  }
  return net;
}

export function isBreached(net: Greeks, tol: Tolerances): boolean {
  return Math.abs(net.delta) > tol.deltaTolerance || Math.abs(net.vega) > tol.vegaTolerance;
}

// Generate a spot hedge that brings |net delta| back to the tolerance band.
export function evaluateHedge(
  positions: PortfolioPosition[], tol: Tolerances, currentEpoch = 0,
): HedgeResult {
  const netBefore = netGreeks(positions);
  if (!isBreached(netBefore, tol)) {
    return { breached: false, netBefore, netAfter: netBefore };
  }
  // hedge enough delta to land just inside tolerance (not flat — preserves view)
  const target = Math.sign(netBefore.delta) * tol.deltaTolerance;
  const hedgeQty = target - netBefore.delta; // spot delta is 1 per unit
  const netAfter: Greeks = { ...netBefore, delta: netBefore.delta + hedgeQty };
  const hedge = { kind: 'spot' as const, qty: hedgeQty };
  const attestation = sign({ hedge, netAfter }, currentEpoch);
  return { breached: true, netBefore, netAfter, hedge, attestation };
}
