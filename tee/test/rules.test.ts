// N2 Ulysses Rules: rule evaluation fixtures, the override path, the parser, the override scoring math.
//   N2-01 rule memory: creating a rule (signed) writes RULE v1 with a blob id; a bad signature is refused
//   N2-02 gate: a matching conviction triggers the rule; commit refused until an override ≥ 10 chars is typed
//   N2-03 override recorded: the commit body carries override=true; an OVERRIDE v1 memory exists
//   N2-04 override scoring: override_record matches a hand count; the LESSON appears at n ≥ 3
//   N2-05 Judge Mode: the demo trader's rules are readable with no signature (frontend keeps it read-only)
// Fakes only: MemWalMock (OFFLINE=1) and an injected signature verifier. No network, no keys.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';

process.env.OFFLINE = '1';
process.env.FEATURE_RULES = '1';
const { formatRecord, parseRecord, namespaceFor, str } = await import('../src/memory/format.ts');
const { remember, recallAll, __resetMemwal } = await import('../src/memory/store.ts');
const R = await import('../src/memory/rules.ts');
const S = await import('../src/memory/rulesService.ts');
const { ruleGate, timelineFor } = await import('../src/memory/service.ts');

const ADDR = '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
const OTHER = '0x527b492889b09497ac01122deb34eb62d514bcce24af3223614be3e76fd3b23c';
const NS = namespaceFor(ADDR);
const rec = (t: string) => parseRecord(t)!;
const conviction = (tx: string, ts: number, extra: [string, unknown][] = []) =>
  formatRecord('CONVICTION', [['tx', tx], ['mode', 'commit'], ['asset', 'BTC'], ['dir', 'up'], ['conf', '0.80'], ['vol', 'choppy'], ['structure', 'directional'], ['regime', 'trend_up'],
    ['commit', '5.00'], ['p_you', '0.860'], ['p_mkt', '0.550'], ['p_hlx', '0.520'], ['ts', ts], ...extra]);
const outcome = (tx: string, ts: number, result: 'WIN' | 'LOSS') =>
  formatRecord('OUTCOME', [['tx', tx], ['mode', 'commit'], ['result', result], ['payoff', result === 'WIN' ? '+4.00' : '-5.00'], ['ts', ts]]);

/** A fake wallet: "signature" = `sig:<address>:<message>`; the verifier returns the address when the message matches. */
const fakeSign = (address: string, message: string) => `sig:${address}:${message}`;
S.__setRuleVerifier(async (message, signature) => {
  const m = /^sig:(0x[0-9a-f]{64}):(.*)$/s.exec(signature);
  if (!m || m[2] !== new TextDecoder().decode(message)) throw new Error('bad signature');
  return m[1];
});
const signed = (action: 'create' | 'pause' | 'resume' | 'remove', address: string, payload: Record<string, unknown>, signer = address) => {
  const ts = Date.now();
  return { address, ts, signature: fakeSign(signer, R.ruleMessage(action, address, payload, ts)) };
};

test('parser: RULE / RULE_REMOVED / OVERRIDE parse; CONVICTION override=true; every old record unchanged', () => {
  const r = rec(R.formatRule({ id: 'ab12cd34', template: 'cap_commit', params: { max: 2, gap_pts: 30 }, status: 'active', ts: 100 }));
  assert.equal(r.type, 'RULE'); assert.equal(str(r, 'template'), 'cap_commit'); assert.equal(str(r, 'params'), 'max:2,gap_pts:30');
  assert.equal(str(r, 'text'), 'Cap my commit at 2 dUSDC when my over-confidence gap in this setup is over 30 points');
  assert.equal(rec(R.formatRuleRemoved('ab12cd34', 101)).type, 'RULE_REMOVED');
  const o = rec(R.formatOverride({ tx: 'D9', rule_ids: ['ab12cd34'], templates: ['cap_commit'], text: 'Fed decision in 10 min | I have "edge"', ts: 102 }));
  assert.equal(o.type, 'OVERRIDE'); assert.equal(str(o, 'text'), "Fed decision in 10 min   I have 'edge'"); assert.equal(str(o, 'rule_id'), 'ab12cd34');
  const c = rec(conviction('D9', 103, [['override', 'true'], ['rule_id', 'ab12cd34']]));
  assert.equal(str(c, 'override'), 'true');
  const old = rec('CONVICTION v1 | tx=9xQ | asset=BTC | dir=up | conf=0.80 | vol=choppy | horizon=60m | regime=range_bound | structure=bracketed_range | commit=5 | p_you=0.80 | p_mkt=0.61 | p_hlx=0.48 | oracle=0x1 | expiry=1 | ts=2');
  assert.equal(str(old, 'override'), null, 'old records have no override key → null, never true');
  assert.equal(parseRecord('RULE v1 | id=x | template=not_a_template | ts=1')!.type, 'RULE');
  assert.equal(R.rulesFrom([parseRecord('RULE v1 | id=x | template=not_a_template | ts=1')!]).length, 0, 'unknown templates are ignored, not guessed');
});

