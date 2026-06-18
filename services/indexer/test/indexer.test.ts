import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { Store } from '../src/store.ts';
import { MockEventSource, mapSuiEvent } from '../src/eventSource.ts';
import { createIndexer } from '../src/server.ts';

// 3.28 — StrategyCreated captured into the strategies read-model
test('3.28 captures StrategyCreated', () => {
  const s = new Store();
  s.ingest({ type: 'StrategyCreated', strategyId: 's1', owner: '0xA', creator: '0xA', generation: 0, initialCapital: 100 });
  const row = s.getStrategy('s1');
  assert.ok(row);
  assert.equal(row!.owner, '0xA');
  assert.equal(row!.fitness, 100);
  assert.equal(row!.status, 'pending');
});

// 3.29 — BreedingExecuted captured with parent links + lineage edges
test('3.29 captures BreedingExecuted with parent links', () => {
  const s = new Store();
  s.ingest({ type: 'StrategyCreated', strategyId: 'pa', owner: '0xA', creator: '0xA', generation: 1, initialCapital: 100 });
  s.ingest({ type: 'StrategyCreated', strategyId: 'pb', owner: '0xA', creator: '0xB', generation: 1, initialCapital: 100 });
  s.ingest({ type: 'StrategyCreated', strategyId: 'child', owner: '0xA', creator: '0xA', generation: 2, initialCapital: 50, parents: [] });
  s.ingest({ type: 'BreedingExecuted', parentA: 'pa', parentB: 'pb', child: 'child', breeder: '0xA', feePaid: 5, childGeneration: 2 });

  assert.equal(s.breedingEvents.length, 1);
  assert.deepEqual(s.breedingEvents[0].parentA, 'pa');
  assert.deepEqual(s.ancestors('child').sort(), ['pa', 'pb']);
  assert.equal(s.getStrategy('pa')!.offspringCount, 1);
});

// 3.30 — leaderboard top-N by fitness, correct order
test('3.30 leaderboard ordering', () => {
  const s = new Store();
  for (const [id, fit] of [['a', 30], ['b', 90], ['c', 60], ['d', 10]] as const) {
    s.ingest({ type: 'StrategyCreated', strategyId: id, owner: '0xA', creator: '0xA', generation: 0, initialCapital: fit });
    s.ingest({ type: 'PerformanceSnapshot', strategyId: id, fitness: fit, pnl: 0, ts: 1 });
  }
  const top = s.leaderboard(3);
  assert.deepEqual(top.map((r) => r.strategyId), ['b', 'c', 'a']);
});

// 3.31 — lineage query returns the full ancestor tree (3 levels)
test('3.31 lineage ancestors (deep)', () => {
  const s = new Store();
  s.ingest({ type: 'StrategyCreated', strategyId: 'g0', owner: '0xA', creator: '0xA', generation: 0, initialCapital: 100 });
  s.ingest({ type: 'StrategyCreated', strategyId: 'g1', owner: '0xA', creator: '0xA', generation: 1, initialCapital: 100, parents: ['g0'] });
  s.ingest({ type: 'StrategyCreated', strategyId: 'g2', owner: '0xA', creator: '0xA', generation: 2, initialCapital: 100, parents: ['g1'] });
  assert.deepEqual(s.ancestors('g2').sort(), ['g0', 'g1']);
  assert.deepEqual(s.descendants('g0').sort(), ['g1', 'g2']);
});

// 3.27 — mock event source delivers events; real Sui event mapping is correct
test('3.27 event source + sui mapping', () => {
  const src = new MockEventSource();
  const got: string[] = [];
  src.start((e) => { if (e.type === 'StrategyCreated') got.push(e.strategyId); });
  src.emit({ type: 'StrategyCreated', strategyId: 'x', owner: '0xA', creator: '0xA', generation: 0, initialCapital: 1 });
  assert.deepEqual(got, ['x']);

  const mapped = mapSuiEvent('0xpkg::events::BreedingExecuted', {
    parent_a: 'pa', parent_b: 'pb', child: 'c', breeder: '0xA', fee_paid: '7', child_generation: '3',
  });
  assert.equal(mapped?.type, 'BreedingExecuted');
  assert.equal((mapped as any).feePaid, 7);
});

// 3.32 — WebSocket broadcasts live updates to a connected client
test('3.32 websocket broadcast', async () => {
  const ix = createIndexer();
  const port: number = await new Promise((r) => ix.server.listen(0, () => r((ix.server.address() as AddressInfo).port)));
  try {
    const ws = new WebSocket(`ws://localhost:${port}/stream`);
    const received: any[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on('error', reject);
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        received.push(msg);
        if (msg.type === 'Hello') {
          // now push an event through the indexer; client should receive it
          ix.ingest({ type: 'StrategyCreated', strategyId: 'live1', owner: '0xA', creator: '0xA', generation: 0, initialCapital: 42 });
        }
        if (msg.type === 'StrategyCreated') resolve();
      });
    });
    const created = received.find((m) => m.type === 'StrategyCreated');
    assert.equal(created.strategyId, 'live1');
    assert.equal(ix.store.getStrategy('live1')!.fitness, 42); // also landed in read-model
    ws.close();
  } finally {
    ix.hub.close();
    ix.server.close();
  }
});

// 3.33 (tail) — deployed strategy appears in leaderboard after indexer sees it
test('3.33 deploy → indexer → leaderboard', () => {
  const s = new Store();
  s.ingest({ type: 'StrategyCreated', strategyId: 'deployed', owner: '0xA', creator: '0xA', generation: 0, initialCapital: 30 });
  s.ingest({ type: 'StrategyActivated', strategyId: 'deployed' });
  s.ingest({ type: 'PerformanceSnapshot', strategyId: 'deployed', fitness: 52, pnl: 22, ts: 2 });
  const top = s.leaderboard(10);
  assert.equal(top[0].strategyId, 'deployed');
  assert.equal(top[0].status, 'active');
  assert.equal(top[0].fitness, 52);
});
