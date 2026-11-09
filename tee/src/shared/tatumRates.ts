// tatumRates — Price Witness (WIN_FEATURES.md W2): an independent BTC/USD price from
// Tatum's exchange-rate Data API (a second Tatum product alongside the Sui gateway).
// Used in the guardian ("price sources disagree by X bps") and stamped into every
// OUTCOME memory at settlement. The free plan can lag a few minutes, so the age is
// always reported next to the number. Kill switch: FEATURE_WITNESS=0.

const RATE_URL = process.env.TATUM_RATE_URL ?? 'https://api.tatum.io/v3/tatum/rate/BTC?basePair=USD';
const enabled = () => process.env.FEATURE_WITNESS !== '0' && process.env.OFFLINE !== '1' && !!process.env.TATUM_API_KEY;

let cache: { at: number; v: { usd: number; ts: number; source: string } } | null = null;

let inflight: Promise<{ usd: number; ts: number; source: string }> | null = null;
export async function getBtcUsd(): Promise<{ usd: number; ts: number; source: string }> {
  const age = cache ? Date.now() - cache.at : Infinity;
  if (age < 30_000) return cache!.v;
  inflight ??= fetchBtcUsd().finally(() => { inflight = null; });
  // stale-while-revalidate: the witness reports its own price age (tatum_age_s), so a compile can use it now
  if (age < 120_000) { inflight.catch(() => {}); return cache!.v; }
  return inflight;
}
async function fetchBtcUsd(): Promise<{ usd: number; ts: number; source: string }> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
  try {
    const r = await fetch(RATE_URL, { headers: { 'x-api-key': process.env.TATUM_API_KEY!.trim() }, signal: c.signal });
    if (!r.ok) throw new Error(`tatum rate HTTP ${r.status}`);
    const j = await r.json();
    const usd = Number(j.value);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error('tatum rate: no value');
    const v = { usd, ts: Number(j.timestamp) || Date.now(), source: String(j.source ?? 'tatum') };
    cache = { at: Date.now(), v };
    return v;
  } finally { clearTimeout(t); }
}

export interface Witness {
  status: 'ok' | 'disabled' | 'unavailable';
  tatum_usd: number | null; oracle_usd: number | null; diff_bps: number | null;
  tatum_ts: number | null; tatum_age_s: number | null; source?: string; reason?: string;
}

export async function witnessBtc(oracleUsd: number | null): Promise<Witness> {
  if (!enabled()) return { status: 'disabled', tatum_usd: null, oracle_usd: oracleUsd, diff_bps: null, tatum_ts: null, tatum_age_s: null, reason: 'FEATURE_WITNESS off or no key' };
  try {
    const t = await getBtcUsd();
    const diff = oracleUsd ? ((t.usd - oracleUsd) / oracleUsd) * 10_000 : null;
    return {
      status: 'ok', tatum_usd: t.usd, oracle_usd: oracleUsd, diff_bps: diff == null ? null : Math.round(diff * 10) / 10,
      tatum_ts: t.ts, tatum_age_s: Math.max(0, Math.round((Date.now() - t.ts) / 1000)), source: t.source,
    };
  } catch (e) {
    return { status: 'unavailable', tatum_usd: null, oracle_usd: oracleUsd, diff_bps: null, tatum_ts: null, tatum_age_s: null, reason: (e as Error).message.slice(0, 100) };
  }
}
