// N1 Memory Time Machine: the browser replays calibration with the server's own modules.
//   N1-01 end-state equality: the replay at "now" equals the live Memory page's numbers exactly
//   N1-02 learning visible: scrubbing back changes gap, suggestion and weights; key moments are found
//   N1-03 shared math: tistu/js/vendor/memory.js is byte-for-byte the type-stripped server modules, and
//         the vendored bundle computes the same state as the TypeScript it was built from
// Runs against the SDK's MemWalMock (OFFLINE=1): no network, no keys.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

process.env.OFFLINE = '1';
const { formatRecord, parseRecord, namespaceFor } = await import('../src/memory/format.ts');
const { remember, recallAll, __resetMemwal } = await import('../src/memory/store.ts');
const { timelineFor } = await import('../src/memory/service.ts');
const { historyFor } = await import('../src/memory/timemachine.ts');
const rows = await import('../src/memory/rows.ts');
const vendored: typeof rows = await import('../../tistu/js/vendor/memory.js' as string);
const { bundleMemory, OUT } = await import('../../tistu/js/vendor/build-memory.mjs' as string);

const ADDR = '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
const conviction = (tx: string, ts: number, p_you: string, extra: [string, unknown][] = []) =>
  formatRecord('CONVICTION', [['tx', tx], ['mode', 'commit'], ['asset', 'BTC'], ['dir', 'up'], ['conf', '0.80'], ['vol', 'choppy'], ['structure', 'directional'], ['regime', 'trend_up'],
    ['commit', '5.00'], ['sugg_commit', '5.00'], ['mem_n', 0], ['p_you', p_you], ['p_mkt', '0.550'], ['p_hlx', '0.520'], ['price', '0.550'], ['ts', ts], ...extra]);
const outcome = (tx: string, ts: number, result: 'WIN' | 'LOSS') =>
  formatRecord('OUTCOME', [['tx', tx], ['mode', 'commit'], ['result', result], ['payoff', result === 'WIN' ? '+4.00' : '-5.00'], ['settle_px', '100000'], ['strike_px', '99000'], ['ts', ts]]);

/** Six calls at 80% stated confidence, two won: a hot trader whose gap opens as the outcomes land. */
async function seed(ns: string) {
  __resetMemwal();
  const plan: [string, number, 'WIN' | 'LOSS'][] = [['T1', 100, 'LOSS'], ['T2', 200, 'WIN'], ['T3', 300, 'LOSS'], ['T4', 400, 'LOSS'], ['T5', 500, 'WIN'], ['T6', 600, 'LOSS']];
  for (const [tx, ts, res] of plan) {
    await remember(ns, conviction(tx, ts, '0.860'), { tx });
    await remember(ns, outcome(tx, ts + 50, res), { tx });
  }
  await remember(ns, formatRecord('LESSON', [['tx', 'T3'], ['bucket', 'up/high/choppy'], ['n', 3], ['text', 'Won 1/3 here; size down.'], ['ts', 351]]), { tx: 'T3' });
  return recallAll(ns, { fresh: true });
}

test('N1-01: Time Machine at "now" equals the live Memory page exactly', async () => {
  const ns = namespaceFor(ADDR);
  const recs = await seed(ns);
  const live = await timelineFor(ADDR);
  const h = await historyFor(ADDR);
  assert.equal(h.count, live.count);
  assert.deepEqual(h.end_state.overall, live.overall, 'overall calibration');
  assert.deepEqual(h.end_state.buckets.map((b) => ({ bucket: b.bucket, ...b.stats })), live.buckets, 'per-bucket calibration');
  // the browser's replay over the route's records at Infinity is the same object
  const browserRecs = h.records.map((r) => ({ type: r.type, version: 1, f: r.fields, text: r.text, blob_id: r.blob_id, created_at: r.created_at })) as any;
  const replay = vendored.replayState(browserRecs, Infinity, h.setup);
  assert.deepEqual(replay.overall, live.overall);
  assert.deepEqual(replay.suggestion, h.end_state.suggestion);
  assert.equal(replay.count, recs.length);
});

