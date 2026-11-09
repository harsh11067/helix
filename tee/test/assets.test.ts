// P5 multi-asset — R1 constants, Pyth parsing (recorded fixture), tape, lognormal model, resolver, crowd rule,
// backward-compatible parsing (asset defaults to BTC), asset-scoped buckets, no invented voices, routes. Offline.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { parseRecord, bucketOfConviction, assetOf, type MemRecord } from '../src/memory/format.ts';
import { bucketStats } from '../src/memory/calibration.ts';
import { settledRows, perAsset } from '../src/memory/service.ts';
import { PYTH_FEEDS, assetOfFeed, parseAsset } from '../src/assets/config.ts';
import { parseSuiPythEvent, parseHermesUpdate, SuiPythTape, unavailableReason, priceSource, hermesPriceAt, __setPythTransport } from '../src/assets/pyth.ts';
import { realized, lognormalUp, helixDirectional, MIN_POINTS } from '../src/assets/model.ts';
import { pythBenchmarkResolver, MAX_LAG_S } from '../src/assets/resolver.ts';
import { crowdSlug, assetCrowd, __setCrowdTransport } from '../src/assets/crowd.ts';
import { pickWindow, assetMemoryBlock, assetCommitBody } from '../src/assets/compile.ts';
import { makeServer } from '../src/compiler/server.ts';

const FIX = JSON.parse(readFileSync(new URL('./fixtures/pyth-sui-events.json', import.meta.url), 'utf8'));
const SUI = PYTH_FEEDS.SUI;

