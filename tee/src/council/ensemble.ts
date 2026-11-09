// council/ensemble — the Council voice: the agents' calls weighted by what memory says about them.
// Pure. Weights come only from recalled, settled memory; nothing is assumed.
//
//  • weights: equal while no agent has n ≥ 5 settled calls; then each qualified agent gets
//    1 / max(Brier, 0.05) and an unqualified one gets the mean qualified weight; normalized to 1.
//  • Council P(up) = weighted mean of the current calls (abstainers drop out, weights renormalized).
//  • Applied to any order: the market's own surface, re-centred on the Council's lean. The edge
//    t = P_council(up) − P_market(up) on the agents' window moves the user's forward-ATM probability
//    by t; the shift δ that does that is found on the user's surface, and the order is re-priced at δ.

import type { AgentCall, AgentName } from './signals.ts';

export const MIN_N_WEIGHT = 5;
export const BRIER_FLOOR = 0.05;

export interface AgentRecord { agent: AgentName; n: number; wins: number; brier: number | null }

export function councilWeights(records: AgentRecord[]): Record<string, number> {
  if (!records.length) return {};
  const q = records.filter((r) => r.n >= MIN_N_WEIGHT && r.brier != null);
  const raw: Record<string, number> = {};
  if (!q.length) for (const r of records) raw[r.agent] = 1;
  else {
    const inv = (b: number) => 1 / Math.max(b, BRIER_FLOOR);
    const meanQ = q.reduce((a, r) => a + inv(r.brier!), 0) / q.length;
    for (const r of records) raw[r.agent] = r.n >= MIN_N_WEIGHT && r.brier != null ? inv(r.brier) : meanQ;
  }
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum]));
}

export const weightsEqual = (w: Record<string, number>) => {
  const v = Object.values(w);
  return v.length > 0 && v.every((x) => Math.abs(x - 1 / v.length) < 1e-9);
};

/** Weighted Council P(up) over the agents that made a call. */
export function councilPUp(calls: AgentCall[], weights: Record<string, number>): { pUp: number; used: string[] } | null {
  const live = calls.filter((c) => (weights[c.agent] ?? 0) > 0);
  const tot = live.reduce((a, c) => a + weights[c.agent], 0);
  if (!live.length || tot <= 0) return null;
  return { pUp: live.reduce((a, c) => a + weights[c.agent] * c.pUp, 0) / tot, used: live.map((c) => c.agent) };
}

/** Minimal surface interface (Predict's BoardPricer): P(settle > strike). */
export interface UpCurve { up(strike: number): number }
type OrderShape = { side: 'up' | 'down' | 'range'; strike?: number; lower?: number; upper?: number };

/** P(order wins) under the market surface shifted by δ (price units): P'(> k) = up(k − δ). */
export function pricedAtShift(bp: UpCurve, order: OrderShape, delta: number): number {
  const up = (k: number) => bp.up(k - delta);
  if (order.side === 'up') return up(order.strike!);
  if (order.side === 'down') return 1 - up(order.strike!);
  return Math.max(0, up(order.lower!) - up(order.upper!));
}

/**
 * The Council's probability for any order: shift the user's surface so P(> forward) moves by the
 * Council's edge, then re-price the order. Returns null without an edge.
 */
export function councilProbability(bp: UpCurve, forward: number, order: OrderShape, edge: number | null): number | null {
  if (edge == null || !Number.isFinite(edge)) return null;
  const base = bp.up(forward);
  const target = Math.max(0.02, Math.min(0.98, base + edge));
  let lo = -0.05 * forward, hi = 0.05 * forward;                  // up(F − δ) is increasing in δ
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (bp.up(forward - mid) < target) lo = mid; else hi = mid;
  }
  const p = pricedAtShift(bp, order, (lo + hi) / 2);
  return Math.max(0.01, Math.min(0.99, p));
}
