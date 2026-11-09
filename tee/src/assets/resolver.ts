// assets/resolver — who says what the price was at expiry (LANES.md §3).
//
//   PredictOracleResolver  BTC: DeepBook Predict's own on-chain settlement (unchanged behaviour)
//   PythBenchmarkResolver  ETH, SUI: the first Pyth price with publish_time >= expiry, from Hermes
//                          (with PYTH_API_KEY) or from Pyth's Wormhole-verified updates on Sui.
//
// The Council can resolve its own per-asset calls through `resolverFor(asset)` after the merge.

import * as P from '../predict/predict.ts';
import { PYTH_FEEDS, type Asset, type PythAsset } from './config.ts';
import { pythPriceAtOrAfter, priceSource, unavailableReason } from './pyth.ts';

export interface Settlement {
  settled: boolean;
  price: number | null;
  source: 'predict-oracle' | 'pyth-hermes' | 'pyth-sui';
  feed_id?: string;
  publish_time?: number;      // unix s of the price used
  lag_s?: number;             // publish_time − expiry
  digest?: string | null;     // Sui tx that verified the price on-chain (pyth-sui)
  priceRaw?: bigint | null;
  tickSizeRaw?: bigint | null;
  reason?: string;
  void?: boolean;             // permanently unresolvable (no Pyth price within MAX_LAG_S of expiry)
}
export interface Resolver { name: string; settle(expiryMs: number, marketId: string, nowMs?: number): Promise<Settlement> }

/** On-chain Pyth updates land every ~2 min; a price this far past expiry no longer describes expiry. */
export const MAX_LAG_S = Number(process.env.PYTH_MAX_LAG_S ?? 300);

export const PredictOracleResolver: Resolver = {
  name: 'predict-oracle',
  async settle(expiryMs, marketId) {
    const s: any = await P.settlementOf({ expiryMs, marketId });
    return { ...s, settled: !!s.settled, price: s.price ?? null, source: 'predict-oracle' };
  },
};

export function pythBenchmarkResolver(asset: PythAsset): Resolver {
  return {
    name: 'pyth-benchmark',
    async settle(expiryMs, _marketId, nowMs = Date.now()) {
      const src = priceSource(asset);
      if (!src) return { settled: false, price: null, source: 'pyth-sui', reason: unavailableReason(asset)! };
      const t = Math.ceil(expiryMs / 1000);
      const p = await pythPriceAtOrAfter(asset, t, nowMs);
      if (!p) return { settled: false, price: null, source: src, feed_id: PYTH_FEEDS[asset], reason: 'no Pyth price published at or after expiry yet' };
      const lag = p.publish_time - t;
      if (lag > MAX_LAG_S) return { settled: false, price: null, source: p.source, feed_id: p.feed_id, reason: `first Pyth price after expiry is ${lag}s late (> ${MAX_LAG_S}s)`, lag_s: lag, publish_time: p.publish_time, void: true };
      return { settled: true, price: p.price, source: p.source, feed_id: p.feed_id, publish_time: p.publish_time, lag_s: lag, digest: p.digest ?? null, priceRaw: null, tickSizeRaw: null };
    },
  };
}

export const resolverFor = (asset: Asset): Resolver => (asset === 'BTC' ? PredictOracleResolver : pythBenchmarkResolver(asset));
