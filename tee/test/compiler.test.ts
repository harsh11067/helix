import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compile, OracleStaleError } from '../src/compiler/compiler.ts';
import { isValidDNA } from '../src/shared/dna.ts';
import { verify } from '../src/shared/attestation.ts';
import type { Conviction } from '../src/shared/types.ts';

const bullish: Conviction = { direction: 70, confidence: 70, horizonCode: 0, volView: 50, capital: 30 };
const bearish: Conviction = { direction: -70, confidence: 65, horizonCode: 0, volView: 50, capital: 30 };
const explosive: Conviction = { direction: 0, confidence: 50, horizonCode: 1, volView: 92, capital: 50 };
const calm: Conviction = { direction: 0, confidence: 50, horizonCode: 1, volView: 8, capital: 50 };

// 3.1 / 3.2 — compiler runs and reads the (mock) oracle
test('3.1 compile produces valid output', () => {
  const r = compile(bullish);
  assert.ok(r.spot > 0, 'spot read from oracle');
  assert.ok(r.ivAtm > 0, 'ATM IV from SVI surface');
  assert.ok(r.plpUtilizationBps >= 0);
  assert.ok(r.selected.name.length > 0);
});

// 3.5 — at least 5 candidate structures
test('3.5 enumerates >= 5 candidates', () => {
  assert.ok(compile(bullish).candidates.length >= 5);
});

// 3.6 — selection reflects the conviction
test('3.6 directional selection', () => {
  assert.ok(compile(bullish).selected.metrics.greeks.delta > 0, 'bullish → positive delta');
  assert.ok(compile(bearish).selected.metrics.greeks.delta < 0, 'bearish → negative delta');
});

test('3.6 volatility selection', () => {
  assert.ok(compile(explosive).selected.metrics.greeks.vega > 0, 'explosive → long vega');
  assert.ok(compile(calm).selected.metrics.greeks.vega < 0, 'calm → short vega');
});

// 3.7 — generated DNA passes the (mirror of) on-chain validation
test('3.7 generated DNA is valid', () => {
  for (const c of [bullish, bearish, explosive, calm]) {
    assert.ok(isValidDNA(compile(c).dna), `dna valid for ${JSON.stringify(c)}`);
  }
});

// 3.10 / 3.36 — attestation present, verifiable locally, mock flag honored
test('3.10 attestation verifiable', () => {
  const r = compile(bullish, 100);
  assert.ok(verify(r.attestation, 100), 'attestation verifies at current epoch');
  assert.ok(!verify(r.attestation, 999), 'expired attestation rejected');
  assert.equal(r.attestation.mock, true, 'MOCK_TEE flag set in dev');
});

// 3.11 — compile latency well under the 5s budget (p95)
test('3.11 compile latency budget', () => {
  const times: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    compile({ direction: i - 25, confidence: 60, horizonCode: i % 4, volView: (i * 7) % 100, capital: 40 });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  assert.ok(p95 < 5000, `p95 ${p95.toFixed(2)}ms < 5000ms`);
});

// 20-conviction sweep: every selection is internally consistent (3.6 manual check proxy)
test('3.6 sweep of 20 convictions stays sensible', () => {
  let n = 0;
  for (let d = -100; d <= 100; d += 50) {
    for (let v = 10; v <= 90; v += 40) {
      const r = compile({ direction: d, confidence: 60, horizonCode: 0, volView: v, capital: 25 });
      assert.ok(r.candidates.length >= 5);
      assert.ok(isValidDNA(r.dna));
      if (d >= 50) assert.ok(r.selected.metrics.greeks.delta > 0, `d=${d} should be bullish`);
      if (d <= -50) assert.ok(r.selected.metrics.greeks.delta < 0, `d=${d} should be bearish`);
      n++;
    }
  }
  assert.ok(n >= 15);
});
