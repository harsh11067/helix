// Tatum chokepoint — retries on 429/5xx with backoff, injects the key, caches reads,
// and the browser proxy refuses writes (mainnet entirely read-only). No network.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { tatumFetch, __setTatumTransport, stats, checkProxyQuery, TATUM_URLS } from '../src/shared/tatum.ts';
import { allowed } from '../src/shared/rpcFacade.ts';

test('429 then 200: succeeds after backoff, key header sent, retry counted', async () => {
  process.env.TATUM_API_KEY = 't-test-key';
  let calls = 0; const seenKeys: (string | null)[] = [];
  __setTatumTransport((async (_u: any, init: any) => {
    calls++; seenKeys.push(new Headers(init.headers).get('x-api-key'));
    if (calls === 1) return new Response('{"statusCode":429}', { status: 429 });
    return new Response('{"data":{"checkpoint":{"sequenceNumber":7}}}', { status: 200, headers: { 'x-ttm-plan': 'free;ratelimit=3' } });
  }) as any);
  const before = { r: stats.retries, rl: stats.rateLimited };
  const t0 = Date.now();
  const res = await tatumFetch('testnet')(TATUM_URLS.testnet, { method: 'POST', body: JSON.stringify({ query: '{ checkpoint { sequenceNumber } } #retry' }) });
  const j = await res.json();
  assert.equal(j.data.checkpoint.sequenceNumber, 7);
  assert.equal(calls, 2);
  assert.ok(Date.now() - t0 >= 200, 'backed off before retrying');
  assert.deepEqual(seenKeys, ['t-test-key', 't-test-key']);
  assert.equal(stats.retries, before.r + 1); assert.equal(stats.rateLimited, before.rl + 1);
  assert.equal(stats.plan, 'free;ratelimit=3');
  __setTatumTransport(null);
});

test('persistent 5xx gives up with an error after bounded attempts', async () => {
  let calls = 0;
  __setTatumTransport((async () => { calls++; return new Response('bad gateway', { status: 502 }); }) as any);
  await assert.rejects(tatumFetch('mainnet')(TATUM_URLS.mainnet, { method: 'POST', body: '{"query":"{ x } #fail"}' }), /HTTP 502/);
  assert.equal(calls, 5);
  __setTatumTransport(null);
});

test('read queries are cached briefly; mutations never are', async () => {
  let calls = 0;
  __setTatumTransport((async () => { calls++; return new Response('{"data":{}}', { status: 200 }); }) as any);
  const f = tatumFetch('testnet');
  const q = { method: 'POST', body: '{"query":"{ chainIdentifier } #cache"}' };
  await f(TATUM_URLS.testnet, q); await f(TATUM_URLS.testnet, q);
  assert.equal(calls, 1, 'second identical read served from cache');
  const m = { method: 'POST', body: '{"query":"mutation { executeTransaction }"}' };
  await f(TATUM_URLS.testnet, m); await f(TATUM_URLS.testnet, m);
  assert.equal(calls, 3, 'mutations always hit the gateway');
  __setTatumTransport(null);
});

test('proxy policy: reads allowed, writes refused, mainnet read-only', () => {
  assert.equal(checkProxyQuery('testnet', { query: '{ checkpoint { sequenceNumber } }' }), null);
  assert.match(checkProxyQuery('testnet', { query: 'mutation { executeTransaction(a:1) { x } }' })!, /tx\/execute/);
  assert.match(checkProxyQuery('mainnet', { query: 'mutation M { x }' })!, /read-only/);
  assert.equal(checkProxyQuery('testnet', { query: '{ object(address:"mutation") { version } }' }), null, 'keyword inside a string is not an operation');
  assert.equal(allowed('testnet', 'unsafe_transferSui'), false);
  assert.equal(allowed('mainnet', 'sui_executeTransactionBlock'), false);
  assert.equal(allowed('testnet', 'sui_executeTransactionBlock'), true);
  assert.equal(allowed('mainnet', 'sui_getObject'), true);
});
