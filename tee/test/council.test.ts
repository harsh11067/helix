// The Council (NEXT_BIG.md §2): deterministic signals, memory-weighted ensemble, the Council edge on any order.
//   OFFLINE=1 node --test test/council.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SIGNALS, toCall, moveZ, momentum, reversion, surface, crowd, type Sample } from '../src/council/signals.ts';
import { councilWeights, councilPUp, councilProbability, pricedAtShift, weightsEqual, MIN_N_WEIGHT } from '../src/council/ensemble.ts';
import { agentsFromEnv } from '../src/council/runner.ts';
import { bucketStats } from '../src/memory/calibration.ts';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const T0 = 1_794_220_000_000;
const series = (pxs: number[]): Sample[] => pxs.map((px, i) => ({ t: T0 + i * 60_000, px }));
const now = T0 + 15 * 60_000;
const rising = series(Array.from({ length: 16 }, (_, i) => 74_000 + i * 12 + (i % 2 ? 5 : -5)));
const falling = series(Array.from({ length: 16 }, (_, i) => 74_000 - i * 12 + (i % 2 ? 5 : -5)));
const flat = series(Array.from({ length: 16 }, (_, i) => 74_000 + (i % 2 ? 3 : -3)));

test('signals are deterministic: same inputs → identical calls', () => {
  const i = { samples: rising, now, pMktUp: 0.61, crowdUp: 0.55 };
  for (const name of Object.keys(SIGNALS) as (keyof typeof SIGNALS)[]) assert.deepEqual(SIGNALS[name](i), SIGNALS[name](i), name);
});

test('momentum follows the trend, reversion fades an outsized move, both abstain without data', () => {
  assert.equal(momentum({ samples: rising, now, pMktUp: null, crowdUp: null })!.side, 'up');
  assert.equal(momentum({ samples: falling, now, pMktUp: null, crowdUp: null })!.side, 'down');
  assert.equal(reversion({ samples: rising, now, pMktUp: null, crowdUp: null })!.side, 'down');
  assert.equal(reversion({ samples: falling, now, pMktUp: null, crowdUp: null })!.side, 'up');
  assert.equal(reversion({ samples: flat, now, pMktUp: null, crowdUp: null }), null, 'no outsized move → abstain');
  assert.equal(momentum({ samples: rising.slice(0, 4), now, pMktUp: null, crowdUp: null }), null, 'too few samples → abstain');
  assert.ok(moveZ(rising, now)!.z > 0.5);
});

test('surface and crowd follow their source; abstain when it is missing', () => {
  assert.deepEqual([surface({ samples: [], now, pMktUp: 0.62, crowdUp: null })!.side, surface({ samples: [], now, pMktUp: 0.62, crowdUp: null })!.pUp], ['up', 0.62]);
  assert.equal(surface({ samples: [], now, pMktUp: null, crowdUp: null }), null);
  assert.equal(crowd({ samples: [], now, pMktUp: null, crowdUp: 0.3 })!.side, 'down');
  assert.equal(crowd({ samples: [], now, pMktUp: null, crowdUp: null }), null);
});

test("an agent's confidence maps back to its probability through HELIX's p_you mapping", () => {
  const c = toCall('surface', 0.77, 'x');
  const pYou = 0.5 + 0.45 * c.confidence / 100;
  assert.ok(Math.abs(pYou - 0.77) < 0.005, `${pYou}`);
  assert.equal(toCall('crowd', 0.2, 'x').side, 'down');
});

