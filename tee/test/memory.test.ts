// Total Recall — memory layer: formats/parser, namespace privacy, calibration math,
// Kelly cap, structure bias, lessons, and the write → recall → settled-row join
// against the SDK's offline MemWalMock (OFFLINE=1, no network).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  formatRecord, parseRecord, namespaceFor, bucketKey, bucketOfConviction, pYou, num, str, confBand,
} from '../src/memory/format.ts';
import {
  bucketStats, posteriorOf, brierOf, blendedProbability, suggestCommit, kelly, oddsFromPrice,
  structureBias, lessonFor, bestVoice, MIN_ORDER_USDC, type SettledRow,
} from '../src/memory/calibration.ts';

process.env.OFFLINE = '1';

const ADDR = '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
const close = (a: number | null, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('namespace hides the address and is stable', () => {
  const ns = namespaceFor(ADDR);
  assert.match(ns, /^helix-v1-[0-9a-f]{12}$/);
  assert.ok(!ns.includes(ADDR.slice(2, 14)), 'no raw address fragment');
  assert.equal(namespaceFor(ADDR.toUpperCase().replace('0X', '0x')), ns, 'case-insensitive');
  assert.notEqual(namespaceFor(ADDR.replace(/4$/, '5')), ns);
});

test('format → parse round trip, quoted text, unknown keys ignored, missing → null', () => {
  const t = formatRecord('CONVICTION', [['tx', 'ABC'], ['dir', 'up'], ['conf', '0.80'], ['vol', 'choppy'], ['p_you', '0.860'], ['p_crowd', null], ['future_key', 'x|y']]);
  assert.match(t, /^CONVICTION v1 \| tx=ABC \| /);
  const r = parseRecord(t)!;
  assert.equal(r.type, 'CONVICTION');
  assert.equal(str(r, 'tx'), 'ABC');
  close(num(r, 'p_you'), 0.86);
  assert.equal(num(r, 'p_crowd'), null, 'na → null');
  assert.equal(str(r, 'future_key'), 'x y', 'pipes in values are neutralised');
  assert.equal(num(r, 'does_not_exist'), null);
  const l = parseRecord(formatRecord('LESSON', [['bucket', 'up/high/choppy'], ['text', 'Won 2/6 | size down "now"'], ['ts', 1]]))!;
  assert.equal(str(l, 'text'), "Won 2/6   size down 'now'");
  assert.equal(str(l, 'bucket'), 'up/high/choppy');
});

test('parser accepts the TOTAL_RECALL §1 example lines and old/new schema', () => {
  const old = parseRecord('CONVICTION v1 | tx=9xQ | asset=BTC | dir=up | conf=0.80 | vol=choppy | horizon=60m | regime=range_bound | structure=bracketed_range | commit=5 | p_you=0.80 | p_mkt=0.61 | p_hlx=0.48 | oracle=0x1 | expiry=1 | ts=2')!;
  assert.equal(bucketOfConviction(old), 'up/high/choppy');
  assert.equal(str(old, 'p_crowd'), null, 'new key missing on old record → null');
  const nw = parseRecord('OUTCOME v1 | tx=9xQ | result=LOSS | payoff=-2.48 | settle_px=63,881 | witness_usd=63874.00 | memory_pnl=-0.99 | ts=3')!;
  close(num(nw, 'settle_px'), 63881);
  close(num(nw, 'payoff'), -2.48);
  assert.equal(parseRecord('hello world'), null);
  assert.equal(parseRecord('NOTATYPE v1 | a=b'), null);
});

test('bucket keys and the "you" voice mapping', () => {
  assert.equal(bucketKey('up', 0.8, 'choppy'), 'up/high/choppy');
  assert.equal(confBand(0.39), 'low'); assert.equal(confBand(0.4), 'mid'); assert.equal(confBand(0.7), 'high');
  close(pYou(0), 0.5); close(pYou(100), 0.95); close(pYou(60), 0.77);
});

const row = (won: 0 | 1, p_you: number, p_mkt: number, p_hlx: number, structure = 'directional', regime = 'range_bound', p_crowd: number | null = null): SettledRow =>
  ({ tx: Math.random().toString(36), won, p_you, p_mkt, p_hlx, p_crowd, structure, regime, commit: 5, payoff: won ? 4 : -5, ts: 0 });

test('calibration n=0: Beta(2,2) prior only, no Brier', () => {
  const s = bucketStats([]);
  assert.equal(s.n, 0); close(s.posterior, 0.5);
  assert.equal(s.brier.you, null); assert.equal(s.gap_you, null);
});

test('calibration n=1 and n=3 by hand', () => {
  const s1 = bucketStats([row(1, 0.8, 0.6, 0.5)]);
  close(s1.posterior, 3 / 5); close(s1.brier.you!, 0.04); close(s1.brier.market!, 0.16);
  const s3 = bucketStats([row(1, 0.8, 0.6, 0.5), row(0, 0.9, 0.4, 0.5), row(0, 0.7, 0.5, 0.4)]);
  close(s3.posterior, 3 / 7);
  close(s3.brier.you!, (0.04 + 0.81 + 0.49) / 3);
  close(s3.brier.market!, (0.16 + 0.16 + 0.25) / 3);
  close(s3.gap_you!, 0.8 - 3 / 7);
});

test('calibration n=6 mixed (TOTAL_RECALL example shape: won 2 of 6, hot)', () => {
  const rows = [row(1, .8, .6, .5), row(0, .85, .55, .45), row(0, .8, .5, .5), row(1, .8, .62, .6), row(0, .8, .4, .4), row(0, .8, .45, .5)];
  const s = bucketStats(rows);
  assert.equal(s.n, 6); assert.equal(s.wins, 2);
  close(s.posterior, 4 / 10);
  close(s.brier.you!, brierOf(rows.map((r) => [r.p_you, r.won])) as number);
  assert.ok(s.gap_you! > 0.4, 'confidence runs hot');
  assert.equal(bestVoice(s), 'market', 'market closer than you');
  const lesson = lessonFor('up/high/choppy', s, null)!;
  assert.match(lesson, /Won 2\/6/); assert.match(lesson, /hot/); assert.match(lesson, /Predict market/);
});

test('blend falls back to the market when n < 3, inverse-Brier weights otherwise', () => {
  const now = { you: 0.85, market: 0.55, helix: 0.5, crowd: null };
  const b0 = blendedProbability(now, bucketStats([row(1, .8, .6, .5)]));
  assert.equal(b0.basis, 'market'); close(b0.p!, 0.55);
  const s = bucketStats([row(1, .8, .6, .5), row(0, .85, .55, .45), row(0, .8, .5, .5), row(0, .8, .4, .4)]);
  const b = blendedProbability(now, s);
  assert.equal(b.basis, 'memory');
  const w = b.weights;
  close((w.you ?? 0) + (w.market ?? 0) + (w.helix ?? 0), 1);
  assert.ok((w.market ?? 0) > (w.you ?? 0), 'better-calibrated voice weighs more');
  assert.ok(b.p! < 0.85 && b.p! > 0.5);
});

test('Kelly: math, odds, and the commit cap (never above the user, never below min order)', () => {
  close(kelly(0.6, 1), 0.2); assert.equal(kelly(0.4, 1), 0); close(oddsFromPrice(0.5), 1);
  const none = suggestCommit(5, 0.86, bucketStats([]), 1);
  assert.equal(none.suggested, 5); assert.equal(none.basis, 'no_history');
  const hot = bucketStats([row(1, .86, .6, .5), row(0, .86, .5, .5), row(0, .86, .5, .5), row(0, .86, .5, .5), row(0, .86, .5, .5), row(1, .86, .5, .5)]);
  const s = suggestCommit(5, 0.86, hot, 1.2);
  assert.equal(s.basis, 'kelly');
  assert.ok(s.suggested < 5, `size down (got ${s.suggested})`);
  assert.ok(s.suggested >= MIN_ORDER_USDC);
  const good = bucketStats([row(1, .6, .5, .5), row(1, .6, .5, .5), row(1, .6, .5, .5), row(1, .6, .5, .5), row(1, .6, .5, .5)]);
  assert.equal(suggestCommit(5, 0.6, good, 1).suggested, 5, 'capped at the user commit even when memory is bullish on you');
});

test('structure bias needs n ≥ 3 per family and a > 0.15 posterior gap', () => {
  const dirLoss = [row(0, .8, .5, .5), row(0, .8, .5, .5), row(0, .8, .5, .5), row(1, .8, .5, .5)];
  const rngWin = [row(1, .7, .4, .4, 'range'), row(1, .7, .4, .4, 'bracketed_range'), row(1, .7, .4, .4, 'range')];
  const b = structureBias([...dirLoss, ...rngWin]);
  assert.equal(b.prefer, 'range'); assert.equal(b.n_range, 3); assert.equal(b.n_dir, 4);
  assert.equal(structureBias([...dirLoss, ...rngWin.slice(0, 2)]).prefer, null, 'n_range < 3 → no bias');
  assert.equal(lessonFor('x', bucketStats(dirLoss.slice(0, 2)), b), null, 'n < 3 → no lesson');
});

test('posterior is (wins+2)/(n+4)', () => {
  for (const [w, n] of [[0, 0], [1, 1], [2, 6], [5, 5]]) close(posteriorOf(w, n), (w + 2) / (n + 4));
});

test('MemWalMock: write → recall → settled-row join → calibration', async () => {
  const { remember, recallAll, __resetMemwal } = await import('../src/memory/store.ts');
  const { settledRows } = await import('../src/memory/service.ts');
  __resetMemwal();
  const ns = namespaceFor(ADDR);
  await remember(ns, formatRecord('CONVICTION', [['tx', 'D1'], ['asset', 'BTC'], ['dir', 'up'], ['conf', '0.80'], ['vol', 'choppy'], ['structure', 'directional'], ['p_you', '0.860'], ['p_mkt', '0.450'], ['p_hlx', '0.470'], ['fill', 'filled'], ['ts', 10]]), { tx: 'D1' });
  await remember(ns, formatRecord('OUTCOME', [['tx', 'D1'], ['result', 'LOSS'], ['payoff', '-5.00'], ['ts', 20]]), { tx: 'D1' });
  await remember(ns, formatRecord('CONVICTION', [['tx', 'D2'], ['asset', 'BTC'], ['dir', 'up'], ['conf', '0.80'], ['vol', 'choppy'], ['structure', 'range'], ['p_you', '0.860'], ['p_mkt', '0.360'], ['p_hlx', '0.400'], ['fill', 'filled'], ['ts', 30]]), { tx: 'D2' });
  const recs = await recallAll(ns, { fresh: true });
  assert.ok(recs.length >= 3, `recalled ${recs.length}`);
  assert.ok(recs.every((r) => r.blob_id), 'every recalled record carries a blob id');
  const rows = settledRows(recs);
  assert.equal(rows.length, 1, 'only the conviction with an outcome is settled');
  assert.equal(rows[0].won, 0); close(rows[0].p_mkt, 0.45);
  await assert.rejects(remember(ns, 'not a helix record'), /non-HELIX/);
});

test('W6 reason classifier is deterministic and keyword-based', async () => {
  const { classifyReason } = await import('../src/memory/reasons.ts');
  assert.equal(classifyReason('ETF inflows and funding flipped positive, whales bidding'), 'flows');
  assert.equal(classifyReason('clean breakout above resistance, RSI not overbought'), 'technical');
  assert.equal(classifyReason('CPI tomorrow and the Fed is dovish, DXY rolling over'), 'macro');
  assert.equal(classifyReason('just a gut feeling'), 'gut');
  assert.equal(classifyReason('no reason at all'), 'other');
  assert.equal(classifyReason('breakout'), classifyReason('breakout'));
});

test('W6 reason stats join REASON with OUTCOME and need n ≥ 3 to name a best category', async () => {
  const { reasonStats } = await import('../src/memory/service.ts');
  const recs = [] as any[];
  const add = (tx: string, cat: string, res: string) => {
    recs.push(parseRecord(formatRecord('REASON', [['tx', tx], ['category', cat], ['facts', 'x'], ['ts', 1]]))!);
    recs.push(parseRecord(formatRecord('OUTCOME', [['tx', tx], ['result', res], ['payoff', '+1.00'], ['ts', 2]]))!);
  };
  add('a', 'technical', 'LOSS'); add('b', 'technical', 'LOSS'); add('c', 'technical', 'WIN');
  add('d', 'flows', 'WIN'); add('e', 'flows', 'WIN'); add('f', 'flows', 'WIN');
  recs.push(parseRecord(formatRecord('REASON', [['tx', 'g'], ['category', 'macro'], ['ts', 1]]))!);   // unsettled → ignored
  const st = reasonStats(recs);
  assert.deepEqual([st.technical.n, st.technical.wins], [3, 1]);
  assert.deepEqual([st.flows.n, st.flows.wins], [3, 3]);
  assert.equal(st.macro, undefined);
  assert.equal(st.technical.best, 'flows');
});

test('timeline cache: a write is visible at once, and a stale timeline never waits on the relayer', async () => {
  const { remember, recallAll, __resetMemwal } = await import('../src/memory/store.ts');
  const blobs: { blob_id: string; text: string; namespace_id: string }[] = [];
  let slow = false, release: (() => void) | null = null, lists = 0;
  __resetMemwal({
    rememberAndWait: async (text: string, ns: string) => { const id = 'swr' + (blobs.length + 1); blobs.push({ blob_id: id, text, namespace_id: ns }); return { blob_id: id, job_id: null }; },
    listMemories: async ({ namespace }: any) => {
      lists++;
      if (slow) await new Promise<void>((r) => { release = r; });
      return { memories: blobs.filter((b) => b.namespace_id === namespace), has_more: false };
    },
    recall: async ({ namespace }: any) => ({ results: blobs.filter((b) => b.namespace_id === namespace).map((b) => ({ blob_id: b.blob_id, text: b.text, created_at: new Date().toISOString() })) }),
  });
  const ns = namespaceFor('0x' + 'ab'.repeat(32));
  await remember(ns, formatRecord('CONVICTION', [['tx', 'S1'], ['asset', 'BTC'], ['dir', 'up'], ['conf', '0.60'], ['ts', 1]]), { tx: 'S1' });
  assert.equal((await recallAll(ns)).length, 1);
  slow = true;                                   // the relayer stalls from here on
  await remember(ns, formatRecord('CONVICTION', [['tx', 'S2'], ['asset', 'BTC'], ['dir', 'down'], ['conf', '0.70'], ['ts', 2]]), { tx: 'S2' });
  const t0 = Date.now();
  const recs = await recallAll(ns);              // stale (just written) → served from cache, refresh in background
  assert.ok(Date.now() - t0 < 200, 'did not wait on the stalled relayer');
  assert.deepEqual(recs.map((r) => r.f.tx), ['S1', 'S2'], 'own write visible immediately');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(lists, 2, 'one background refresh was started');
  (release as any)?.();
  __resetMemwal();
});
