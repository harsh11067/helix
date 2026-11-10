// Tatum price witness (shared/tatumRates.ts): one independent USD price per asset, compared with the oracle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { witness, __setRateTransport } from '../src/shared/tatumRates.ts';

test('witness: per-asset Tatum rate vs the oracle, in bps, with the price age; off when disabled', async () => {
  const saved = { OFFLINE: process.env.OFFLINE, KEY: process.env.TATUM_API_KEY, FW: process.env.FEATURE_WITNESS };
  const seen: string[] = [];
  const now = 1_794_273_200_000;
  __setRateTransport((async (url: any, init: any) => {
    seen.push(`${url} key=${init.headers['x-api-key']}`);
    const sym = String(url).match(/rate\/([A-Z]+)/)![1];
    const value = { ETH: '2127.00', SUI: '0.8400', BTC: '75000' }[sym];
    return new Response(JSON.stringify({ value, basePair: 'USD', timestamp: now - 45_000, source: 'CoinGecko', id: sym }), { status: 200 });
  }) as any);
  try {
    process.env.OFFLINE = '0'; process.env.TATUM_API_KEY = 'k'; delete process.env.FEATURE_WITNESS;
    const eth = await witness('ETH', 2122.96, now);
    assert.equal(eth.status, 'ok'); assert.equal(eth.symbol, 'ETH'); assert.equal(eth.tatum_usd, 2127);
    assert.equal(eth.diff_bps, Math.round(((2127 - 2122.96) / 2122.96) * 100_000) / 10);   // ≈ 19.0 bps
    assert.equal(eth.tatum_age_s, 45); assert.equal(eth.source, 'CoinGecko');
    const sui = await witness('SUI', 0.845, now);
    assert.equal(sui.tatum_usd, 0.84); assert.ok(sui.diff_bps! < 0);
    assert.ok(seen.some((s) => /\/v3\/tatum\/rate\/ETH\?basePair=USD key=k$/.test(s)));
    assert.ok(seen.some((s) => /\/rate\/SUI\?/.test(s)));
    await witness('ETH', 2122.96, now); assert.equal(seen.filter((s) => /ETH/.test(s)).length, 1, 'cached for 30s');
    process.env.FEATURE_WITNESS = '0';
    assert.equal((await witness('ETH', 2122.96, now)).status, 'disabled');
    delete process.env.FEATURE_WITNESS;
    __setRateTransport((async () => new Response('{}', { status: 503 })) as any);
    const down = await witness('BTC', 75_000, now);
    assert.equal(down.status, 'unavailable'); assert.match(down.reason!, /HTTP 503/);
  } finally {
    __setRateTransport(null);
    for (const [k, v] of [['OFFLINE', saved.OFFLINE], ['TATUM_API_KEY', saved.KEY], ['FEATURE_WITNESS', saved.FW]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
