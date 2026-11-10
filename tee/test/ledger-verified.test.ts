// A commit whose CONVICTION memory Walrus Memory search no longer returns, but whose OUTCOME says reveal_ok=true
// (the watcher re-hashed the conviction against the chain at settlement), is remembered — not hidden. A commit with
// no memory at all stays hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setTatumTransport } from '../src/shared/tatum.ts';
import { __resetMemwal } from '../src/memory/store.ts';
import { commitLedger } from '../src/memory/service.ts';
import { formatRecord, parseRecord, namespaceFor } from '../src/memory/format.ts';

test('ledger: verified-at-settlement counts as remembered; no memory at all stays hidden', async () => {
  const owner = '0x' + 'ef'.repeat(32), ns = namespaceFor(owner);
  const now = Date.now(), old = now - 3_600_000;
  const ev = (d: string, h: number) => ({ contents: { json: { owner, hash: [h], oracle: '0x' + 'b'.repeat(64), expiry_ms: String(old + 600_000), committed_ms: String(old) } }, transaction: { digest: d } });
  __setTatumTransport((async () => new Response(JSON.stringify({ data: { events: { pageInfo: { hasNextPage: false, endCursor: 'c' }, nodes: [ev('DIGESTA111111111111111111111111111', 1), ev('DIGESTB222222222222222222222222222', 2)] } } }), { status: 200 })) as any);
  const outcomeA = formatRecord('OUTCOME', [['tx', 'DIGESTA111111111111111111111111111'], ['reveal_ok', 'true'], ['result', 'WIN'], ['ts', 1]]);
  __resetMemwal({ listMemories: async () => ({ memories: [{ blob_id: 'O1', namespace_id: ns }], has_more: false }), recall: async () => ({ results: [{ blob_id: 'O1', text: outcomeA, created_at: '2026-11-10T00:00:00Z' }] }) });
  try {
    const recs = [parseRecord(outcomeA, { blob_id: 'O1' })!];
    const l: any = await commitLedger(owner, recs);
    assert.equal(l.onchain, 2);
    assert.equal(l.verified_at_settlement, 1, 'A: remembered and verified at settlement');
    assert.equal(l.settled, 1); assert.equal(l.wins, 1);
    assert.equal(l.missing.length, 1, 'B: no memory at all → still hidden');
    assert.equal(l.missing[0].digest, 'DIGESTB222222222222222222222222222');
  } finally { __setTatumTransport(null); __resetMemwal(); }
});