test('N1-02: scrubbing back changes the gap and the suggestion; key moments are marked', async () => {
  const ns = namespaceFor(ADDR);
  const recs = await seed(ns);
  const setup = rows.latestSetup(recs)!;
  assert.equal(setup.bucket, 'up/high/choppy');
  const before = rows.replayState(recs, 99, setup);          // before the first memory
  const early = rows.replayState(recs, 260, setup);          // after T1 loss + T2 win (n=2)
  const mid = rows.replayState(recs, 360, setup);            // n=3: memory starts to act
  const end = rows.replayState(recs, Infinity, setup);
  assert.equal(before.count, 0); assert.equal(before.overall.n, 0); assert.equal(before.suggestion!.basis, 'no_history');
  assert.equal(early.overall.n, 2); assert.equal(early.suggestion!.basis, 'no_history'); assert.equal(early.suggestion!.suggested, 5);
  assert.equal(mid.overall.n, 3); assert.equal(mid.suggestion!.basis, 'kelly'); assert.ok(mid.suggestion!.suggested < 5, 'memory shrinks the size once n ≥ 3');
  assert.equal(end.overall.n, 6); assert.equal(end.overall.wins, 2);
  assert.ok(end.overall.gap_you! > mid.overall.gap_you!, `gap opens as losses land (${mid.overall.gap_you} → ${end.overall.gap_you})`);
  assert.ok(end.suggestion!.suggested <= mid.suggestion!.suggested, 'suggestion shrinks');
  assert.equal(mid.lessons.length, 1); assert.equal(early.lessons.length, 0);
  // key moments: first outcome, first lesson, first bucket at n=3, biggest Council weight shift
  const council = [
    { ts: 150, weights: { momentum: 0.25, reversion: 0.25, surface: 0.25, crowd: 0.25 } },
    { ts: 450, weights: { momentum: 0.4, reversion: 0.1, surface: 0.3, crowd: 0.2 } },
    { ts: 550, weights: { momentum: 0.42, reversion: 0.08, surface: 0.3, crowd: 0.2 } },
  ];
  const km = rows.keyMoments(recs, council);
  assert.deepEqual(km.map((m) => [m.kind, m.ts]), [['first_outcome', 150], ['first_lesson', 351], ['first_n3', 350], ['weights_shift', 450]].sort((a, b) => (a[1] as number) - (b[1] as number)));
});

test('N1-03: the browser bundle IS the server math (no drift, same results)', async () => {
  assert.equal(readFileSync(OUT, 'utf8'), bundleMemory(), 'tistu/js/vendor/memory.js is stale: node tistu/js/vendor/build-memory.mjs');
  const ns = namespaceFor(ADDR);
  const recs = await seed(ns);
  for (const at of [99, 260, 360, 5000, Infinity]) assert.deepEqual(vendored.replayState(recs, at, rows.latestSetup(recs)), rows.replayState(recs, at, rows.latestSetup(recs)));
  assert.deepEqual(vendored.settledRows(recs), rows.settledRows(recs));
  assert.equal(vendored.parseRecord(recs[0].text)!.type, parseRecord(recs[0].text)!.type);
  assert.ok(!/process\.env|node:/.test(readFileSync(OUT, 'utf8')), 'browser-pure');
});

test('GET /memory/:address/history is 404 without FEATURE_TIMEMACHINE and serves the replay input with it', async () => {
  const { makeServer } = await import('../src/compiler/server.ts');
  const ns = namespaceFor(ADDR);
  await seed(ns);
  const call = async (flag: string | undefined) => {
    if (flag === undefined) delete process.env.FEATURE_TIMEMACHINE; else process.env.FEATURE_TIMEMACHINE = flag;
    const srv = makeServer().listen(0);
    await new Promise((r) => srv.once('listening', r));
    try {
      const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/memory/${ADDR}/history`);
      return { status: r.status, body: await r.json() };
    } finally { srv.close(); delete process.env.FEATURE_TIMEMACHINE; }
  };
  assert.equal((await call(undefined)).status, 404);
  const on = await call('1');
  assert.equal(on.status, 200);
  assert.equal(on.body.count, 13);
  assert.ok(on.body.records.every((r: any) => typeof r.ts === 'number' && r.fields && r.type));
  assert.ok(on.body.key_moments.some((m: any) => m.kind === 'first_lesson'));
  assert.equal(on.body.end_state.overall.n, 6);
});
