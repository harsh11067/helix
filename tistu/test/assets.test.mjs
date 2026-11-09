// P5 multi-asset Canvas + Memory: pure render helpers (no browser, no network).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assetChipsHTML, assetCompiledHTML, assetCommitControl, mountAssetSwitch, perAssetHTML } from '../js/assets.js';

const LIST = [{ asset: 'BTC', available: true }, { asset: 'ETH', available: false, reason: 'needs a Pyth Hermes API key' }, { asset: 'SUI', available: true, price_source: 'pyth-sui' }];

test('asset switcher: only callable assets, current one marked; nothing when only BTC or the feature is off', async () => {
  const html = assetChipsHTML(LIST, 'SUI');
  assert.match(html, /data-asset="BTC"/); assert.match(html, /data-asset="SUI"[^>]*>|aria-checked="true" data-asset="SUI"/);
  assert.doesNotMatch(html, /data-asset="ETH"/, 'an asset that cannot resolve is not offered');
  assert.equal(assetChipsHTML([{ asset: 'BTC', available: true }], 'BTC'), '');
  const host = { innerHTML: '', addEventListener() {} };
  assert.equal(await mountAssetSwitch(host, { api: async () => { const e = new Error('nf'); e.status = 404; throw e; }, current: () => 'BTC', onChange() {} }), null);
  assert.equal(host.innerHTML, '');
});

test('asset compile card: the call, Pyth evidence, commit-only control', () => {
  const r = { asset: 'SUI', spot: 0.8504, window: { expiryMs: 0, minutesLeft: 9.9 },
    call: { side: 'up', strike: 0.85043324, label: 'SUI above $0.850433 at 20:30 UTC' },
    price: { source: 'pyth-sui', age_s: 32, tx: '5R8144UskJEzzSRSGcxm9eBVcRq12SS7w42EdapgfdKk', feed_id: '0x23d7315113f5b1d3' },
    voices: { you: 0.75, market: null, helix: 0.59, crowd: null, market_detail: { status: 'na' }, crowd_detail: { status: 'na' }, council_detail: { status: 'off' } },
    memory: { status: 'ok', n: 0, message: 'No settled SUI history', bucket: 'SUI:up/mid/calm', commit: 5, suggested_commit: 5 },
    guardian: [{ cls: 'mode', bad: false, t: 'Sui has no DeepBook Predict market' }] };
  const html = assetCompiledHTML(r, { voicesHTML: () => '<i>voices</i>', memoryBlockHTML: () => '<i>mem</i>', chosen: {}, explorer: (d) => 'https://suiscan.xyz/testnet/tx/' + d, commitControl: assetCommitControl({ account: { address: '0x1' } }) });
  assert.match(html, /SUI above \$0\.850433 at 20:30 UTC/);
  assert.match(html, /market n\/a/);
  assert.match(html, /Pyth on Sui · 32s old/);
  assert.match(html, /suiscan\.xyz\/testnet\/tx\/5R8144/);
  assert.match(html, /id="commit"/); assert.doesNotMatch(html, /id="deploy"/, 'no mint: there is no Predict market');
  assert.match(html, /id="deploy-out"/);
  assert.match(assetCommitControl({ account: null, readOnly: true, banner: 'demo' }), /read-only demo/);
});

test('memory page: per-asset panel only when a non-BTC call exists; market Brier n/a for ETH/SUI', () => {
  assert.equal(perAssetHTML(undefined), '');
  assert.equal(perAssetHTML([{ asset: 'BTC', n: 3, wins: 1, posterior: 0.43, brier: { you: 0.4, market: 0.25, helix: 0.24 } }]), '');
  const html = perAssetHTML([{ asset: 'BTC', n: 25, wins: 10, posterior: 0.41, brier: { you: 0.43, market: 0.25, helix: 0.25 } }, { asset: 'SUI', n: 2, wins: 1, posterior: 0.5, brier: { you: 0.3, market: null, helix: 0.2 } }]);
  assert.match(html, /<b>SUI<\/b>/); assert.match(html, /n\/a/); assert.match(html, /0\.25/);
});
