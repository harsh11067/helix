// SIMULATED BACKTEST: deterministic PRNG seeded by DNA hash. Real historical
// backtests are pending sufficient Predict market history (Sui options markets are
// weeks old). The `banner` field on every report carries this disclaimer to the UI.
// (CLAUDE.md §6)
//
// backtest — the Backtest Engine (architecture.md §4.4, plan Phase 3).
// Pulls a (mock-Walrus) historical price path, simulates the DNA, and returns
// Sharpe / max drawdown / win rate / profit factor + an equity curve uploaded
// back to Walrus. Deterministic for a given (dna, seed, days) — test 3.25.
import type { StrategyDNA } from '../shared/types.ts';
import { mulberry32, mean, stddev } from '../shared/math.ts';
import { put as walrusPut } from '../shared/mockWalrus.ts';

export interface BacktestRequest { dna: StrategyDNA; seed: number; days: number }

export interface BacktestReport {
  sharpe: number;
  maxDrawdown: number;   // fraction 0..1
  winRate: number;       // 0..1
  profitFactor: number;
  finalEquity: number;
  trades: number;
  equityCurveBlobId: string;     // deterministic content handle (mock content-address)
  equityCurve: number[];         // the simulated curve (for real-Walrus upload + UI)
  walrusBlobId?: string;         // real Walrus testnet blob id, set on the live path
  banner: string;                // honest disclaimer surfaced in the result UI (CLAUDE.md §6)
}

// Disclaimer attached to every simulated backtest result.
export const BACKTEST_BANNER =
  'Simulated backtest (deterministic PRNG seeded by DNA hash). Real historical backtests pending sufficient Predict market history.';

// Generate a deterministic price path (stands in for archived DeepBook ticks on Walrus).
function pricePath(seed: number, days: number, dailyVol: number): number[] {
  const rng = mulberry32(seed);
  const path: number[] = [60000];
  for (let i = 0; i < days; i++) {
    // box-muller from two uniforms
    const u1 = Math.max(rng(), 1e-9), u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const ret = dailyVol * z;
    path.push(path[path.length - 1] * Math.exp(ret));
  }
  return path;
}

export function backtest(req: BacktestRequest): BacktestReport {
  const { dna, seed, days } = req;
  const dirSign = dna.dirNegative ? -1 : 1;
  const conviction = (dna.dirMagnitude / 100) * (dna.confidence / 100);
  const dailyVol = 0.01 + (dna.volView / 100) * 0.05;

  const prices = pricePath(seed, days, dailyVol);
  const equity: number[] = [dna.legCount > 0 ? 100 : 100]; // start at 100 units
  const dailyReturns: number[] = [];
  let wins = 0, grossProfit = 0, grossLoss = 0, trades = 0;

  for (let i = 1; i < prices.length; i++) {
    const mktRet = (prices[i] - prices[i - 1]) / prices[i - 1];
    // strategy return: directional exposure scaled by conviction, with an
    // options-like convex clamp so losses are bounded (premium at risk)
    let stratRet = dirSign * mktRet * (0.5 + conviction);
    stratRet = Math.max(stratRet, -0.5 * (dna.maxDrawdownBps / 10000)); // bounded loss
    dailyReturns.push(stratRet);
    const prev = equity[equity.length - 1];
    const next = prev * (1 + stratRet);
    equity.push(next);
    trades++;
    if (stratRet > 0) { wins++; grossProfit += stratRet; } else { grossLoss += -stratRet; }
  }

  const avg = mean(dailyReturns);
  const sd = stddev(dailyReturns);
  const sharpe = sd > 0 ? (avg / sd) * Math.sqrt(365) : 0;

  let peak = equity[0], maxDd = 0;
  for (const e of equity) { if (e > peak) peak = e; const dd = (peak - e) / peak; if (dd > maxDd) maxDd = dd; }

  const winRate = trades > 0 ? wins / trades : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  const equityCurveBlobId = walrusPut({ seed, days, equity });

  return {
    sharpe, maxDrawdown: maxDd, winRate, profitFactor,
    finalEquity: equity[equity.length - 1], trades, equityCurveBlobId,
    equityCurve: equity,
    banner: BACKTEST_BANNER,
  };
}
