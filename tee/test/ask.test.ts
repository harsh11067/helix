// P6 Ask your memory — templates, grounding / no-data, Walrus ask pipeline, rate limit, routes. Offline.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';
import { parseRecord, type MemRecord } from '../src/memory/format.ts';
import { matchTemplate, answerFromStats, TEMPLATES, SUGGESTED, NO_DATA, readableBucket, type AskData } from '../src/ask/templates.ts';
import { unverifiedNumbers, saysNoData, shapeQuestion, walrusAsk, walrusUnavailable, __resetWalrusAsk } from '../src/ask/walrus.ts';
import { ask, rateLimit, __resetAskLimits, resolveTarget, cleanQuestion, ASK_PER_MIN } from '../src/ask/routes.ts';
import { makeServer } from '../src/compiler/server.ts';

// ---------------------------------------------------------------- fixture: real record formats, synthetic values
const NOW = 1_794_300_000_000;               // ms
const DAY = 86_400;                          // s
let blob = 0;
const rec = (text: string): MemRecord => parseRecord(text, { blob_id: `blob${String(++blob).padStart(3, '0')}` })!;
function call(tx: string, o: { dir: string; conf: number; vol: string; p_you: number; p_mkt: number; won: boolean; ts: number; structure?: string; p_crowd?: number }) {
  return [
    rec(`CONVICTION v1 | mode=commit | asset=BTC | dir=${o.dir} | conf=${o.conf} | vol=${o.vol} | structure=${o.structure ?? 'range'} | p_you=${o.p_you} | p_mkt=${o.p_mkt} | p_hlx=${o.p_mkt} | p_crowd=${o.p_crowd ?? 'na'} | ts=${o.ts} | tx=${tx}`),
    rec(`OUTCOME v1 | tx=${tx} | mode=commit | result=${o.won ? 'WIN' : 'LOSS'} | payoff=${o.won ? '+4.00' : '-5.00'} | ts=${o.ts + 900}`),
  ];
}
const T = NOW / 1000;
const recs: MemRecord[] = [
  // up/high/choppy: stated 90%, won 1 of 4 → the overconfident (and worst) setup
  ...call('TX1', { dir: 'up', conf: 0.9, vol: 'choppy', p_you: 0.9, p_mkt: 0.45, won: false, ts: T - 10 * DAY }),
  ...call('TX2', { dir: 'up', conf: 0.9, vol: 'choppy', p_you: 0.9, p_mkt: 0.5, won: true, ts: T - 9 * DAY }),
  ...call('TX3', { dir: 'up', conf: 0.9, vol: 'choppy', p_you: 0.9, p_mkt: 0.4, won: false, ts: T - 2 * DAY }),
  ...call('TX4', { dir: 'up', conf: 0.9, vol: 'choppy', p_you: 0.9, p_mkt: 0.4, won: false, ts: T - 1 * DAY }),
  // down/low/calm: stated 60%, won 3 of 3 (two against the market's lean) → the best setup
  ...call('TX5', { dir: 'down', conf: 0.3, vol: 'calm', p_you: 0.6, p_mkt: 0.4, won: true, ts: T - 8 * DAY, structure: 'directional' }),
  ...call('TX6', { dir: 'down', conf: 0.3, vol: 'calm', p_you: 0.6, p_mkt: 0.45, won: true, ts: T - 3 * DAY, structure: 'directional' }),
  ...call('TX7', { dir: 'down', conf: 0.3, vol: 'calm', p_you: 0.6, p_mkt: 0.55, won: true, ts: T - 1 * DAY, structure: 'directional' }),
  rec(`CALIBRATION v1 | bucket=up/high/choppy | n=4 | wins=1 | mean_p_you=0.900 | gap_you=+0.48 | brier_you=0.610 | posterior=0.375 | ts=${T - DAY}`),
  rec(`LESSON v1 | tx=TX4 | bucket=up/high/choppy | n=4 | text="up/high/choppy: Won 1/4 here; stated confidence runs ~52 points hot. Size down." | ts=${T - DAY}`),
];
const blobs = new Set(recs.map((r) => r.blob_id));
const data = (o: Partial<AskData> = {}): AskData => ({ recs, now: NOW, ...o });
const grounded = (r: { memories_used: { blob_id: string }[] }) => r.memories_used.length > 0 && r.memories_used.every((m) => blobs.has(m.blob_id));

