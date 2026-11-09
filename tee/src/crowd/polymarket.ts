// polymarket — the Crowd voice (WIN_FEATURES.md W1).
//
// Polymarket lists a "Bitcoin Up or Down" market for every 15-minute window, slug
// `btc-updown-15m-<window start unix>`, resolving Up if BTC at the end of the window
// is ≥ the price at its start. DeepBook Predict's 15-minute windows end on the same
// quarter-hours, so for an at-the-money directional bet the two are pricing the same
// question. Comparability rule (honesty first):
//   • HELIX's order is a directional up/down bet, strike within 0.3% of spot, and
//   • the Polymarket window ends within 60s of the Predict expiry.
// Otherwise: status "not_comparable" and no number is used. Unreachable → "unavailable".
// Never a fabricated probability. Kill switch: FEATURE_CROWD=0.

import type { LiveMarket, PredictOrder, PricerView } from '../predict/predict.ts';

const GAMMA = process.env.POLYMARKET_GAMMA_URL ?? 'https://gamma-api.polymarket.com';
const enabled = () => process.env.FEATURE_CROWD !== '0' && process.env.OFFLINE !== '1';

export type CrowdView =
  | { status: 'ok'; p: number; p_up: number; slug: string; title: string; url: string; end_ts: number; resolution_text: string }
  | { status: 'not_comparable' | 'unavailable' | 'disabled'; reason: string; slug?: string; url?: string; p_up?: number };

export interface CrowdMarket { slug: string; title: string; end_ts: number; p_up: number; source_url: string; resolution_text: string; active: boolean; closed: boolean }

const cache = new Map<string, { at: number; v: CrowdMarket | null }>();

async function fetchSlug(slug: string, attempt = 0): Promise<CrowdMarket | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < 15_000) return hit.v;
  // some networks reset connections to Polymarket's CDN intermittently: retry with backoff
  try { return await fetchSlugOnce(slug); }
  catch (e) { if (attempt < 2) { await new Promise((r) => setTimeout(r, 300 + attempt * 500)); return fetchSlug(slug, attempt + 1); } throw e; }
}

async function fetchSlugOnce(slug: string): Promise<CrowdMarket | null> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
  let v: CrowdMarket | null = null;
  try {
    const r = await fetch(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}`, { signal: c.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`polymarket HTTP ${r.status}`);
    const arr = await r.json();
    const m = Array.isArray(arr) ? arr[0] : null;
    if (m) {
      const outcomes: string[] = JSON.parse(m.outcomes ?? '[]');
      const prices: number[] = JSON.parse(m.outcomePrices ?? '[]').map(Number);
      const iUp = outcomes.findIndex((o) => /^up$/i.test(o));
      if (iUp >= 0 && Number.isFinite(prices[iUp])) {
        v = {
          slug, title: m.question ?? slug, end_ts: Math.floor(Date.parse(m.endDate) / 1000), p_up: prices[iUp],
          source_url: `https://polymarket.com/event/${m.events?.[0]?.slug ?? slug}`,
          resolution_text: String(m.description ?? '').slice(0, 400), active: !!m.active, closed: !!m.closed,
        };
      }
    }
  } finally { clearTimeout(t); }
  cache.set(slug, { at: Date.now(), v });
  if (cache.size > 200) cache.clear();
  return v;
}

/** The Polymarket BTC 15-minute Up/Down market whose window ends nearest `expiryMs`. */
export async function crowdMarketFor(expiryMs: number): Promise<CrowdMarket | null> {
  const endQ = Math.round(expiryMs / 1000 / 900) * 900;      // nearest quarter-hour end
  return fetchSlug(`btc-updown-15m-${endQ - 900}`);
}

export async function crowdVoice(m: LiveMarket, order: PredictOrder, pv: PricerView): Promise<CrowdView> {
  if (!enabled()) return { status: 'disabled', reason: 'FEATURE_CROWD off' };
  let cm: CrowdMarket | null;
  try { cm = await crowdMarketFor(m.expiryMs); }
  catch (e) {
    console.warn('[crowd] polymarket fetch', (e as Error).message, (e as any).cause?.code ?? '', (e as any).cause?.message ?? '');
    return { status: 'unavailable', reason: `Polymarket unreachable (${(e as Error).message.slice(0, 60)})` };
  }
  if (!cm) return { status: 'unavailable', reason: 'no Polymarket BTC Up/Down market for this window' };
  const base = { slug: cm.slug, url: cm.source_url, p_up: cm.p_up };
  if (Math.abs(cm.end_ts * 1000 - m.expiryMs) > 60_000) return { status: 'not_comparable', reason: 'horizons differ — not compared', ...base };
  if (order.kind !== 'directional' || order.strike == null) return { status: 'not_comparable', reason: 'HELIX order is a range — Polymarket prices up/down only', ...base };
  if (Math.abs(order.strike - pv.forward) / pv.forward > 0.003) return { status: 'not_comparable', reason: 'strike is more than 0.3% from spot — not the same question', ...base };
  if (cm.closed) return { status: 'unavailable', reason: 'Polymarket window already closed', ...base };
  const p = order.side === 'up' ? cm.p_up : 1 - cm.p_up;
  return { status: 'ok', p, p_up: cm.p_up, slug: cm.slug, title: cm.title, url: cm.source_url, end_ts: cm.end_ts, resolution_text: cm.resolution_text };
}
