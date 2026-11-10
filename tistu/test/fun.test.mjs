// Fun layer (pure): numbers come from the data, and nothing is drawn below its threshold.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { tickerText, roast, humilityMeterHTML, beatTheMarketHTML, ago } from '../js/fun.js';

test('F1 ticker text is built only from the counts', () => {
  const now = 1_794_240_000_000;
  assert.equal(tickerText({ commits: 40, settled: 37, hidden: 0, last_settled_ms: now - 180_000 }, now), '40 commits on Sui · 37 settled · last settled 3 min ago · hidden 0');
  assert.equal(tickerText(null), '');
  assert.equal(tickerText({ commits: 139, settled: 137, hidden: 1, last_settled_ms: now - 60_000, audit: { ok: 139, audited: 139 } }, now), '139 commits on Sui · 137 settled · last settled 1 min ago · hidden 1 · audited 139/139 ✓');
  assert.match(tickerText({ commits: 2, settled: 2, hidden: 0, last_settled_ms: now, audit: { ok: 1, audited: 2 } }, now), /audited 1\/2 ✗$/);
  assert.equal(ago(now - 30_000, now), '30s ago');
});

test('F3 roast thresholds and the n ≥ 3 gate', () => {
  assert.match(roast(51), /51 points sure-er/);
  assert.match(roast(12), /A little hot/);
  assert.match(roast(-3), /Calibrated/);
  assert.match(roast(-20), /Too humble/);
  assert.equal(humilityMeterHTML({ n: 2, gap_you: 0.5, posterior: 0.5 }), '', 'hidden below n = 3');
  const h = humilityMeterHTML({ n: 25, gap_you: 0.39, mean_p_you: 0.82, posterior: 0.43 });
  assert.match(h, /\+39 pts/); assert.match(h, /n = 25/); assert.match(h, /posterior win rate 43%/);
});

test('F4 panel shows the real score or an honest empty state', () => {
  assert.match(beatTheMarketHTML({ n: 0, mode: 'you · market', score: { you: 0, market: 0 } }), /Nothing has settled today yet/);
  const b = beatTheMarketHTML({ n: 4, mode: 'you · market · council', score: { you: 1, market: 2, council: 3 } });
  assert.match(b, /Council <b class="mono" style="font-size:1.3rem">3<\/b>/); assert.match(b, /4 settled/);
});
