import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classify, Regime, RegimeMonitor, type RegimeFeatures } from '../src/regime/classifier.ts';

const base: RegimeFeatures = { realizedVol: 0.4, ivTermSlope: 0, skew: 0, trend: 0, volumeZ: 0 };

// 3.18 / 3.19 — clear-cut regimes classify as expected
test('3.18/3.19 clear-cut classifications', () => {
  assert.equal(classify({ ...base, realizedVol: 1.1 }).regime, Regime.HIGH_VOLATILITY);
  assert.equal(classify({ ...base, trend: 0.7 }).regime, Regime.TRENDING_BULL);
  assert.equal(classify({ ...base, trend: -0.7 }).regime, Regime.TRENDING_BEAR);
  assert.equal(classify({ ...base, trend: 0.05 }).regime, Regime.RANGE_BOUND);
});

// 3.20 — change events emitted when classification flips
test('3.20 regime change detected', () => {
  const m = new RegimeMonitor();
  const s = [{ strategyId: 'x', regimeSensitivity: 80 }, { strategyId: 'y', regimeSensitivity: 0 }];
  const first = m.step({ ...base, trend: 0.7 }, s);
  assert.equal(first.changed, false, 'first observation is not a change');
  const second = m.step({ ...base, trend: 0.7 }, s);
  assert.equal(second.changed, false, 'same regime → no change');
  const third = m.step({ ...base, trend: -0.7 }, s);
  assert.equal(third.changed, true, 'bull → bear flip');
  assert.equal(third.from, Regime.TRENDING_BULL);
  // 3.21 — only regime-sensitive strategies are notified
  assert.deepEqual(third.notify, ['x']);
});
