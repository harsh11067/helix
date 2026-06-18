// oracle — REAL DeepBook Predict data layer (replaces mockOracle on the live path,
// architecture.md §9, plan Phase 3 / CLAUDE.md Task 1).
//
// Reads the live testnet Predict server:
//   GET /predicts/:id/oracles          → pick an active, non-settled BTC oracle
//   GET /oracles/:id/state             → spot/forward + latest price + latest SVI
//   GET /oracles/:id/svi/latest        → latest SVI surface params
//   GET /predicts/:id/vault/summary    → PLP utilization (best-effort)
//
// The on-chain SVI stores total-variance params w(k)=a+b(rho(k-m)+sqrt((k-m)^2+sigma^2))
// as 1e9 fixed-point (same scale as spot/strike). We convert to the float
// MarketSnapshot the compiler already consumes (shape from mockOracle.ts), and
// rescale a,b so sviIV() at the compiler's horizon T reproduces the real
// annualized IV — i.e. the structure is genuinely priced from real testnet SVI.

import { horizonYears, type MarketSnapshot, type SviParams } from './mockOracle.ts';

const BASE = process.env.PREDICT_SERVER ?? 'https://predict-server.testnet.mystenlabs.com';
const PREDICT_OBJ = process.env.PREDICT_OBJECT ?? '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const FP = 1e9;                          // on-chain fixed-point scale (spot/strike/SVI)
const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const SELECT_BUFFER_MS = 90_000;         // skip oracles within 90s of expiry (mid-settlement risk)

export interface OracleRec {
  oracle_id: string; underlying_asset: string; expiry: number;
  min_strike: number; tick_size: number; status: string;
  settlement_price: number | null; settled_at: number | null;
}
export interface RawSvi {
  a: number; b: number; rho: number; rho_negative: boolean;
  m: number; m_negative: boolean; sigma: number; onchain_timestamp: number;
}

