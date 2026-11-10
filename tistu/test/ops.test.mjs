// T1 Ops panel (pure render): numbers come only from /ops/tatum; degrade mode is said out loud.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderOps, runwayText } from '../js/ops.js';

const sample = {
  calls_last_hour: 212, direct_fullnode_calls: 0, cache_hit_rate: 0.31, calls_since_start: 900, credits_per_call_est: 2, credits_per_hour_est: 424,
  projected_exhaustion_iso: new Date(Date.UTC(2026, 10, 18, 6, 0)).toISOString(), credits_used_dashboard_input: 22000,
  interfaces: { testnet: { calls_last_hour: 200, p50_ms: 180, p95_ms: 640, error_rate: 0.005, by_op: { events: 120, transaction: 60 } },
    mainnet: { calls_last_hour: 8, p50_ms: 210, p95_ms: 400, error_rate: 0, by_op: { object: 8 } }, rates: { calls_last_hour: 4, p50_ms: 90, p95_ms: 120, error_rate: 0, by_op: { 'rate/BTC': 4 } } },
  hosts: { testnet: 'sui-testnet.gateway.tatum.io', mainnet: 'sui-mainnet.gateway.tatum.io' },
  other_hosts: { 'predict-server.testnet.mystenlabs.com': 40 }, hourly: [{ hour: '2026-11-10T06:00:00.000Z', calls: 212 }],
  recent_executions: [{ net: 'testnet', digest: 'Abc123', at: 1 }], plan: 'free;ratelimit=3;strategy=shared', degraded: null,
};

test('T1 ops panel shows the measured counters, including zero direct fullnode calls', () => {
  const html = renderOps(sample, Date.UTC(2026, 10, 10, 6, 0));
  assert.match(html, /data-fullnode>0</);
  assert.match(html, />212</);
  assert.match(html, /sui-testnet\.gateway\.tatum\.io/);
  assert.match(html, /events<\/span> 120/);
  assert.match(html, /180 ms \/ 640 ms/);
  assert.match(html, /predict-server\.testnet\.mystenlabs\.com<\/span> 40/);
  assert.match(html, /suiscan\.xyz\/testnet\/tx\/Abc123/);
  assert.doesNotMatch(html, /paused/);
});

test('T1 runway: projected from the server, never invented', () => {
  assert.match(runwayText(sample, Date.UTC(2026, 10, 10, 6, 0)), /18 Nov.*8\.0 days/);
  assert.equal(runwayText({ credits_used_dashboard_input: null }), 'set TATUM_CREDITS_USED to project');
});

test('T0 degrade mode is shown as a banner', () => {
  const html = renderOps({ ...sample, degraded: { status: 403, since: 0 } });
  assert.match(html, /Live chain reads paused — showing cached data/);
  assert.match(html, /does not fall back to a public fullnode/);
  assert.match(renderOps(null), /unavailable/);
});

test('T1 the memory SDK\'s own Sui calls are shown apart from HELIX\'s, never hidden', () => {
  const html = renderOps({ ...sample, other_hosts: { ...sample.other_hosts, 'mysten-rpc.mainnet.sui.io': 2 }, memwal_sdk_sui_calls: { 'mysten-rpc.mainnet.sui.io': 2 } });
  assert.match(html, /Direct fullnode calls by HELIX/);
  assert.match(html, /Walrus Memory SDK opens its Seal session.*mysten-rpc\.mainnet\.sui\.io<\/span> 2/s);
});