// ---------------------------------------------------------------- Pyth (recorded on-chain events)
test('pyth: recorded Sui PriceFeedUpdateEvents parse to USD prices with publish time and verifying tx', () => {
  const ps = FIX.page.nodes.map((n: any) => parseSuiPythEvent(n.contents.json, n.transaction.digest)).filter(Boolean);
  assert.equal(ps.length, FIX.page.nodes.length);
  const sui = ps.filter((p: any) => p.feed_id === SUI);
  assert.ok(sui.length >= 5, 'SUI/USD is pushed to Pyth on Sui testnet');
  for (const p of sui) {
    assert.ok(p.price > 0.1 && p.price < 100, `plausible SUI price ${p.price}`);
    assert.ok(p.conf > 0 && p.conf < p.price * 0.05);
    assert.ok(p.publish_time > 1_790_000_000);
    assert.match(p.digest, /^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
  }
  assert.ok(!ps.some((p: any) => p.feed_id === PYTH_FEEDS.ETH), 'ETH/USD is not pushed on Sui testnet (why ETH needs Hermes)');
  // the exact arithmetic: magnitude × 10^(−expo)
  const one = parseSuiPythEvent({ price_feed: { price_identifier: { bytes: Buffer.from(SUI.slice(2), 'hex').toString('base64') }, price: { price: { negative: false, magnitude: '85153545' }, conf: '81558', expo: { negative: true, magnitude: '8' }, timestamp: '1794255193' } } });
  assert.deepEqual({ ...one, price: +one!.price.toFixed(8), conf: +one!.conf.toFixed(8) }, { feed_id: SUI, price: 0.85153545, conf: 0.00081558, publish_time: 1794255193, source: 'pyth-sui', digest: null });
});

test('pyth: Hermes PriceUpdate (documented schema: parsed[].price {price, conf, expo, publish_time}) parses the same way', async () => {
  const hermes = { binary: { encoding: 'hex', data: ['00'] }, parsed: [{ id: SUI.slice(2), price: { price: '85153545', conf: '81558', expo: -8, publish_time: 1794255193 }, ema_price: { price: '1', conf: '1', expo: -8, publish_time: 1794255193 }, metadata: {} }] };
  const p = parseHermesUpdate(hermes, SUI)!;
  assert.equal(+p.price.toFixed(8), 0.85153545); assert.equal(p.publish_time, 1794255193); assert.equal(p.source, 'pyth-hermes');
  assert.equal(parseHermesUpdate(hermes, PYTH_FEEDS.ETH), null);
  // the request: GET /v2/updates/price/{publish_time}?ids[]=<feed>&parsed=true with a bearer key; refused without a key
  delete process.env.PYTH_API_KEY;
  await assert.rejects(hermesPriceAt(SUI, 1794255000), /needs an API key/);
  process.env.PYTH_API_KEY = 'test-key';
  let seen: any = null;
  __setPythTransport((async (url: any, init: any) => { seen = { url, auth: init.headers.authorization }; return new Response(JSON.stringify(hermes), { status: 200 }); }) as any);
  try {
    const q = await hermesPriceAt(SUI, 1794255000.7);
    assert.match(seen.url, /\/v2\/updates\/price\/1794255000\?ids\[\]=23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744&parsed=true$/);
    assert.equal(seen.auth, 'Bearer test-key');
    assert.equal(q!.publish_time, 1794255193);
    assert.equal(priceSource('ETH'), 'pyth-hermes', 'with a key, ETH resolves through Hermes');
  } finally { __setPythTransport(null); delete process.env.PYTH_API_KEY; }
  assert.equal(priceSource('SUI'), 'pyth-sui');
  assert.match(unavailableReason('ETH')!, /needs a Pyth Hermes API key/);
  assert.equal(unavailableReason('SUI'), null);
});

test('pyth tape: pages backwards, dedupes, and answers "first price at or after t"', async () => {
  const nodes = FIX.page.nodes;
  let calls = 0;
  const tape = new SuiPythTape(async (before) => { calls++; return before ? { nodes: [], startCursor: null, hasPrevious: false } : { nodes, startCursor: 'c1', hasPrevious: true }; });
  const sui = nodes.map((n: any) => parseSuiPythEvent(n.contents.json, n.transaction.digest)).filter((p: any) => p.feed_id === SUI).sort((a: any, b: any) => a.publish_time - b.publish_time);
  const now = Date.parse(nodes.at(-1).timestamp);
  await tape.ensure(sui[0].publish_time, now);
  await tape.ensure(sui[0].publish_time, now + 1000);          // cached top-up: no refetch
  assert.ok(calls <= 2);
  assert.equal(tape.series(SUI, 0).length, sui.length);
  const mid = sui[2];
  assert.equal(tape.atOrAfter(SUI, mid.publish_time)!.publish_time, mid.publish_time);
  assert.equal(tape.atOrAfter(SUI, mid.publish_time + 1)!.publish_time, sui[3].publish_time);
  assert.equal(tape.atOrAfter(SUI, sui.at(-1).publish_time + 1), null, 'nothing published yet → not settled');
  assert.equal(tape.latest(SUI)!.publish_time, sui.at(-1).publish_time);
});

// ---------------------------------------------------------------- model
test('model: realized vol from Pyth prices, lognormal probability, needs 10 points', () => {
  const flat = Array.from({ length: 30 }, (_, i) => ({ publish_time: 1000 + i * 120, price: 1 + (i % 2 ? 0.01 : -0.01) }));
  const m = realized(flat)!;
  assert.equal(m.n, 30);
  assert.ok(m.sigma_s > 0 && Math.abs(m.mu_s) < 1e-4);
  assert.equal(realized(flat.slice(0, MIN_POINTS - 1)), null);
  // at-the-money with ~zero drift ≈ a coin flip; deep in/out of the money moves it
  assert.ok(Math.abs(lognormalUp(1, 1, 600, { sigma_s: m.sigma_s, mu_s: 0 }) - 0.5) < 1e-9);
  assert.ok(lognormalUp(1.05, 1, 600, { sigma_s: 1e-4, mu_s: 0 }) > 0.9);
  assert.equal(lognormalUp(2, 1, 600, { sigma_s: 1e-5, mu_s: 0 }), 0.98, 'clamped');
  assert.ok(Math.abs(helixDirectional('up', 1, 1, 600, m)! + helixDirectional('down', 1, 1, 600, m)! - 1) < 1e-12);
  assert.equal(helixDirectional('up', 1, 1, 600, null), null, 'no history → no HELIX number, never a guess');
  // on the recorded tape
  const sui = FIX.page.nodes.map((n: any) => parseSuiPythEvent(n.contents.json)).filter((p: any) => p?.feed_id === SUI);
  const r = realized(sui);
  if (sui.length >= MIN_POINTS) assert.ok(r && r.sigma_annual > 0.05 && r.sigma_annual < 10, `SUI vol ${r?.sigma_annual}`);
});

// ---------------------------------------------------------------- resolver
test('resolver: Pyth benchmark = first price at or after expiry; late prices void; nothing yet = not settled', async () => {
  const P = await import('../src/assets/pyth.ts');
  const sui = FIX.page.nodes.map((n: any) => parseSuiPythEvent(n.contents.json, n.transaction.digest)).filter((p: any) => p.feed_id === SUI).sort((a: any, b: any) => a.publish_time - b.publish_time);
  P.tape.query = async (before) => (before ? { nodes: [], startCursor: null, hasPrevious: false } : { nodes: FIX.page.nodes, startCursor: 'c', hasPrevious: true });
  P.tape.toppedAt = 0; P.tape.seen.clear(); P.tape.obs.clear(); P.tape.oldestEventTs = Infinity; P.tape.oldestCursor = null;
  const R = pythBenchmarkResolver('SUI');
  const now = Date.parse(FIX.page.nodes.at(-1).timestamp) + 1000;
  const target = sui[3];
  const s = await R.settle((target.publish_time - 5) * 1000, SUI, now);
  assert.equal(s.settled, true);
  assert.equal(s.price, target.price);
  assert.equal(s.publish_time, target.publish_time);
  assert.equal(s.lag_s, 5);
  assert.equal(s.feed_id, SUI);
  assert.equal(s.source, 'pyth-sui');
  assert.equal(s.digest, target.digest);
  const pending = await R.settle((sui.at(-1).publish_time + 10) * 1000, SUI, now);
  assert.equal(pending.settled, false); assert.ok(!pending.void);
  const gap = sui.findIndex((p: any, i: number) => i > 0 && p.publish_time - sui[i - 1].publish_time > 30);
  const late = await R.settle((sui[0].publish_time - MAX_LAG_S - 60) * 1000, SUI, now);
  assert.equal(late.settled, false); assert.equal(late.void, true, 'first price > MAX_LAG_S after expiry → VOID, never a guess');
  void gap;
  const eth = await pythBenchmarkResolver('ETH').settle(Date.now() - 60_000, PYTH_FEEDS.ETH);
  assert.equal(eth.settled, false); assert.match(eth.reason!, /Hermes API key/);
});

// ---------------------------------------------------------------- crowd (comparability rule, no invented voice)
test('crowd: ETH uses Polymarket eth-updown-15m-<start> only when the window matches; SUI is n/a', async () => {
  const exp = 1794256200000;
  assert.equal(crowdSlug('ETH', exp), 'eth-updown-15m-1794255300');
  assert.equal(crowdSlug('SUI', exp), null);
  assert.match((await assetCrowd('SUI', exp, 'up', 1, 1) as any).reason, /n\/a for this asset/);
  const market = (endDate: string) => [{ question: 'Ethereum Up or Down', endDate, outcomes: '["Up","Down"]', outcomePrices: '["0.62","0.38"]', closed: false, events: [{ slug: 'eth-updown-15m-1794255300' }] }];
  const offline = process.env.OFFLINE; delete process.env.OFFLINE;       // the crowd voice is off offline; the transport is mocked here
  __setCrowdTransport((async () => new Response(JSON.stringify(market(new Date(exp).toISOString())), { status: 200 })) as any);
  try {
    const ok: any = await assetCrowd('ETH', exp, 'down', 3000, 3000);
    assert.equal(ok.status, 'ok'); assert.ok(Math.abs(ok.p - 0.38) < 1e-12);
    __setCrowdTransport((async () => new Response(JSON.stringify(market(new Date(exp + 900_000).toISOString())), { status: 200 })) as any);
    assert.equal((await assetCrowd('ETH', exp, 'up', 3000, 3000)).status, 'not_comparable');
  } finally { __setCrowdTransport(null); if (offline != null) process.env.OFFLINE = offline; }
});

// ---------------------------------------------------------------- memory: backward compatibility + per-asset buckets
let b = 0;
const rec = (t: string): MemRecord => parseRecord(t, { blob_id: `b${++b}` })!;
const conv = (tx: string, extra: string) => rec(`CONVICTION v1 | mode=commit | dir=up | conf=0.80 | vol=choppy | structure=directional | side=up | order=binary,up,1,1 | p_you=0.860 | ${extra} | ts=1794250000 | tx=${tx}`);
const out = (tx: string, r: string) => rec(`OUTCOME v1 | tx=${tx} | mode=commit | result=${r} | ts=1794250900`);
const legacy = conv('L1', 'p_mkt=0.400 | p_hlx=0.450');                                     // written before P5: no asset key
const btc = conv('B1', 'asset=BTC | p_mkt=0.500 | p_hlx=0.500');
const sui1 = conv('S1', 'asset=SUI | p_mkt=na | p_hlx=0.600 | market=' + SUI);
const sui2 = conv('S2', 'asset=SUI | p_mkt=na | p_hlx=na | market=' + SUI);
const recs = [legacy, out('L1', 'WIN'), btc, out('B1', 'LOSS'), sui1, out('S1', 'WIN'), sui2, out('S2', 'LOSS')];

test('memory: old records parse as BTC and keep their bucket keys; other assets get scoped buckets', () => {
  assert.equal(assetOf(legacy), 'BTC');
  assert.equal(bucketOfConviction(legacy), 'up/high/choppy');
  assert.equal(bucketOfConviction(btc), 'up/high/choppy', 'BTC buckets unchanged → existing calibration, lessons, passports unchanged');
  assert.equal(bucketOfConviction(sui1), 'SUI:up/high/choppy');
  assert.equal(assetOfFeed(SUI), 'SUI'); assert.equal(assetOfFeed('0x' + '1'.repeat(64)), null);
  assert.equal(parseAsset('eth'), 'ETH'); assert.equal(parseAsset('DOGE'), null);
});

test('memory: ETH/SUI rows are scored without a market voice; BTC rows still need every voice', () => {
  const rows = settledRows(recs);
  assert.deepEqual(rows.map((r) => r.tx).sort(), ['B1', 'L1', 'S1', 'S2']);
  const brokenBtc = [conv('X1', 'asset=BTC | p_mkt=na | p_hlx=0.5'), out('X1', 'WIN')];
  assert.equal(settledRows(brokenBtc).length, 0, 'a BTC row with no market voice is still skipped, as before');
  const s = rows.find((r) => r.tx === 'S2')!;
  assert.equal(s.p_mkt, null); assert.equal(s.p_hlx, null);
  // the market Brier only uses rows where the market spoke
  const st = bucketStats(rows);
  assert.equal(st.n, 4);
  const btcOnly = bucketStats(rows.filter((r) => r.tx === 'L1' || r.tx === 'B1'));
  assert.equal(st.brier.market, btcOnly.brier.market);
  assert.ok(Math.abs(st.brier.helix! - ((0.45 - 1) ** 2 + (0.5 - 0) ** 2 + (0.6 - 1) ** 2) / 3) < 1e-12, 'helix Brier over rows that had it');
  // per-asset breakdown
  const pa = perAsset(recs, rows);
  assert.deepEqual(pa.map((a) => [a.asset, a.n, a.wins]), [['BTC', 2, 1], ['SUI', 2, 1]]);
  assert.equal(pa[1].brier.market, null, 'no invented market Brier for SUI');
});

test('compile pieces: quarter-hour windows 5–35 min ahead; memory block is asset-scoped; commit body carries Pyth evidence', () => {
  const now = Date.UTC(2026, 10, 9, 20, 20, 30);           // 20:20:30 → windows 20:30 (9.5 min), 20:45, 21:00
  assert.equal(new Date(pickWindow(0, now).expiryMs).toISOString(), '2026-11-09T20:30:00.000Z');
  assert.equal(new Date(pickWindow(3, now).expiryMs).toISOString(), '2026-11-09T20:45:00.000Z');
  const late = Date.UTC(2026, 10, 9, 20, 27, 0);            // 3 min to 20:30 → too close; next is 20:45
  assert.equal(new Date(pickWindow(0, late).expiryMs).toISOString(), '2026-11-09T20:45:00.000Z');
  const c = { direction: 60, confidence: 80, horizonCode: 0, volView: 70, capital: 5 };
  const mb: any = assetMemoryBlock(recs, 'helix-v1-x', c, 'SUI', { you: 0.86, helix: 0.6, crowd: null });
  assert.equal(mb.bucket, 'SUI:up/high/choppy');
  assert.equal(mb.n, 2); assert.equal(mb.wins, 1);
  assert.equal(mb.voices.market.p, null); assert.equal(mb.voices.market.brier, null);
  const body = assetCommitBody({ asset: 'SUI', conv: c, side: 'up', strike: 0.85043324, ref: { feed_id: SUI, price: 0.85043324, conf: 0.0008, publish_time: 1794255572, source: 'pyth-sui', digest: '5R81' }, window: { expiryMs: 1794256200000, minutesLeft: 9.9 }, helix: null, crowd: { status: 'na', reason: 'x' }, you: 0.86, memN: 2 }, { commit: 5, origin: 'cli', at: 1794255608000, nonce: 'n' });
  const r = parseRecord(body)!;
  assert.equal(assetOf(r), 'SUI'); assert.equal(bucketOfConviction(r), 'SUI:up/high/choppy');
  for (const [k, v] of [['p_mkt', 'na'], ['p_hlx', 'na'], ['p_crowd', 'na'], ['market', SUI], ['feed_id', SUI], ['oracle', 'pyth'], ['ref_px', '0.85043324'], ['order', 'binary,up,0.85043324,1'], ['expiry_ms', '1794256200000']])
    assert.equal(r.f[k], v, k);
});

// ---------------------------------------------------------------- routes (flag)
function listen(server: ReturnType<typeof makeServer>): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}
test('assets routes: 404 when FEATURE_ASSETS is off; validation and availability when on', async () => {
  delete process.env.FEATURE_ASSETS;
  let server = makeServer(); let port = await listen(server);
  try { assert.equal((await fetch(`http://localhost:${port}/assets`)).status, 404); } finally { server.close(); }
  process.env.FEATURE_ASSETS = '1';
  server = makeServer(); port = await listen(server);
  try {
    const j: any = await (await fetch(`http://localhost:${port}/assets`)).json();
    assert.deepEqual(j.assets.map((a: any) => [a.asset, a.available]), [['BTC', true], ['ETH', false], ['SUI', true]]);
    assert.equal(j.assets[1].voices.market, 'n/a for this asset');
    const bad = await fetch(`http://localhost:${port}/assets/compile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ asset: 'BTC', direction: 50, confidence: 50, volView: 50, capital: 5 }) });
    assert.equal(bad.status, 400);
    const eth = await fetch(`http://localhost:${port}/assets/compile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ asset: 'ETH', direction: 50, confidence: 50, volView: 50, capital: 5 }) });
    assert.equal(eth.status, 422); assert.match((await eth.json() as any).error, /Hermes API key/);
    const neutral = await fetch(`http://localhost:${port}/assets/compile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ asset: 'SUI', direction: 0, confidence: 50, volView: 50, capital: 5 }) });
    assert.equal(neutral.status, 422); assert.match((await neutral.json() as any).error, /directional/);
  } finally { server.close(); delete process.env.FEATURE_ASSETS; }
});
