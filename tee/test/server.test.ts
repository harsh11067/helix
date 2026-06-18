import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';
import { makeServer as compilerServer } from '../src/compiler/server.ts';
import { makeServer as backtestServer } from '../src/backtest/server.ts';

function listen(server: ReturnType<typeof compilerServer>): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}

// 3.11 / 3.33 (partial) — compiler HTTP API returns a full plan quickly
test('POST /compile over HTTP', async () => {
  const server = compilerServer();
  const port = await listen(server);
  try {
    const t0 = performance.now();
    const res = await fetch(`http://localhost:${port}/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction: 65, confidence: 70, horizonCode: 0, volView: 45, capital: 30 }),
    });
    const dt = performance.now() - t0;
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.selected && body.dna && body.attestation && body.ptb);
    assert.ok(body.attestation.signature.length > 0);
    assert.ok(dt < 5000, `latency ${dt.toFixed(1)}ms`);
  } finally {
    server.close();
  }
});

test('invalid conviction → 400', async () => {
  const server = compilerServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/compile`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction: 999, confidence: 70, volView: 45, capital: 30 }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('POST /backtest over HTTP', async () => {
  const server = backtestServer();
  const port = await listen(server);
  try {
    const dna = {
      dirNegative: false, dirMagnitude: 60, confidence: 70, horizonDays: 1, volView: 45,
      legCount: 2, assetPairCode: 0, usesOptions: true, usesSpot: false, usesMargin: false,
      leverageX100: 100, entrySignalType: 0, entryThreshold: 40, exitSignalType: 3, exitThreshold: 60,
      regimeSensitivity: 45, maxDrawdownBps: 900, hedgeNeg: false, hedgeDeltaMag: 0,
      mutationCount: 0, crossoverPoints: [],
    };
    const res = await fetch(`http://localhost:${port}/backtest`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dna, seed: 5, days: 60 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body.sharpe === 'number' && body.trades === 60);
  } finally {
    server.close();
  }
});
