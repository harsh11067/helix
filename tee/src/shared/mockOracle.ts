// mockOracle — stands in for the live data layer the Compiler reads:
//   * Block Scholes SVI volatility surface  (oracle::OracleSVIUpdated)
//   * Pyth spot price
//   * DeepBook Predict PLP utilization + orderbook depth
//
// Replaced by real on-chain reads before final (architecture.md §9, plan Phase 3).
// Deterministic given a timestamp so tests are reproducible.

export interface SviParams {
  // raw SVI total-variance params: w(k) = a + b (rho (k-m) + sqrt((k-m)^2 + sigma^2))
  a: number; b: number; rho: number; m: number; sigma: number;
  T: number; // years to expiry
}

export interface MarketSnapshot {
  spot: number;
  svi: SviParams;
  plpUtilizationBps: number;
  orderbookDepth: number; // available size near touch, in dUSDC notional
  stale: boolean;         // true → Risk Guardian blocks new compiles
}

const HORIZON_YEARS = [1 / (365 * 24), 4 / (365 * 24), 12 / (365 * 24), 1 / 365];

export function horizonYears(horizonCode: number): number {
  return HORIZON_YEARS[horizonCode] ?? HORIZON_YEARS[0];
}

// Implied vol from the SVI surface at log-moneyness k = ln(K/F).
export function sviIV(svi: SviParams, k: number): number {
  const w = svi.a + svi.b * (svi.rho * (k - svi.m) + Math.sqrt((k - svi.m) ** 2 + svi.sigma ** 2));
  const totalVar = Math.max(w, 1e-6);
  return Math.sqrt(totalVar / svi.T);
}

// A plausible BTC snapshot. `volView` (0..100) nudges the surface level so the
// compiler reacts to the user's volatility expectation; `now` keeps it stable.
export function getSnapshot(horizonCode: number, volView = 50, now = 0): MarketSnapshot {
  const T = horizonYears(horizonCode);
  // base level ~ 55% annualized ATM vol, scaled by vol view
  const level = 0.30 + (volView / 100) * 0.70; // 30%..100%
  const a = (level * level) * T;               // ATM total variance
  const wobble = 0.0; // (now % 3600) hook kept for determinism if needed
  return {
    spot: 60000 + wobble,
    svi: { a, b: 0.12 * T, rho: -0.15, m: 0.0, sigma: 0.10, T },
    plpUtilizationBps: 4200,
    orderbookDepth: 250_000,
    stale: false,
  };
}

export function atmIV(snap: MarketSnapshot): number {
  return sviIV(snap.svi, 0);
}
