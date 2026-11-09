// assets/crowd — the crowd voice for ETH: Polymarket's "Ethereum Up or Down" 15-minute market, slug
// `eth-updown-15m-<window start unix>` (verified live 2026-11-09). Same comparability rule as BTC
// (tee/src/crowd/polymarket.ts): the window must end at our expiry and the call must be at-the-money
// up/down. SUI has no such market: its crowd voice is "n/a for this asset", never invented.

import type { PythAsset } from './config.ts';

const GAMMA = process.env.POLYMARKET_GAMMA_URL ?? 'https://gamma-api.polymarket.com';
const SLUG_PREFIX: Partial<Record<PythAsset, string>> = { ETH: 'eth-updown-15m' };

export type AssetCrowd =
  | { status: 'ok'; p: number; p_up: number; slug: string; title: string; url: string; end_ts: number }
  | { status: 'not_comparable' | 'unavailable' | 'disabled' | 'na'; reason: string; slug?: string; url?: string };

type Fetch = typeof fetch;
let transport: Fetch = (...a) => fetch(...a);
/** Test hook. */
export function __setCrowdTransport(f: Fetch | null): void { transport = f ?? ((...a) => fetch(...a)); }

export const crowdSlug = (asset: PythAsset, expiryMs: number): string | null => {
  const pre = SLUG_PREFIX[asset];
  if (!pre) return null;
  const endQ = Math.round(expiryMs / 1000 / 900) * 900;
  return `${pre}-${endQ - 900}`;
};

export async function assetCrowd(asset: PythAsset, expiryMs: number, side: 'up' | 'down', spot: number, strike: number): Promise<AssetCrowd> {
  const slug = crowdSlug(asset, expiryMs);
  if (!slug) return { status: 'na', reason: `n/a for this asset (Polymarket lists no ${asset} 15-minute Up/Down market)` };
  if (process.env.FEATURE_CROWD === '0' || process.env.OFFLINE === '1') return { status: 'disabled', reason: 'crowd voice off' };
  let m: any;
  try {
    const r = await transport(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`polymarket HTTP ${r.status}`);
    const arr = await r.json();
    m = Array.isArray(arr) ? arr[0] : null;
  } catch (e) { return { status: 'unavailable', reason: `Polymarket unreachable (${String((e as Error).message).slice(0, 60)})` }; }
  if (!m) return { status: 'unavailable', reason: `no Polymarket ${asset} Up/Down market for this window` };
  const outcomes: string[] = JSON.parse(m.outcomes ?? '[]');
  const prices: number[] = JSON.parse(m.outcomePrices ?? '[]').map(Number);
  const iUp = outcomes.findIndex((o) => /^up$/i.test(o));
  const url = `https://polymarket.com/event/${m.events?.[0]?.slug ?? slug}`;
  if (iUp < 0 || !Number.isFinite(prices[iUp])) return { status: 'unavailable', reason: 'Polymarket market has no Up price', slug, url };
  const end_ts = Math.floor(Date.parse(m.endDate) / 1000);
  if (Math.abs(end_ts * 1000 - expiryMs) > 60_000) return { status: 'not_comparable', reason: 'horizons differ — not compared', slug, url };
  if (Math.abs(strike - spot) / spot > 0.003) return { status: 'not_comparable', reason: 'strike is more than 0.3% from spot — not the same question', slug, url };
  if (m.closed) return { status: 'unavailable', reason: 'Polymarket window already closed', slug, url };
  const p_up = prices[iUp];
  return { status: 'ok', p: side === 'up' ? p_up : 1 - p_up, p_up, slug, title: m.question ?? slug, url, end_ts };
}