// ---------------------------------------------------------------- matching
test('ask templates: every suggested question maps to its own template; paraphrases map sensibly', () => {
  assert.equal(SUGGESTED.length, TEMPLATES.length);
  assert.ok(TEMPLATES.length >= 12);
  for (const t of TEMPLATES) assert.equal(matchTemplate(t.question)?.id, t.id, t.question);
  const cases: [string, string | null][] = [
    ['which source should I listen to when it is choppy', 'trust_voice'],
    ['am I getting better this week?', 'trend_week'],
    ["what's my win rate", 'record'],
    ['where am I too sure of myself', 'overconfident'],
    ['which council agent is most reliable for ETH?', 'council'],
    ['what should i avoid', 'worst_setup'],
    ['any advice from my memory?', 'lesson'],
    ['what is the weather in Paris', null],
  ];
  for (const [q, id] of cases) assert.equal(matchTemplate(q)?.id ?? null, id, q);
  assert.equal(readableBucket('up/high/choppy'), 'high-confidence bullish calls in choppy markets');
});

// ---------------------------------------------------------------- answers (numbers from the records, n shown, cited)
test('ask templates: overconfidence answer comes from the bucket stats and cites the lesson + calibration', () => {
  const r = answerFromStats('When am I most overconfident?', data());
  assert.equal(r.template, 'overconfident');
  assert.match(r.answer, /up\/high\/choppy/);
  assert.match(r.answer, /state 90% on average but won 1 of 4/);
  assert.match(r.answer, /remembered win rate of 38%/);           // Beta(2,2): (1+2)/(4+4) = 0.375
  assert.match(r.answer, /Memory's lesson: "up\/high\/choppy: Won 1\/4/);
  assert.equal(r.n, 4);
  assert.ok(grounded(r));
  const types = new Set(r.memories_used.map((m) => m.type));
  assert.ok(types.has('LESSON') && types.has('CALIBRATION') && types.has('OUTCOME'));
});

test('ask templates: best / worst / record / market / structure / confidence / recent / trend are computed, cited, with n', () => {
  const a = (q: string) => answerFromStats(q, data());
  const best = a("What's my best setup?");
  assert.match(best.answer, /down\/low\/calm\): you won 3 of 3/);
  const worst = a("What's my worst setup?");
  assert.match(worst.answer, /up\/high\/choppy\): you won 1 of 4/);
  const rec7 = a("What's my track record?");
  assert.match(rec7.answer, /7 settled calls and won 4 \(57%\)/);
  assert.equal(rec7.n, 7);
  const mkt = a('Do I beat the market?');
  assert.match(mkt.answer, /over 7 settled calls/);
  assert.match(mkt.answer, /closer than the market on \d of 7 calls/);
  assert.match(a('Do ranges work better than directional bets for me?').answer, /ranges: won 1\/4.*directional bets: won 3\/3/);
  assert.match(a("Am I better when I'm confident?").answer, /high-confidence: won 1\/4.*low-confidence: won 3\/3/);
  const recent = a('How did my last calls go?');
  assert.match(recent.answer, /last 5 settled calls/);
  assert.equal(recent.n, 5);
  const trend = a('How has my calibration changed this week?');
  assert.match(trend.answer, /Last 7 days: Brier \d\.\d\d over 4 calls.*Before that: Brier \d\.\d\d over 3/);
  for (const r of [best, worst, rec7, mkt, recent, trend]) assert.ok(grounded(r), r.template!);
});

