// T0 credit runway guard: usage counted at the Tatum chokepoint, a projected runway, and degrade mode
// (quota/auth errors pause writes and serve cached reads — never a silent public fullnode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opOf, recordCall, recordCacheHit, usage, __resetUsage } from '../src/shared/tatumUsage.ts';
import { gql, tatumFetch, TATUM_URLS, tatumDegraded, __setTatumTransport, __setDegraded, TatumPausedError } from '../src/shared/tatum.ts';

const body = (query: string) => JSON.stringify({ query });

test('opOf: the first top-level field, aliases resolved, writes named', () => {
  assert.equal(opOf(body('{ checkpoint { sequenceNumber } }')), 'checkpoint');
  assert.equal(opOf(body('query($t:String!,$a:String){ events(first:50, after:$a, filter:{type:$t}) { nodes { digest } } }')), 'events');
  assert.equal(opOf(body('{ t0: transaction(digest:"a") { digest } t1: transaction(digest:"b") { digest } }')), 'transaction');
  assert.equal(opOf(body('mutation($b:String!){ executeTransaction(transactionDataBcs:$b, signatures:[]) { effects { status } } }')), 'executeTransaction');
  assert.equal(opOf('not json'), 'unknown');
});

test('usage: calls per hour by interface and operation, latency percentiles, runway from the dashboard input', () => {
  __resetUsage();
  const saved = { U: process.env.TATUM_CREDITS_USED, C: process.env.TATUM_CREDITS_PER_CALL, L: process.env.TATUM_CREDITS_LIMIT };
  try {
    process.env.TATUM_CREDITS_USED = '22000'; process.env.TATUM_CREDITS_PER_CALL = '2'; process.env.TATUM_CREDITS_LIMIT = '100000';
    const now = Date.now();
    for (let i = 0; i < 10; i++) recordCall('testnet', i < 7 ? 'events' : 'transaction', 100 + i * 10, i === 9 ? 500 : 200, now - i * 1000);
    recordCall('mainnet', 'object', 300, 200, now);
    recordCall('rates', 'rate/BTC', 80, 200, now);
    recordCall('testnet', 'events', 100, 200, now - 2 * 3_600_000);   // outside the hour: counted since start, not last hour
    recordCacheHit(now); recordCacheHit(now);
    const u = usage(now);
    assert.equal(u.calls_last_hour, 12);
    assert.equal(u.interfaces.testnet.calls_last_hour, 10);
    assert.deepEqual(u.interfaces.testnet.by_op, { events: 7, transaction: 3 });
    assert.equal(u.interfaces.testnet.error_rate, 0.1);
    assert.equal(u.interfaces.testnet.p50_ms, 150);
    assert.equal(u.interfaces.mainnet.calls_last_hour, 1);
    assert.equal(u.interfaces.rates.by_op['rate/BTC'], 1);
    assert.equal(u.calls_since_start, 13);
    assert.equal(u.credits_used_est_now, 22000 + 13 * 2);
    assert.equal(u.cache_hit_rate, Math.round((2 / 14) * 1000) / 1000);
    assert.ok(u.projected_exhaustion_iso && Date.parse(u.projected_exhaustion_iso) > now, 'a runway is projected');
    assert.equal(u.direct_fullnode_calls, 0);
    delete process.env.TATUM_CREDITS_USED;
    assert.equal(usage(now).projected_exhaustion_iso, null, 'no dashboard input → no invented runway');
  } finally {
    for (const [k, v] of Object.entries({ TATUM_CREDITS_USED: saved.U, TATUM_CREDITS_PER_CALL: saved.C, TATUM_CREDITS_LIMIT: saved.L })) {
      if (v == null) delete process.env[k]; else process.env[k] = v;
    }
    __resetUsage();
  }
});

test('degrade mode: a quota/auth refusal serves the cached read, pauses writes, and recovers on the next 200', async () => {
  __setDegraded(null);
  let mode: 'ok' | 'quota' = 'ok';
  const hosts: string[] = [];
  __setTatumTransport((async (url: any) => {
    hosts.push(new URL(String(url)).host);
    if (mode === 'quota') return new Response('{"message":"Credits exhausted"}', { status: 403 });
    return new Response(JSON.stringify({ data: { checkpoint: { sequenceNumber: 42 } } }), { status: 200 });
  }) as any);
  try {
    const q = '{ checkpoint { sequenceNumber } } # degrade-test';
    assert.equal((await gql('testnet', q)).data?.checkpoint.sequenceNumber, 42);
    await new Promise((r) => setTimeout(r, 2100));                     // past the 2 s read cache
    mode = 'quota';
    const stale = await gql('testnet', q);
    assert.equal(stale.data?.checkpoint.sequenceNumber, 42, 'the last good answer is served');
    assert.equal(tatumDegraded()?.status, 403);
    // a read never seen before has nothing cached: it fails loudly, it does not go elsewhere
    await assert.rejects(gql('testnet', '{ chainIdentifier } # degrade-test-2'), TatumPausedError);
    // writes are refused without even reaching Tatum
    const before = hosts.length;
    await assert.rejects(tatumFetch('testnet')(TATUM_URLS.testnet, { method: 'POST', body: body('mutation { executeTransaction(transactionDataBcs:"x", signatures:[]) { digest } }') }), TatumPausedError);
    assert.equal(hosts.length, before);
    assert.ok(hosts.every((h) => h === new URL(TATUM_URLS.testnet).host), 'only the Tatum host was ever called');
    mode = 'ok';
    await gql('testnet', '{ checkpoint { sequenceNumber } } # degrade-test-3');
    assert.equal(tatumDegraded(), null, 'recovers on the next successful call');
  } finally { __setTatumTransport(null); __setDegraded(null); }
});
