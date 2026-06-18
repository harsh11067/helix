// Task D acceptance: the live SuiEventSource ingests the real StrategyCreated
// event from the HELIX package. Run live: node services/indexer/scripts/live-ingest-check.ts
import { strict as assert } from 'node:assert';
import { SuiEventSource } from '../src/eventSource.ts';
import { Store } from '../src/store.ts';

const RPC = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';
const HELIX = process.env.HELIX_PACKAGE_ID ?? '0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3';

const store = new Store();
const got: any[] = [];
const src = new SuiEventSource(RPC, [{ package: HELIX, module: 'events' }], 10 ** 9);
await src.start((e) => { got.push(e); store.ingest(e); });   // start() awaits the initial backfill
src.stop();

const created = got.filter((e) => e.type === 'StrategyCreated');
console.log('ingested events       :', got.length, '| StrategyCreated:', created.length);
created.forEach((e) => console.log('  •', e.strategyId, '| owner', e.owner, '| gen', e.generation, '| cap', e.initialCapital));

const board = store.leaderboard(10);
console.log('store leaderboard rows:', board.length);

assert.ok(created.length >= 1, 'expected at least one real StrategyCreated from chain');
console.log('LIVE INGEST: PASS — indexer ingested real StrategyCreated from', HELIX.slice(0, 10) + '…');