test('ask templates: voice trust is filtered by regime and needs n >= 3 per voice', () => {
  const r = answerFromStats('Which voice should I trust in choppy markets?', data());
  assert.match(r.answer, /In choppy markets \(4 settled calls\), the most accurate voice was/);
  assert.doesNotMatch(r.answer, /Polymarket crowd/, 'crowd has no scored calls → never ranked');
  assert.ok(grounded(r));
  assert.ok(r.memories_used.every((m) => !/vol=calm/.test(m.text)), 'only choppy-market records are cited');
});

test('ask grounding: no data, unknown questions and unavailable sources get the no-data reply with no citations', () => {
  for (const q of ['When am I most overconfident?', "What's my track record?", 'What has memory taught me?']) {
    const r = answerFromStats(q, { recs: [], now: NOW });
    assert.equal(r.answer, NO_DATA); assert.deepEqual(r.memories_used, []);
  }
  const unknown = answerFromStats('what is the weather in Paris', data());
  assert.equal(unknown.answer, NO_DATA); assert.deepEqual(unknown.memories_used, []);
  // hidden needs the on-chain ledger; without it there is no number to give
  assert.equal(answerFromStats('Have I hidden any calls?', data()).answer, NO_DATA);
  const h = answerFromStats('Have I hidden any calls?', data({ ledger: { onchain: 8, with_memory: 7, missing_memory: 1 } }));
  assert.match(h.answer, /committed 8 convictions on-chain.*7 have their memory and 1 has none/);
  assert.ok(grounded(h));
  // an asset with no records → no-data (never borrows BTC numbers)
  assert.equal(answerFromStats('Which council agent is most reliable for ETH?', data({ council: [{ name: 'momentum', recs }] })).answer, NO_DATA);
});

test('ask templates: Council reliability ranks agents by Brier from their own memories', () => {
  const good = call('A1', { dir: 'up', conf: 0.6, vol: 'calm', p_you: 0.6, p_mkt: 0.5, won: true, ts: T - DAY });
  const bad = call('B1', { dir: 'up', conf: 0.9, vol: 'calm', p_you: 0.9, p_mkt: 0.5, won: false, ts: T - DAY });
  const r = answerFromStats('Which Council agent is most reliable?', data({ council: [{ name: 'reversion', recs: bad }, { name: 'surface', recs: good }] }));
  assert.match(r.answer, /most reliable Council agent so far is surface: Brier 0\.16 over 1 settled call \(won 1\)/);
  assert.match(r.answer, /reversion 0\.81 \(n=1\)/);
  assert.match(r.answer, /noisy/);
  assert.deepEqual(new Set(r.memories_used.map((m) => m.blob_id)), new Set([...good, ...bad].map((x) => x.blob_id)));
});

test('ask templates: lessons are the latest per setup, quoted verbatim', () => {
  const r = answerFromStats('What has memory taught me?', data());
  assert.equal(r.answer, 'Memory\'s latest lesson: up/high/choppy: Won 1/4 here; stated confidence runs ~52 points hot. Size down.');
  assert.equal(r.memories_used.length, 1);
  assert.equal(r.memories_used[0].type, 'LESSON');
});

// ---------------------------------------------------------------- Plan A pieces
test('ask walrus: number check allows rounding and percent forms, flags invented numbers', () => {
  const src = ['CALIBRATION v1 | bucket=up/high/choppy | n=12 | wins=4 | posterior=0.4289 | gap_you=+0.50'];
  assert.deepEqual(unverifiedNumbers('You won 4 of 12 (43%), posterior 0.43, 50 points hot.', src), []);
  assert.deepEqual(unverifiedNumbers('You won 7 of 12 with Brier 0.91.', src), ['7', '0.91']);
  assert.deepEqual(unverifiedNumbers('You asked about 2 setups.', ['n=12'], ), ['2']);
  assert.deepEqual(unverifiedNumbers('You asked about 2 setups.', ['n=12', 'compare my 2 setups']), []);
});

