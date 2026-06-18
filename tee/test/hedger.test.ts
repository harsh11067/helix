import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { netGreeks, isBreached, evaluateHedge, type PortfolioPosition, type Tolerances } from '../src/hedger/hedger.ts';
import { verify } from '../src/shared/attestation.ts';

const g = (delta: number, vega = 0) => ({ delta, gamma: 0.01, vega, theta: -0.5, rho: 0.2 });
const tol: Tolerances = { deltaTolerance: 50, vegaTolerance: 100 };

// 3.13 / 3.14 — net Greeks across multiple strategies match manual summation
test('3.13/3.14 net greeks match manual', () => {
  const positions: PortfolioPosition[] = [
    { strategyId: 'a', greeks: g(30, 40) },
    { strategyId: 'b', greeks: g(45, -10) },
    { strategyId: 'c', greeks: g(-12, 25) },
  ];
  const net = netGreeks(positions);
  assert.ok(Math.abs(net.delta - (30 + 45 - 12)) < 1e-9);
  assert.ok(Math.abs(net.vega - (40 - 10 + 25)) < 1e-9);
});

// 3.15 — delta tolerance breach generates a hedge PTB
test('3.15 breach generates hedge', () => {
  const positions: PortfolioPosition[] = [{ strategyId: 'a', greeks: g(90) }];
  const r = evaluateHedge(positions, tol, 7);
  assert.ok(r.breached);
  assert.ok(r.hedge, 'hedge produced');
  assert.ok(r.attestation && verify(r.attestation, 7), 'hedge attestation verifies');
});

// 3.16 — after hedging, |net delta| is back within tolerance
test('3.16 hedge brings delta within tolerance', () => {
  const positions: PortfolioPosition[] = [{ strategyId: 'a', greeks: g(90) }];
  const r = evaluateHedge(positions, tol);
  assert.ok(Math.abs(r.netAfter.delta) <= tol.deltaTolerance + 1e-9, `netAfter.delta=${r.netAfter.delta}`);
});

test('no breach → no hedge', () => {
  const positions: PortfolioPosition[] = [{ strategyId: 'a', greeks: g(10, 5) }];
  const r = evaluateHedge(positions, tol);
  assert.equal(r.breached, false);
  assert.equal(r.hedge, undefined);
  assert.ok(!isBreached(netGreeks(positions), tol));
});