test('rulesFrom: latest RULE per id wins (pause/resume), RULE_REMOVED retires', () => {
  const recs = [
    rec(R.formatRule({ id: 'aaaaaaaa', template: 'max_per_day', params: { n: 3 }, status: 'active', ts: 1 })),
    rec(R.formatRule({ id: 'bbbbbbbb', template: 'justify_against_market', params: { below: 50 }, status: 'active', ts: 2 })),
    rec(R.formatRule({ id: 'aaaaaaaa', template: 'max_per_day', params: { n: 3 }, status: 'paused', ts: 3 })),
    rec(R.formatRule({ id: 'cccccccc', template: 'cap_commit', params: { max: 2, gap_pts: 30 }, status: 'active', ts: 4 })),
    rec(R.formatRuleRemoved('bbbbbbbb', 5)),
  ];
  const rules = R.rulesFrom(recs);
  assert.deepEqual(rules.map((r) => [r.id, r.status]), [['aaaaaaaa', 'paused'], ['cccccccc', 'active']]);
  assert.deepEqual(rules[1].params, { max: 2, gap_pts: 30 });
  assert.equal(R.activeRules(recs).length, 1);
  assert.throws(() => R.normalizeParams('cap_commit', { max: 'lots' }), /must be a number/);
  assert.deepEqual(R.normalizeParams('cap_commit', { max: 500 }), { max: 50, gap_pts: 30 }, 'clamped to range, defaults filled');
  assert.throws(() => R.normalizeParams('cooldown_after_losses', { conf: 'huge' }), /one of/);
});

