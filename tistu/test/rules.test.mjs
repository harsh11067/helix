// N2 Ulysses Rules — frontend builders (pure; no DOM, no network).
//   N2-02 the gate markup disables commit until the override is typed (applyGate on a fake root)
//   N2-05 Judge Mode: the demo trader's rules render read-only (no create / pause / delete controls)
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { rulesPanelHTML, rulesGateHTML, overrideOk, applyGate, paramsFormHTML, overrideRecordHTML } from '../js/rules-ui.js';

const view = {
  rules: [{ id: 'ab12cd34', template: 'cap_commit', params: { max: 2, gap_pts: 30 }, status: 'active', ts: 1, blob_id: 'BLOBabcdefgh', sentence: 'Cap my commit at 2 dUSDC when my over-confidence gap in this setup is over 30 points' },
    { id: 'ef56ab78', template: 'max_per_day', params: { n: 3 }, status: 'paused', ts: 2, sentence: 'No more than 3 commits in any 24 hours' }],
  active: 1, override_record: { n: 3, wins: 1, losses: 2, pending: 1, pnl: -6 }, lesson: 'You broke your own rules 3 times and lost 2.',
  templates: [{ id: 'cap_commit', title: 'Cap my size', example: 'Cap my commit at 2 dUSDC…', params: [{ key: 'max', label: 'cap', type: 'number', default: 2, min: 1, max: 50, step: 0.5 }, { key: 'conf', label: 'confidence', type: 'choice', default: 'high', choices: ['high', 'any'] }] }],
};

test('N2-05 Judge Mode: rules visible, read-only — no create, pause or delete controls', () => {
  const html = rulesPanelHTML(view, { readOnly: true, canSign: false });
  assert.match(html, /Cap my commit at 2 dUSDC/); assert.match(html, /No more than 3 commits/);
  assert.match(html, /1 active · 2 total/);
  assert.match(html, /Read-only — this trader's rules .*Judge Mode shows the demo trader/);
  assert.ok(!html.includes('id="rule-create"'), 'no create button');
  assert.ok(!html.includes('data-rule-act='), 'no pause/delete');
  assert.match(html, /You broke your own rules 3 times and lost 2\./);
  assert.match(html, /walruscan\.com\/mainnet\/blob\/BLOBabcdefgh/);
  // a connected wallet that can sign gets the controls
  const mine = rulesPanelHTML(view, { readOnly: false, canSign: true });
  assert.match(mine, /id="rule-create"/); assert.match(mine, /data-rule-act="pause" data-id="ab12cd34"/); assert.match(mine, /data-rule-act="resume" data-id="ef56ab78"/);
  assert.equal((mine.match(/data-rule-act="remove"/g) || []).length, 2);
  // a wallet that cannot sign (zkLogin) is told why, and gets no form
  const zk = rulesPanelHTML(view, { readOnly: false, canSign: false });
  assert.match(zk, /Connect a browser wallet to write rules/); assert.ok(!zk.includes('id="rule-create"'));
  assert.equal(rulesPanelHTML(null), '', 'FEATURE_RULES off (404) → no panel');
  assert.match(paramsFormHTML(view.templates[0]), /data-param="max"[^>]*value="2" min="1" max="50" step="0.5"/);
  assert.match(paramsFormHTML(view.templates[0]), /<select[^>]*data-param="conf"/);
  assert.match(overrideRecordHTML({ override_record: { n: 0, pending: 0 } }), /No overrides yet/);
  assert.match(overrideRecordHTML({ override_record: { n: 0, wins: 0, losses: 0, pending: 2, pnl: 0 } }), /broke your own rules 2 times\./);
});

test('N2-02 gate: markup + applyGate keep commit disabled until an override of ≥ 10 characters is typed', () => {
  const hits = [{ rule_id: 'ab12cd34', template: 'cap_commit', sentence: 'Cap my commit at 2 dUSDC', reason: 'Your gap is 41 points; you are committing 5.' }];
  assert.equal(rulesGateHTML([]), ''); assert.equal(rulesGateHTML(undefined), '');
  const g = rulesGateHTML(hits, 'short');
  assert.match(g, /Your rule binds this call/); assert.match(g, /id="override-text"/); assert.match(g, /5\/10/); assert.match(g, /commit stays disabled/);
  assert.match(rulesGateHTML(hits, 'Fed decision in 10 min, vol mispriced'), /override accepted/);
  assert.equal(overrideOk('because'), false); assert.equal(overrideOk('         x'), false); assert.equal(overrideOk('ten chars!'), true); assert.equal(overrideOk(null), false);
  // a minimal fake DOM root
  const mk = (id) => ({ id, disabled: false, dataset: {}, style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, title: '' });
  const btns = { commit: mk('commit'), deploy: mk('deploy') };
  const root = { querySelector: (s) => btns[s.slice(1)] || null };
  assert.equal(applyGate(root, hits, ''), false);
  assert.equal(btns.commit.disabled, true); assert.equal(btns.deploy.attrs['aria-disabled'], 'true');
  assert.equal(applyGate(root, hits, 'Fed decision in 10 min, vol mispriced'), true);
  assert.equal(btns.commit.disabled, false); assert.equal(btns.deploy.attrs['aria-disabled'], 'false');
  assert.equal(applyGate(root, [], ''), true, 'no rule → never gated');
  btns.commit.dataset.readonly = '1'; btns.commit.disabled = true;
  applyGate(root, [], ''); assert.equal(btns.commit.disabled, true, 'the demo trader\'s read-only button is left alone');
});
