// board — Who-to-trust (WIN_FEATURES.md W7): traders ranked by CALIBRATION (their own
// Brier score, lower = better, n ≥ 5) next to their PnL rank — skill vs luck at a glance.
// Namespaces only (hashed); never raw addresses. Computed from recalled memories.

import { registeredNamespaces, recallAll } from './store.ts';
import { settledRows } from './service.ts';
import { bucketStats } from './calibration.ts';

const MIN_BOARD_N = 5;
let cache: { at: number; v: any } | null = null;

export async function boardFor() {
  if (cache && Date.now() - cache.at < 60_000) return cache.v;
  const nss = await registeredNamespaces();
  const rows: any[] = [];
  for (const ns of nss) {
    const st = bucketStats(settledRows(await recallAll(ns)));
    if (st.n < MIN_BOARD_N || st.brier.you == null) continue;
    rows.push({ namespace: ns, n: st.n, wins: st.wins, brier: st.brier.you, brier_market: st.brier.market, posterior: st.posterior, pnl: st.pnl });
  }
  rows.sort((a, b) => a.brier - b.brier).forEach((r, i) => (r.brier_rank = i + 1));
  [...rows].sort((a, b) => b.pnl - a.pnl).forEach((r, i) => (r.pnl_rank = i + 1));
  const v = {
    min_n: MIN_BOARD_N, namespaces_seen: nss.length, qualified: rows.length,
    ranked: rows,
    note: rows.length < 3 ? `Fewer than 3 traders have ${MIN_BOARD_N}+ settled convictions yet — the board fills as memories settle.` : null,
  };
  cache = { at: Date.now(), v };
  return v;
}
