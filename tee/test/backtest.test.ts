import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { backtest } from '../src/backtest/backtest.ts';
import { has as walrusHas } from '../src/shared/mockWalrus.ts';
import { buildDNA } from '../src/shared/dna.ts';

const dna = buildDNA({ direction: 60, confidence: 70, horizonCode: 3, volView: 45, capital: 100 }, 2, false, false);

// 3.22 / 3.24 — accepts DNA + range, returns the four metrics
test('3.22/3.24 report shape', () => {
  const r = backtest({ dna, seed: 42, days: 90 });
  for (const k of ['sharpe', 'maxDrawdown', 'winRate', 'profitFactor', 'finalEquity']) {
    assert.ok(Number.isFinite((r as any)[k]) || (r as any)[k] === Infinity, `${k} present`);
  }
  assert.ok(r.maxDrawdown >= 0 && r.maxDrawdown <= 1);
  assert.ok(r.winRate >= 0 && r.winRate <= 1);
  assert.ok(r.trades === 90);
});

// 3.25 — determinism: same (dna, seed, days) → identical result
test('3.25 deterministic', () => {
  const a = backtest({ dna, seed: 7, days: 120 });
  const b = backtest({ dna, seed: 7, days: 120 });
  assert.deepEqual(a, b);
  const c = backtest({ dna, seed: 8, days: 120 });
  assert.notEqual(a.finalEquity, c.finalEquity, 'different seed → different path');
});

// 3.26 — equity curve uploaded to (mock) Walrus
test('3.26 equity curve persisted to walrus', () => {
  const r = backtest({ dna, seed: 99, days: 60 });
  assert.ok(r.equityCurveBlobId.length === 64, 'sha256 blob id');
  assert.ok(walrusHas(r.equityCurveBlobId), 'blob retrievable from walrus');
});
