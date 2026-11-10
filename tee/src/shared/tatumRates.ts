// tatumRates — Price Witness (WIN_FEATURES.md W2): an independent USD price from Tatum's exchange-rate
// Data API (a second Tatum product alongside the Sui gateway), for every asset HELIX settles: BTC (vs the
// DeepBook Predict oracle) and ETH / SUI (vs Pyth). Used in the guardian ("price sources disagree by X bps")
// and stamped into every OUTCOME memory at settlement. The free plan can lag a few minutes, so the age is
// always reported next to the number. Kill switch: FEATURE_WITNESS=0.

import { recordCall } from './tatumUsage.ts';

export type WitnessSymbol = 'BTC' | 'ETH' | 'SUI';
// TATUM_RATE_URL (legacy, BTC only) is still honoured; {SYM} in TATUM_RATE_URL_TEMPLATE is the symbol.
const rateUrl = (sym: WitnessSymbol) =>
  sym === 'BTC' && process.env.TATUM_RATE_URL ? process.env.TATUM_RATE_URL
    : (process.env.TATUM_RATE_URL_TEMPLATE ?? 'https://api.tatum.io/v3/tatum/rate/{SYM}?basePair=USD').replace('{SYM}', sym);
const enabled = () => process.env.FEATURE_WITNESS !== '0' && process.env.OFFLINE !== '1' && !!process.env.TATUM_API_KEY;

type Rate = { usd: number; ts: number; source: string };
type Fetch = typeof fetch;
let transport: Fetch = (...a) => fetch(...a);
/** Test hook. */
export function __setRateTransport(f: Fetch | null): void { transport = f ?? ((...a) => fetch(...a)); cache.clear(); }

const cache = new Map<WitnessSymbol, { at: number; v: Rate }>();
const inflight = new Map<WitnessSymbol, Promise<Rate>>();
export async function getUsd(sym: WitnessSymbol): Promise<Rate> {
  const hit = cache.get(sym);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (age < 30_000) return hit!.v;
  let p = inflight.get(sym);
  if (!p) { p = fetchUsd(sym).finally(() => inflight.delete(sym)); inflight.set(sym, p); }
  // stale-while-revalidate: the witness reports its own price age (tatum_age_s), so a compile can use it now
  if (age < 120_000) { p.catch(() => {}); return hit!.v; }
  return p;
}
export const getBtcUsd = () => getUsd('BTC');

async function fetchUsd(sym: WitnessSymbol): Promise<Rate> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
  try {
    const t0 = Date.now();
    const r = await transport(rateUrl(sym), { headers: { 'x-api-key': (process.env.TATUM_API_KEY ?? '').trim() }, signal: c.signal });
    recordCall('rates', `rate/${sym}`, Date.now() - t0, r.status);
    if (!r.ok) throw new Error(`tatum rate HTTP ${r.status}`);
    const j: any = await r.json();
    const usd = Number(j.value);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error('tatum rate: no value');
    const v = { usd, ts: Number(j.timestamp) || Date.now(), source: String(j.source ?? 'tatum') };
    cache.set(sym, { at: Date.now(), v });
    return v;
  } finally { clearTimeout(t); }
}

export interface Witness {
  status: 'ok' | 'disabled' | 'unavailable';
  symbol?: WitnessSymbol;
  tatum_usd: number | null; oracle_usd: number | null; diff_bps: number | null;
  tatum_ts: number | null; tatum_age_s: number | null; source?: string; reason?: string;
}

/** Tatum's price for `sym` against an oracle price (Predict for BTC, Pyth for ETH/SUI), in basis points. */
export async function witness(sym: WitnessSymbol, oracleUsd: number | null, now = Date.now()): Promise<Witness> {
  if (!enabled()) return { status: 'disabled', symbol: sym, tatum_usd: null, oracle_usd: oracleUsd, diff_bps: null, tatum_ts: null, tatum_age_s: null, reason: 'FEATURE_WITNESS off or no key' };
  try {
    const t = await getUsd(sym);
    const diff = oracleUsd ? ((t.usd - oracleUsd) / oracleUsd) * 10_000 : null;
    return {
      status: 'ok', symbol: sym, tatum_usd: t.usd, oracle_usd: oracleUsd, diff_bps: diff == null ? null : Math.round(diff * 10) / 10,
      tatum_ts: t.ts, tatum_age_s: Math.max(0, Math.round((now - t.ts) / 1000)), source: t.source,
    };
  } catch (e) {
    return { status: 'unavailable', symbol: sym, tatum_usd: null, oracle_usd: oracleUsd, diff_bps: null, tatum_ts: null, tatum_age_s: null, reason: (e as Error).message.slice(0, 100) };
  }
}
export const witnessBtc = (oracleUsd: number | null) => witness('BTC', oracleUsd);
