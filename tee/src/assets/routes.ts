// assets/routes — P5 multi-asset HTTP API. Flag: FEATURE_ASSETS=1 (else no routes → 404, BTC-only as before).
//
//   GET  /assets                         which assets can be called now, and how each one resolves
//   POST /assets/compile                 { asset: 'ETH'|'SUI', direction, confidence, horizonCode, volView, capital, address? }
//                                        → commit-mode compile (voices, memory, guardian). Commit with the usual
//                                          POST /tx/commit { compileId, address } → POST /tx/execute (same path as BTC).
//   GET  /assets/:asset/price            latest Pyth price + realized vol (the HELIX model's inputs)
//   GET  /assets/:asset/series?since=s   Pyth prices since `since` (unix s): the per-asset input for the Council
//   GET  /assets/:asset/settlement?expiry_ms=  what the resolver says for an expiry (Pyth benchmark rule)

import { HttpError } from '../shared/http.ts';
import type { Conviction } from '../shared/types.ts';
import { assetsEnabled, parseAsset, isPythAsset, PYTH_FEEDS, ASSET_NAME, type PythAsset } from './config.ts';
import { pythLatest, pythSeries, priceSource, unavailableReason } from './pyth.ts';
import { realized } from './model.ts';
import { resolverFor } from './resolver.ts';
import { assetCompile } from './compile.ts';

function needPythAsset(a: unknown): PythAsset {
  const x = parseAsset(a);
  if (!x || !isPythAsset(x)) throw new HttpError(400, { error: 'asset must be ETH or SUI (BTC compiles through POST /compile)' });
  return x;
}
function asConviction(b: any): Conviction {
  const num = (v: any, lo: number, hi: number, name: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new HttpError(400, { error: `invalid ${name}: ${v}` });
    return n;
  };
  return {
    direction: num(b.direction, -100, 100, 'direction'), confidence: num(b.confidence, 0, 100, 'confidence'),
    horizonCode: num(b.horizonCode ?? 0, 0, 3, 'horizonCode'), volView: num(b.volView ?? b.vol, 0, 100, 'volView'),
    capital: num(b.capital ?? b.commit, 0, 1e12, 'capital'),
  };
}
const addr = (a: unknown) => (typeof a === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a) ? a.toLowerCase() : null);

export function assetsList() {
  return [
    { asset: 'BTC', name: ASSET_NAME.BTC, available: true, mode: 'predict', resolver: 'predict-oracle', note: 'DeepBook Predict v4 market + commit mode' },
    ...(['ETH', 'SUI'] as PythAsset[]).map((a) => ({
      asset: a, name: ASSET_NAME[a], available: !unavailableReason(a), mode: 'commit', resolver: 'pyth-benchmark',
      price_source: priceSource(a), feed_id: PYTH_FEEDS[a], reason: unavailableReason(a),
      voices: { market: 'n/a for this asset', helix: 'lognormal from realized vol', crowd: a === 'ETH' ? 'Polymarket 15-min Up/Down when the window matches' : 'n/a for this asset' },
    })),
  ];
}

export function assetsRoutes(): Record<string, (...a: any[]) => unknown> {
  if (!assetsEnabled()) return {};
  return {
    'GET /assets': () => ({ enabled: true, assets: assetsList() }),
    'POST /assets/compile': async (b: any) => {
      const asset = needPythAsset(b?.asset);
      try { return await assetCompile(asConviction(b), asset, addr(b?.address)); }
      catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(422, { error: (e as Error).message }); }
    },
    'GET /assets/:asset/price': async (_b: any, _u: URL, p: Record<string, string>) => {
      const asset = needPythAsset(p.asset);
      const why = unavailableReason(asset);
      if (why) throw new HttpError(503, { error: why });
      const now = Date.now();
      const [latest, series] = await Promise.all([pythLatest(asset, now), pythSeries(asset, now / 1000 - 2 * 3600, now)]);
      const m = realized(series);
      return { asset, latest, age_s: latest ? Math.round(now / 1000 - latest.publish_time) : null, realized: m, n_series: series.length };
    },
    'GET /assets/:asset/series': async (_b: any, u: URL, p: Record<string, string>) => {
      const asset = needPythAsset(p.asset);
      const why = unavailableReason(asset);
      if (why) throw new HttpError(503, { error: why });
      const since = Math.max(Date.now() / 1000 - 6 * 3600, Number(u.searchParams.get('since')) || Date.now() / 1000 - 3600);
      return { asset, since, prices: await pythSeries(asset, since) };
    },
    'GET /assets/:asset/settlement': async (_b: any, u: URL, p: Record<string, string>) => {
      const asset = needPythAsset(p.asset);
      const expiryMs = Number(u.searchParams.get('expiry_ms'));
      if (!Number.isFinite(expiryMs) || expiryMs <= 0) throw new HttpError(400, { error: 'expiry_ms required' });
      if (expiryMs > Date.now()) throw new HttpError(400, { error: 'expiry is in the future' });
      return { asset, expiry_ms: expiryMs, ...(await resolverFor(asset).settle(expiryMs, PYTH_FEEDS[asset])) };
    },
  };
}