test('N2-02 fixtures: each template triggers on its condition and only then', () => {
  const rules = R.rulesFrom([
    rec(R.formatRule({ id: '11111111', template: 'cap_commit', params: { max: 2, gap_pts: 30 }, status: 'active', ts: 1 })),
    rec(R.formatRule({ id: '22222222', template: 'cooldown_after_losses', params: { losses: 3, hours: 24, conf: 'high', vol: 'choppy' }, status: 'active', ts: 1 })),
    rec(R.formatRule({ id: '33333333', template: 'justify_against_market', params: { below: 50 }, status: 'active', ts: 1 })),
    rec(R.formatRule({ id: '44444444', template: 'max_per_day', params: { n: 2 }, status: 'active', ts: 1 })),
  ]);
  const now = 1_000_000 * 1000;
  const base = { conv: { direction: 60, confidence: 80, volView: 70, capital: 5 }, commit: 5, pMkt: 0.55, recs: [] as any[], now, memory: { n: 6, gap_you: 0.41, suggested_commit: 1.5 } };
  // cap_commit: gap 41 > 30 and commit 5 > 2 → gate; commit 2 → no gate; n < 3 → no gate
  assert.deepEqual(R.evaluateRules(rules, base).map((h) => h.template), ['cap_commit']);
  assert.equal(R.evaluateRules(rules, { ...base, commit: 2 }).length, 0);
  assert.equal(R.evaluateRules(rules, { ...base, memory: { n: 2, gap_you: 0.41, suggested_commit: 5 } }).length, 0);
  assert.equal(R.evaluateRules(rules, { ...base, memory: { n: 6, gap_you: 0.2, suggested_commit: 3 } }).length, 0);
  // cooldown: 3 straight losses, last one 2 h ago, high-confidence call in a choppy market → gate; a calm market → no gate
  const losses = ['L1', 'L2', 'L3'].flatMap((tx, i) => [rec(conviction(tx, 900_000 + i)), rec(outcome(tx, 1_000_000 - 7200 - (2 - i), 'LOSS'))]);
  const streak = { ...base, memory: null, recs: losses };
  assert.deepEqual(R.evaluateRules(rules, streak).map((h) => h.template), ['cooldown_after_losses']);
  assert.match(R.evaluateRules(rules, streak)[0].reason, /3 straight losses/);
  assert.equal(R.evaluateRules(rules, { ...streak, conv: { ...base.conv, volView: 20 } }).length, 0, 'calm market: rule does not apply');
  assert.equal(R.evaluateRules(rules, { ...streak, now: now + 30 * 3_600_000 }).length, 0, 'cooldown over after 24 h');
  const winBreak = [...losses.slice(0, 4), rec(conviction('W', 900_003)), rec(outcome('W', 1_000_000 - 7000, 'WIN'))];
  assert.equal(R.evaluateRules(rules, { ...streak, recs: winBreak }).length, 0, 'a win breaks the streak');
  // justify_against_market: market gives the outcome 45% → gate
  assert.deepEqual(R.evaluateRules(rules, { ...base, memory: null, pMkt: 0.45 }).map((h) => h.template), ['justify_against_market']);
  assert.equal(R.evaluateRules(rules, { ...base, memory: null, pMkt: null }).length, 0, 'no market → nothing to be against');
  // max_per_day: 2 commits in the last 24 h with a cap of 2 → gate; one 2 days old does not count
  const today = [rec(conviction('A', 1_000_000 - 3600)), rec(conviction('B', 1_000_000 - 7200)), rec(conviction('C', 1_000_000 - 2 * 86_400))];
  assert.deepEqual(R.evaluateRules(rules, { ...base, memory: null, recs: today }).map((h) => h.template), ['max_per_day']);
  assert.equal(R.evaluateRules(rules, { ...base, memory: null, recs: today.slice(1) }).length, 0);
  // paused rules never fire
  const paused = rules.map((r) => ({ ...r, status: 'paused' as const }));
  assert.equal(R.evaluateRules(paused, { ...base, pMkt: 0.3, recs: today }).length, 0);
  const line = R.ruleGuardianLine(R.evaluateRules(rules, base)[0]);
  assert.equal(line.cls, 'rule'); assert.equal(line.bad, true); assert.match(line.t, /Your rule: "Cap my commit at 2 dUSDC/);
});

test('N2-02 gate + N2-03 override: commit refused without ≥ 10 chars; with it the body carries override=true', async () => {
  const { convictionCommitBody } = await import('../src/memory/service.ts');
  const hit = { rule_id: '11111111', template: 'cap_commit', sentence: 'Cap my commit at 2 dUSDC', reason: 'gap 41' };
  const ctx: any = {
    id: 'cmp_x', at: 0, conv: { direction: 60, confidence: 80, horizonCode: 0, volView: 70, capital: 5 }, address: ADDR,
    market: { id: '0xm', expiryMs: 1_000_000_000, minutesLeft: 12 }, order: { kind: 'directional', side: 'up', rule: 'up>1', pMkt: 0.55, ppcEst: 0.56 }, alt: null,
    legacy: {}, regime: { word: 'trend_up' }, voices: { you: 0.86, market: 0.55, helix: 0.52, crowd: null, crowd_slug: null, council: null },
    memory: { suggested_commit: 1.5, n: 6 }, rules_triggered: [hit],
  };
  assert.throws(() => ruleGate(ctx, undefined), /rule gate/);
  assert.throws(() => ruleGate(ctx, { text: 'because' }), /at least 10 characters/);
  assert.equal(ruleGate({ ...ctx, rules_triggered: [] }, undefined), null, 'no rule → no gate');
  const ov = ruleGate(ctx, { text: '  Fed decision lands in 10 min; vol is mispriced  ' });
  assert.deepEqual(ov, { hits: [hit], text: 'Fed decision lands in 10 min; vol is mispriced' });
  const plain = convictionCommitBody(ctx, { order: ctx.order, commit: 5, usedMemoryStructure: false, followed: false, origin: 'browser', at: 0, nonce: 'abcd' });
  const over = convictionCommitBody(ctx, { order: ctx.order, commit: 5, usedMemoryStructure: false, followed: false, origin: 'browser', at: 0, nonce: 'abcd', override: ov });
  assert.equal(str(rec(plain), 'override'), null);
  assert.equal(str(rec(over), 'override'), 'true'); assert.equal(str(rec(over), 'rule_id'), '11111111');
  assert.ok(over.startsWith(plain.replace(/ \| override=.*$/, '')), 'override keys are appended, nothing else changes');
  // the OVERRIDE memory, as recordCommit/writeConviction write it after the tx lands
  __resetMemwal();
  const w = await S.writeOverride(NS, { tx: 'DIGEST1', hits: ov.hits, text: ov.text, ts: 5 });
  assert.ok(w.blob_id);
  const recs = await recallAll(NS, { fresh: true });
  const o = recs.find((r) => r.type === 'OVERRIDE')!;
  assert.equal(str(o, 'tx'), 'DIGEST1'); assert.equal(str(o, 'text'), 'Fed decision lands in 10 min; vol is mispriced'); assert.equal(o.blob_id, w.blob_id);
});

test('N2-04 override scoring: override_record matches a hand count; the LESSON appears at n ≥ 3', async () => {
  __resetMemwal();
  // 4 overrides (3 settled: 1 win, 2 losses; 1 pending), 3 rule-keeping calls (2 wins, 1 loss)
  const plan: [string, boolean, 'WIN' | 'LOSS' | null][] = [['O1', true, 'LOSS'], ['O2', true, 'WIN'], ['K1', false, 'WIN'], ['O3', true, 'LOSS'], ['K2', false, 'WIN'], ['K3', false, 'LOSS'], ['O4', true, null]];
  let ts = 100;
  for (const [tx, over, res] of plan) {
    await remember(NS, conviction(tx, ts++, over ? [['override', 'true'], ['rule_id', '11111111']] : []), { tx });
    if (over) await remember(NS, R.formatOverride({ tx, rule_ids: ['11111111'], templates: ['cap_commit'], text: `override for ${tx} because reasons`, ts: ts++ }), { tx });
    if (res) await remember(NS, outcome(tx, ts++, res), { tx });
  }
  const recs = await recallAll(NS, { fresh: true });
  const or = R.overrideRecord(recs);
  assert.deepEqual(or, { n: 3, wins: 1, losses: 2, pending: 1, pnl: -6 });
  assert.equal(R.overrideLesson(or, recs), 'You broke your own rules 3 times and lost 2. Calls that kept your rules won 2/3; overrides won 1/3. Your rules know better than your exceptions.');
  assert.equal(R.overrideLesson({ n: 2, wins: 1, losses: 1, pending: 0, pnl: 0 }), null, 'needs 3 settled overrides');
  const written = await S.overrideLessonIfDue(NS, recs, 'O3', 999);
  assert.match(written!, /broke your own rules 3 times/);
  const after = await recallAll(NS, { fresh: true });
  assert.equal(after.filter((r) => r.type === 'LESSON' && str(r, 'bucket') === 'rules/override').length, 1);
  assert.equal(await S.overrideLessonIfDue(NS, after, 'O3', 999), null, 'same lesson is not written twice');
  const t = await timelineFor(ADDR);
  assert.deepEqual((t as any).override_record, or, 'the Memory page gets the same count');
  const view = S.rulesView(ADDR, after);
  assert.equal(view.overrides.length, 4); assert.match(view.lesson!, /lost 2/);
});

test('N2-01 rule memory over HTTP: signed create writes RULE v1 with a blob id; wrong signer / stale ts / off flag refused', async () => {
  __resetMemwal();
  const { makeServer } = await import('../src/compiler/server.ts');
  const srv = makeServer().listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const post = async (path: string, body: any) => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  try {
    const params = { max: 2, gap_pts: 30 };
    // the server offers the exact message to sign
    const m = await post('/rules/message', { action: 'create', address: ADDR, template: 'cap_commit', params });
    assert.equal(m.status, 200); assert.match(m.body.message, /^HELIX rule create \| 0x16a3/);
    const created = await post('/rules/create', { template: 'cap_commit', params, ...signed('create', ADDR, { template: 'cap_commit', params: R.normalizeParams('cap_commit', params) }) });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.ok(created.body.blob_id, 'blob id'); assert.equal(created.body.rule.status, 'active');
    const recs = await recallAll(NS, { fresh: true });
    const r = recs.find((x) => x.type === 'RULE')!;
    assert.equal(r.blob_id, created.body.blob_id); assert.match(r.text, /^RULE v1 \| id=[0-9a-f]{8} \| template=cap_commit \| params=max:2,gap_pts:30 \| status=active/);
    // another wallet signing for this namespace, or a tampered payload, or a stale ts → refused, nothing written
    const other = await post('/rules/create', { template: 'cap_commit', params, ...signed('create', ADDR, { template: 'cap_commit', params: R.normalizeParams('cap_commit', params) }, OTHER) });
    assert.equal(other.status, 403);
    const tampered = await post('/rules/create', { template: 'cap_commit', params: { max: 10, gap_pts: 30 }, ...signed('create', ADDR, { template: 'cap_commit', params: R.normalizeParams('cap_commit', params) }) });
    assert.equal(tampered.status, 401);
    const stale = { ...signed('create', ADDR, { template: 'cap_commit', params: R.normalizeParams('cap_commit', params) }), ts: Date.now() - 3_600_000 };
    assert.equal((await post('/rules/create', { template: 'cap_commit', params, ...stale })).status, 400);
    assert.equal((await post('/rules/create', { template: 'cap_commit', params, address: ADDR, ts: Date.now() })).status, 401, 'no signature');
    assert.equal((await recallAll(NS, { fresh: true })).filter((x) => x.type === 'RULE').length, 1);
    // pause → resume → remove, each a memory; GET shows the fold
    const id = created.body.rule.id;
    assert.equal((await post('/rules/pause', { id, paused: true, ...signed('pause', ADDR, { id }) })).body.rule.status, 'paused');
    let g = await (await fetch(`${base}/rules/${ADDR}`)).json();
    assert.deepEqual(g.rules.map((x: any) => x.status), ['paused']); assert.equal(g.active, 0);
    assert.equal((await post('/rules/pause', { id, paused: false, ...signed('resume', ADDR, { id }) })).body.rule.status, 'active');
    const rm = await post('/rules/remove', { id, ...signed('remove', ADDR, { id }) });
    assert.equal(rm.status, 200); assert.ok(rm.body.blob_id);
    g = await (await fetch(`${base}/rules/${ADDR}`)).json();
    assert.equal(g.rules.length, 0);
    assert.equal((await recallAll(NS, { fresh: true })).filter((x) => x.type === 'RULE_REMOVED').length, 1, 'delete is a RULE_REMOVED memory (append-only)');
    assert.equal((await post('/rules/remove', { id, ...signed('remove', ADDR, { id }) })).status, 404);
    // N2-05: Judge Mode reads the demo trader's rules with no signature at all (read-only is the browser's job)
    assert.equal((await fetch(`${base}/rules/${OTHER}`)).status, 200);
    assert.equal((await fetch(`${base}/rules/templates`)).status, 200);
    assert.equal((await (await fetch(`${base}/rules/templates`)).json()).templates.length, 4);
  } finally { srv.close(); }
  // flag off → no routes
  process.env.FEATURE_RULES = '0';
  const off = makeServer().listen(0);
  await new Promise((r) => off.once('listening', r));
  try { assert.equal((await fetch(`http://127.0.0.1:${(off.address() as AddressInfo).port}/rules/${ADDR}`)).status, 404); }
  finally { off.close(); process.env.FEATURE_RULES = '1'; }
});