test('ask walrus: no-data detection and question shaping', () => {
  assert.ok(saysNoData("I don't have memories about that yet."));
  assert.ok(saysNoData('There are no relevant memories about Solana.'));
  assert.ok(!saysNoData('You are most overconfident in up/high/choppy.'));
  assert.match(shapeQuestion('  When am I most overconfident? '), /^When am I most overconfident\?\n\n\(Answer in at most 3 sentences, only from the retrieved memories/);
});

test('ask walrus: calls the relayer route with the namespace through the signed client; errors back off', async () => {
  __resetWalrusAsk();
  const sent: any[] = [];
  const client = { signedRequest: async (...a: any[]) => { sent.push(a); return { answer: ' You won 1 of 4. ', memories_used: 1, memories: [{ blob_id: 'b1', text: 'LESSON v1 | n=4', distance: 0.6 }, { nope: 1 }] }; } };
  const r = await walrusAsk('helix-v1-4d922636976d', 'Q?', { client });
  assert.equal(sent[0][0], 'POST'); assert.equal(sent[0][1], '/api/ask');
  assert.equal(sent[0][2].namespace, 'helix-v1-4d922636976d'); assert.equal(sent[0][2].limit, 6);
  assert.match(sent[0][2].question, /^Q\?\n\n/);
  assert.equal(r.answer, 'You won 1 of 4.');
  assert.deepEqual(r.memories, [{ blob_id: 'b1', text: 'LESSON v1 | n=4', distance: 0.6 }]);
  await assert.rejects(walrusAsk('helix-v1-4d922636976d', 'Q?', { client: { signedRequest: async () => { throw new Error('429 rate limited'); } } }), /429/);
  assert.ok(walrusUnavailable(), 'unavailable after an error (and offline here)');
  __resetWalrusAsk();
});

// ---------------------------------------------------------------- the pipeline
const target = { ns: 'helix-v1-4d922636976d', address: null };
const load = async () => data();
const ready = () => null;
const W = (answer: string, memories = [{ blob_id: 'w1', text: 'LESSON v1 | bucket=up/high/choppy | n=4 | text="Won 1/4 here; ~52 points hot"', distance: 0.5 }]) =>
  (async () => ({ answer, memories, memories_used: memories.length, ms: 10 })) as any;

test('ask pipeline: Walrus ask answers with its memories cited and the stats answer attached as a check', async () => {
  const r = await ask(target, 'When am I most overconfident?', { walrus: W('You won 1/4 in up/high/choppy and run about 52 points hot.'), data: load, walrusReady: ready });
  assert.equal(r.mode, 'walrus-ask');
  assert.deepEqual(r.memories_used.map((m) => m.blob_id), ['w1']);
  assert.equal(r.memories_used[0].type, 'LESSON');
  assert.equal(r.check?.template, 'overconfident');
  assert.ok(r.check && grounded(r.check));
  assert.equal(r.unverified_numbers, undefined);
});

test('ask pipeline: falls back to stats on an invented number, no memories, an error, or when unavailable', async () => {
  const inv = await ask(target, 'When am I most overconfident?', { walrus: W('You won 3 of 4.'), data: load, walrusReady: ready });
  assert.equal(inv.mode, 'stats'); assert.deepEqual(inv.unverified_numbers, ['3']); assert.match(inv.note!, /not in the memories it cited/);
  assert.ok(grounded(inv));
  const empty = await ask(target, 'When am I most overconfident?', { walrus: W('Something.', []), data: load, walrusReady: ready });
  assert.equal(empty.mode, 'stats'); assert.ok(grounded(empty));
  const boom = await ask(target, "What's my track record?", { walrus: (async () => { throw new Error('relayer down'); }) as any, data: load, walrusReady: ready });
  assert.equal(boom.mode, 'stats'); assert.match(boom.note!, /Walrus ask failed \(relayer down\)/);
  const off = await ask(target, "What's my track record?", { walrus: W('x'), data: load, walrusReady: () => 'budget reached' });
  assert.equal(off.mode, 'stats'); assert.equal(off.note, 'budget reached');
  const statsOnly = await ask(target, "What's my track record?", { mode: 'stats', walrus: (() => { throw new Error('must not be called'); }) as any, data: load });
  assert.equal(statsOnly.mode, 'stats'); assert.equal(statsOnly.template, 'record');
});

test('ask pipeline: "no memories" from Walrus and nothing in the stats → the no-data reply, nothing cited', async () => {
  const r = await ask(target, 'What did I say about Solana NFTs?', { walrus: W("I don't have memories about that yet."), data: load, walrusReady: ready });
  assert.equal(r.answer, NO_DATA); assert.deepEqual(r.memories_used, []);
});

// ---------------------------------------------------------------- inputs + rate limit
test('ask inputs: address or HELIX namespace, consistent, question bounded', () => {
  const A = '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
  assert.deepEqual(resolveTarget({ address: A }), { ns: 'helix-v1-4d922636976d', address: A });
  assert.deepEqual(resolveTarget({ ns: 'helix-v1-4d922636976d' }), { ns: 'helix-v1-4d922636976d', address: null });
  assert.throws(() => resolveTarget({}), /address or ns required/);
  assert.throws(() => resolveTarget({ ns: 'helix-v1-registry' }), /invalid HELIX namespace/);
  assert.throws(() => resolveTarget({ address: '0x12' }), /invalid Sui address/);
  assert.throws(() => resolveTarget({ address: A, ns: 'helix-v1-000000000000' }), /does not belong/);
  assert.equal(cleanQuestion('  When   am I \n overconfident? '), 'When am I overconfident?');
  assert.throws(() => cleanQuestion(''), /question required/);
  assert.throws(() => cleanQuestion('x'.repeat(401)), /too long/);
});

test('ask rate limit: per forecaster per minute, polite 429 with retry-after', () => {
  __resetAskLimits();
  const now = 1_000_000;
  for (let i = 0; i < ASK_PER_MIN; i++) rateLimit('ns-a', now + i);
  let err: any = null;
  try { rateLimit('ns-a', now + 100); } catch (e) { err = e; }
  assert.equal(err?.status, 429);
  assert.match(err.body.error, /questions a minute per forecaster/);
  assert.ok(Number(err.headers['retry-after']) > 0);
  rateLimit('ns-b', now + 100);                         // another forecaster is unaffected
  rateLimit('ns-a', now + 61_000);                      // the window slides
  __resetAskLimits();
});

// ---------------------------------------------------------------- routes
function listen(server: ReturnType<typeof makeServer>): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}
const post = (port: number, body: unknown) => fetch(`http://localhost:${port}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('ask routes: 404 when FEATURE_ASK is off', async () => {
  delete process.env.FEATURE_ASK;
  const server = makeServer(); const port = await listen(server);
  try {
    assert.equal((await post(port, { ns: 'helix-v1-4d922636976d', question: 'q' })).status, 404);
    assert.equal((await fetch(`http://localhost:${port}/ask/suggestions`)).status, 404);
  } finally { server.close(); }
});

test('ask routes: suggestions and input validation when on', async () => {
  process.env.FEATURE_ASK = '1';
  const server = makeServer(); const port = await listen(server);
  try {
    const s: any = await (await fetch(`http://localhost:${port}/ask/suggestions`)).json();
    assert.deepEqual(s.questions, SUGGESTED);
    assert.equal(s.walrus_ask, false, 'offline: Walrus ask unavailable');
    assert.equal((await post(port, { question: 'q' })).status, 400);
    assert.equal((await post(port, { ns: 'helix-v1-4d922636976d' })).status, 400);
    assert.equal((await post(port, { ns: 'nope', question: 'q' })).status, 400);
  } finally { server.close(); delete process.env.FEATURE_ASK; }
});
