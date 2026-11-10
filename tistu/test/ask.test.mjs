// Ask your memory panel (P6): pure helpers, and the header button staying hidden when the feature is off.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { modeLabel, walruscanUrl, memoryChipsHTML, answerHTML } from '../js/ask.js';
import { mountAskButton } from '../js/ask-button.js';

const M = (type, blob) => ({ type, blob_id: blob, text: `${type} v1 | n=4 | <script>` });

test('ask panel: mode labels and Walruscan links', () => {
  assert.equal(modeLabel('walrus-ask'), 'Walrus ask');
  assert.equal(modeLabel('stats'), 'from your stats');
  assert.equal(walruscanUrl('abc/def'), 'https://walruscan.com/mainnet/blob/abc%2Fdef');
});

test('ask panel: memory chips link every cited blob, show "+N more", escape memory text', () => {
  const html = memoryChipsHTML([M('LESSON', 'Ud353I9AN9StOWNqUMcK9dNTmXu3fppGZlkXI6firE0'), M('OUTCOME', 'obLQWE8KJuoYV2qbbZ_J73s5T33Tl-dpzFrtmF0440s')], 9);
  assert.match(html, /href="https:\/\/walruscan\.com\/mainnet\/blob\/Ud353I9AN9StOWNqUMcK9dNTmXu3fppGZlkXI6firE0"/);
  assert.match(html, /LESSON · Ud353I…irE0/);
  assert.match(html, /\+7 more/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(memoryChipsHTML([], 0), '');
});

test('ask panel: a no-data answer shows no memory chips; a Walrus answer shows its check and any unverified numbers', () => {
  const none = answerHTML({ answer: "I don't have memories about that yet.", mode: 'stats', memories_used: [], memories_total: 0, n: null });
  assert.match(none, /I don&#39;t have memories about that yet\./);
  assert.doesNotMatch(none, /memories used/);
  assert.doesNotMatch(none, /walruscan/);
  const w = answerHTML({
    answer: 'You run 52 points hot in up/high/choppy.', mode: 'walrus-ask', memories_used: [M('LESSON', 'b1b1b1b1b1b1')], memories_total: 1, n: null,
    unverified_numbers: ['7'],
    check: { answer: 'You state 90% but won 1 of 4.', n: 4, memories_used: [M('CALIBRATION', 'c2c2c2c2c2c2')], memories_total: 8 },
  });
  assert.match(w, /Walrus ask/);
  assert.match(w, /memories used \(Walrus mainnet\)/);
  assert.match(w, /checked against your stats · n = 4/);
  assert.match(w, /\+7 more/);
  assert.match(w, /Not found in the cited memories: 7/);
  const s = answerHTML({ answer: 'x', mode: 'stats', memories_used: [M('OUTCOME', 'o1o1o1o1o1o1')], memories_total: 1, n: 7, note: 'answered from your stats' });
  assert.match(s, /from your stats/);
  assert.match(s, /n = 7/);
});

test('ask button: nothing is added when the server has the feature off', async () => {
  const api = async () => { const e = new Error('not found'); e.status = 404; throw e; };
  assert.equal(await mountAskButton({ api, address: () => null, readOnly: () => true }), null);
});

test('ask button: a transient failure retries and still mounts (only a 404 means off)', async () => {
  let calls = 0;
  const api = async () => { calls++; if (calls < 3) { const e = new Error('HTTP 502'); e.status = 502; throw e; } return { questions: ['When am I most overconfident?'] }; };
  const anchor = { parentNode: { insertBefore: (b) => { inserted = b; } } };
  let inserted = null;
  const doc = globalThis.document;
  globalThis.document = { getElementById: (id) => (id === 'demo-link' ? anchor : null), createElement: () => ({ setAttribute() {}, addEventListener() {} }) };
  try {
    const b = await mountAskButton({ api, address: () => null, readOnly: () => true, retryMs: 1 });
    assert.ok(b && inserted === b, 'mounted after retries');
    assert.equal(calls, 3);
  } finally { globalThis.document = doc; }
});