async function getJson(path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

// Oracle-list fetcher is injectable so the rotation logic can be tested/simulated
// deterministically without hitting the network.
let oracleFetcher: () => Promise<OracleRec[]> = () => getJson(`/predicts/${PREDICT_OBJ}/oracles`);
export function __setOracleFetcher(fn: () => Promise<OracleRec[]>): void { oracleFetcher = fn; }

/** All oracles for the Predict market. */
export async function fetchOracles(): Promise<OracleRec[]> {
  return oracleFetcher();
}

// --- selection cache + rotation (so a demo never compiles against an oracle that
//     settles mid-session) ---
let cachedOracle: OracleRec | null = null;
export function invalidateOracleCache(): void { cachedOracle = null; }
function oracleHasRunway(o: OracleRec | null, now: number): boolean {
  return !!o && o.status === 'active' && o.settlement_price == null && o.settled_at == null
    && o.expiry > now + SELECT_BUFFER_MS;
}

/**
 * Return a usable BTC oracle, caching the selection. On each call we re-validate
 * the cached oracle's runway; once it drops below the 90s threshold (or settles)
 * we auto-rotate to the next active non-settled oracle. This is what every live
 * compile calls, so the cache avoids re-listing on every keystroke while still
 * rotating before the current oracle can settle out from under the session.
 */
export async function getActiveOracle(now = Date.now()): Promise<OracleRec> {
  if (oracleHasRunway(cachedOracle, now)) return cachedOracle!;  // cache hit, still fresh
  cachedOracle = await selectActiveBtcOracle(now);               // (re)select → rotate
  return cachedOracle;
}

/** Current oracle state (spot/forward + latest price + latest SVI). */
export async function fetchOracleState(oracleId: string): Promise<any> {
  return getJson(`/oracles/${oracleId}/state`);
}

/** Latest SVI surface for an oracle. */
export async function fetchLatestSVI(oracleId: string): Promise<RawSvi> {
  return getJson(`/oracles/${oracleId}/svi/latest`);
}

/**
 * Pick an active, non-settled BTC oracle. Sub-hour oracles roll, so the nearest
 * one is sometimes mid-settlement — we skip any that is settled, not "active",
 * or within SELECT_BUFFER_MS of expiry, and fall to the next active one
 * (nearest first among the remaining live oracles).
 */
export async function selectActiveBtcOracle(now = Date.now()): Promise<OracleRec> {
  const all = await fetchOracles();
  const live = all
    .filter((o) => o.underlying_asset === 'BTC'
      && o.status === 'active'
      && o.settlement_price == null
      && o.settled_at == null
      && o.expiry > now + SELECT_BUFFER_MS)
    .sort((a, b) => a.expiry - b.expiry); // nearest live first
  if (!live.length) throw new Error('no active non-settled BTC oracle available');
  return live[0];
}

/** Staleness guard — a required Risk-Guardian class. Accepts ms or s timestamps. */
export function isSVIStale(svi: { timestamp: number }, maxAgeSec = 60, now = Date.now()): boolean {
  const tsSec = svi.timestamp > 1e12 ? svi.timestamp / 1000 : svi.timestamp;
  return now / 1000 - tsSec > maxAgeSec;
}

/** PLP utilization in bps, best-effort (returns 0 if the endpoint shape is unknown). */
async function fetchPlpBps(): Promise<number> {
  try {
    const v = await getJson(`/predicts/${PREDICT_OBJ}/vault/summary`);
    if (typeof v.utilization_bps === 'number') return v.utilization_bps;
    if (typeof v.utilization === 'number') return Math.round(v.utilization * 10000);
    const mtm = Number(v.total_mtm ?? v.total_max_payout ?? 0);
    const val = Number(v.vault_value ?? v.balance ?? 0);
    if (val > 0) return Math.round((mtm / (val + mtm)) * 10000);
    return 0;
  } catch { return 0; }
}

/** Convert raw 1e9 fixed-point SVI to float, rescaled to the compiler horizon T. */
export function toSnapshotSvi(raw: RawSvi, tReal: number, tUsed: number): SviParams {
  const a = raw.a / FP, b = raw.b / FP, sigma = raw.sigma / FP;
  const rho = (raw.rho_negative ? -1 : 1) * (raw.rho / FP);
  const m = (raw.m_negative ? -1 : 1) * (raw.m / FP);
  // total variance scales linearly with time; restate to the pipeline's T so
  // sviIV(svi, k) = sqrt(w/tUsed) equals the real annualized IV sqrt(w_real/tReal)
  const sc = tReal > 0 ? tUsed / tReal : 1;
  return { a: a * sc, b: b * sc, rho, m, sigma, T: tUsed };
}

/** Live MarketSnapshot from the real Predict feed (drop-in for getSnapshot). */
export async function getLiveSnapshot(horizonCode: number, _volView = 50, now = Date.now()): Promise<MarketSnapshot> {
  let oracle = await getActiveOracle(now);
  let state = await fetchOracleState(oracle.oracle_id);
  // per-compile freshness re-validation: if the cached oracle settled/expired
  // since selection, rotate once before pricing (never compile against a dead oracle)
  const so = state.oracle;
  if ((so && (so.status !== 'active' || so.settlement_price != null || so.settled_at != null)) || oracle.expiry <= now + SELECT_BUFFER_MS) {
    invalidateOracleCache();
    oracle = await getActiveOracle(now);
    state = await fetchOracleState(oracle.oracle_id);
  }
  const plpUtilizationBps = await fetchPlpBps();
  const raw: RawSvi = state.latest_svi ?? (await fetchLatestSVI(oracle.oracle_id));
  const spot = Number(state.latest_price?.spot ?? state.oracle?.spot_price ?? oracle.min_strike) / FP;
  const tReal = Math.max((Number(oracle.expiry) - now) / YEAR_MS, 1 / (365 * 24 * 60)); // floor 1 min
  const tUsed = horizonYears(horizonCode);
  const svi = toSnapshotSvi(raw, tReal, tUsed);
  const stale = isSVIStale({ timestamp: raw.onchain_timestamp }, 60, now);
  const snap: MarketSnapshot = { spot, svi, plpUtilizationBps, orderbookDepth: 0, stale };
  // diagnostics for the live /compile (not part of MarketSnapshot contract)
  (snap as any)._oracle = oracle;
  (snap as any)._sviRaw = raw;
  (snap as any)._tReal = tReal;
  return snap;
}
