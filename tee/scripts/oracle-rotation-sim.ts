// Standalone simulation for Task B acceptance: the cached oracle going stale must
// auto-rotate to the next active non-settled oracle without a failed compile.
// Run: node tee/scripts/oracle-rotation-sim.ts   (no network — fetcher is injected)
import { strict as assert } from 'node:assert';
import { __setOracleFetcher, getActiveOracle, invalidateOracleCache, type OracleRec } from '../src/shared/oracle.ts';

const NOW = 1_700_000_000_000;
const HOUR = 3600_000;
const mk = (id: string, expiry: number): OracleRec => ({
  oracle_id: id, underlying_asset: 'BTC', expiry, min_strike: 50_000_000_000_000,
  tick_size: 1_000_000_000, status: 'active', settlement_price: null, settled_at: null,
});

let list: OracleRec[] = [mk('0xO1', NOW + HOUR), mk('0xO2', NOW + 2 * HOUR)];
__setOracleFetcher(async () => list);
invalidateOracleCache();

// t0 — selects nearest live oracle (O1) and caches it
const first = await getActiveOracle(NOW);
assert.equal(first.oracle_id, '0xO1', 't0 selects nearest live oracle');

// t0 again — cache hit, no rotation while it still has runway
const cached = await getActiveOracle(NOW + 5 * 60_000);
assert.equal(cached.oracle_id, '0xO1', 'cache hit while runway > 90s');

// advance to 30s before O1 expiry → O1 drops below the 90s threshold → must rotate
const tStale = (NOW + HOUR) - 30_000;
const rotated = await getActiveOracle(tStale);
assert.equal(rotated.oracle_id, '0xO2', 'rotates to next active oracle when current goes stale');
assert.ok(rotated.expiry > tStale + 90_000, 'rotated oracle has real runway → compile can proceed');

// if O1 also drops out, it keeps O2 (no throw / no failed compile)
const stillOk = await getActiveOracle(tStale + 60_000);
assert.equal(stillOk.oracle_id, '0xO2', 'stays on a valid oracle, no failed compile');

// only when NOTHING is live does it surface a clean error (not a crash mid-compile)
list = [mk('0xO1', NOW + HOUR)];
invalidateOracleCache();
let threw = false;
try { await getActiveOracle((NOW + HOUR) - 10_000); } catch (e) { threw = true; }
assert.ok(threw, 'no live oracle → clean error, surfaced before pricing');

console.log('ROTATION SIM: PASS — stale oracle auto-rotates without a failed compile');
