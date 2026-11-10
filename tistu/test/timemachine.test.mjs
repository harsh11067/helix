// N1 Memory Time Machine — browser helpers (pure; no DOM) over the vendored server math.
//   node --test tistu/test/*.test.mjs
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as mem from '../js/vendor/memory.js';
import { toRecords, stepsOf, atOfStep, stepForTs, tsLabel, setupFrom, suggestionHTML, scrubberHTML } from '../js/timemachine.js';
import { councilAt } from '../js/council.js';

const rec = (type, fields) => ({ type, ts: Number(fields.ts), fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])), text: `${type} v1 | ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' | ')}`, blob_id: 'b' + fields.tx + type[0] });
const conv = (tx, ts) => rec('CONVICTION', { tx, asset: 'BTC', dir: 'up', conf: '0.80', vol: 'choppy', structure: 'directional', commit: '5.00', p_you: '0.860', p_mkt: '0.550', p_hlx: '0.520', price: '0.550', ts });
const out = (tx, ts, result) => rec('OUTCOME', { tx, result, payoff: result === 'WIN' ? '+4.00' : '-5.00', ts });
const hist = { records: [conv('A', 100), out('A', 150, 'LOSS'), conv('B', 200), out('B', 250, 'WIN'), conv('C', 300), out('C', 350, 'LOSS'), conv('D', 400), out('D', 450, 'LOSS')], setup: null };
hist.setup = mem.latestSetup(toRecords(hist));

test('N1-01 (browser side): the last step replays everything; the first step replays nothing', () => {
  const recs = toRecords(hist), steps = stepsOf(recs);
  assert.equal(steps.length, 8);
  assert.equal(atOfStep(steps, steps.length), Infinity);
  assert.equal(atOfStep(steps, 0), -Infinity);
  const end = mem.replayState(recs, atOfStep(steps, steps.length), hist.setup);
  assert.deepEqual(end.overall, mem.bucketStats(mem.settledRows(recs)), 'end state = live math on every record');
  assert.equal(end.count, 8);
  assert.equal(mem.replayState(recs, atOfStep(steps, 0), hist.setup).count, 0);
});

test('N1-02: scrubbing back changes gap and suggestion; key moments land on the right steps', () => {
  const recs = toRecords(hist), steps = stepsOf(recs);
  const s3 = mem.replayState(recs, atOfStep(steps, 3), hist.setup);   // A lost, B placed: n=1
  const s6 = mem.replayState(recs, atOfStep(steps, 6), hist.setup);   // n=3 → memory acts
  const s8 = mem.replayState(recs, Infinity, hist.setup);
  assert.equal(s3.overall.n, 1); assert.equal(s6.overall.n, 3); assert.equal(s8.overall.n, 4);
  assert.equal(s3.suggestion.basis, 'no_history'); assert.equal(s6.suggestion.basis, 'kelly');
  assert.ok(s8.suggestion.suggested < 5 && s8.suggestion.suggested <= s6.suggestion.suggested);
  assert.ok(s8.overall.gap_you > s6.overall.gap_you, 'the gap opens as losses land');
  const km = mem.keyMoments(recs, []);
  assert.deepEqual(km.map(m => m.kind), ['first_outcome', 'first_n3']);
  assert.equal(stepForTs(steps, 150), 2, 'first outcome sits after the 2nd memory');
  assert.equal(stepForTs(steps, 350), 6);
  assert.match(suggestionHTML(s8), /memory suggests/);
  assert.match(suggestionHTML(s3), /not enough to change your size/);
  const html = scrubberHTML(steps, km.map(m => ({ ...m, step: stepForTs(steps, m.ts) })));
  assert.equal((html.match(/class="tm-mark"/g) || []).length, 2);
  assert.match(html, /max="8"/); assert.match(html, /value="8"/);
  assert.equal(tsLabel(0), '1970-01-01 00:00 UTC'); assert.equal(tsLabel(Infinity), 'now');
});

test('the setup comes from the Canvas conviction when there is one, else the latest memory', () => {
  const s = setupFrom({ conv: { direction: 60, confidence: 70, volView: 20, capital: 8 }, compile: { predict: { order: { ppcEst: 0.6 } } } }, hist, mem);
  assert.deepEqual(s, { bucket: 'up/high/calm', commit: 8, p_you: mem.pYou(70), price: 0.6 });
  assert.deepEqual(setupFrom({}, hist, mem), hist.setup);
  assert.equal(hist.setup.bucket, 'up/high/choppy');
});

test('Council time machine: weights and records come from the snapshot at the scrubbed instant', () => {
  const h = [{ ts: 10, weights: { a: 0.5, b: 0.5 }, n: { a: 1, b: 1 }, brier: { a: 0.2, b: 0.3 } }, { ts: 20, weights: { a: 0.7, b: 0.3 }, n: { a: 6, b: 5 }, brier: { a: 0.1, b: 0.3 } }];
  assert.deepEqual(councilAt(h, 15).weights, { a: 0.5, b: 0.5 });
  assert.deepEqual(councilAt(h, Infinity).weights, { a: 0.7, b: 0.3 });
  assert.equal(councilAt(h, Infinity).settled, 11);
  assert.equal(councilAt(h, 5).history.length, 0);
  assert.equal(mem.keyMoments([], h)[0].kind, 'weights_shift');
});