test('weights: equal until n ≥ 5; then ∝ 1/max(Brier, 0.05); unqualified agents get the mean; sum to 1', () => {
  const early = councilWeights([{ agent: 'momentum', n: 4, wins: 2, brier: 0.1 }, { agent: 'reversion', n: 3, wins: 0, brier: 0.4 }]);
  assert.ok(weightsEqual(early)); assert.equal(early.momentum, 0.5);
  const w = councilWeights([
    { agent: 'momentum', n: 6, wins: 4, brier: 0.2 }, { agent: 'reversion', n: 6, wins: 1, brier: 0.4 },
    { agent: 'surface', n: 6, wins: 5, brier: 0.01 }, { agent: 'crowd', n: 2, wins: 1, brier: 0.3 },
  ]);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(w.momentum / w.reversion - 2) < 1e-9, 'inverse Brier');
  assert.ok(Math.abs(w.surface / w.momentum - 4) < 1e-9, 'Brier floor 0.05: 1/0.05 vs 1/0.2');
  const meanQ = (1 / 0.2 + 1 / 0.4 + 1 / 0.05) / 3;
  assert.ok(Math.abs(w.crowd / w.momentum - meanQ / 5) < 1e-9, 'unqualified agent gets the mean qualified weight');
  assert.ok(!weightsEqual(w));
  assert.equal(MIN_N_WEIGHT, 5);
});

test('Council P(up) is the weighted mean of the agents that called; abstainers drop out', () => {
  const calls = [toCall('momentum', 0.7, ''), toCall('surface', 0.5, '')];
  const r = councilPUp(calls, { momentum: 0.75, reversion: 0.1, surface: 0.25 })!;
  assert.ok(Math.abs(r.pUp - (0.75 * 0.7 + 0.25 * 0.5)) < 1e-9);
  assert.deepEqual(r.used, ['momentum', 'surface']);
  assert.equal(councilPUp([], { momentum: 1 }), null);
});

test("Council voice on any order: the market's surface re-centred by the Council's edge", () => {
  // logistic surface around F = 74,000: P(> k) = 1 / (1 + exp((k − F)/40))
  const F = 74_000, bp = { up: (k: number) => 1 / (1 + Math.exp((k - F) / 40)) };
  assert.equal(councilProbability(bp, F, { side: 'up', strike: F }, null), null, 'no edge → no voice');
  const up = councilProbability(bp, F, { side: 'up', strike: F }, 0.1)!;
  assert.ok(Math.abs(up - 0.6) < 0.002, `ATM up moves by the edge: ${up}`);
  const down = councilProbability(bp, F, { side: 'down', strike: F }, 0.1)!;
  assert.ok(Math.abs(down - 0.4) < 0.002);
  const range = councilProbability(bp, F, { side: 'range', lower: F + 20, upper: F + 80 }, 0.1)!;
  const base = pricedAtShift(bp, { side: 'range', lower: F + 20, upper: F + 80 }, 0);
  assert.ok(range > base, 'a bullish Council makes an upside range more likely');
  assert.equal(councilProbability(bp, F, { side: 'up', strike: F }, 0), councilProbability(bp, F, { side: 'up', strike: F }, 0));
});

test('agent keys come from COUNCIL_KEY_<NAME>; bad keys are skipped', () => {
  const k = Ed25519Keypair.generate();
  const a = agentsFromEnv({ COUNCIL_KEY_MOMENTUM: k.getSecretKey(), COUNCIL_KEY_SURFACE: 'nonsense' } as any);
  assert.deepEqual(a.map((x) => [x.name, x.address]), [['momentum', k.toSuiAddress()]]);
});

test('the Council is a scored voice: Brier only over rows where it was live', () => {
  const rows: any[] = [
    { tx: 'a', won: 1, p_you: 0.9, p_mkt: 0.5, p_hlx: 0.5, p_crowd: null, p_council: 0.7, structure: 'directional', regime: null, commit: 5, payoff: 1, ts: 1 },
    { tx: 'b', won: 0, p_you: 0.9, p_mkt: 0.5, p_hlx: 0.5, p_crowd: null, p_council: null, structure: 'directional', regime: null, commit: 5, payoff: -5, ts: 2 },
  ];
  const st = bucketStats(rows);
  assert.equal(st.n_council, 1);
  assert.ok(Math.abs(st.brier.council! - 0.09) < 1e-9);
});
