// Memory mirror: records HELIX has recalled before survive a restart even when Walrus Memory's top-k
// search doesn't return them — but only while the blob is still LISTED on the account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recallAll, findRecord, __resetMemwal, __setMirror } from '../src/memory/store.ts';
import { formatRecord, namespaceFor } from '../src/memory/format.ts';

test('mirror: a listed blob that search no longer returns is still known; a delisted one drops out', async () => {
  const ns = namespaceFor('0x' + 'cd'.repeat(32));
  const text = formatRecord('CONVICTION', [['tx', 'M1'], ['asset', 'BTC'], ['dir', 'up'], ['conf', '0.70'], ['ts', 5]]);
  let listed = ['B1', 'B2'];
  __resetMemwal({
    listMemories: async () => ({ memories: listed.map((b) => ({ blob_id: b, namespace_id: ns })), has_more: false }),
    // search returns only B2 — B1 is "unrecallable"
    recall: async () => ({ results: [{ blob_id: 'B2', text: formatRecord('OUTCOME', [['tx', 'M1'], ['result', 'WIN'], ['ts', 6]]), created_at: '2026-11-10T00:00:00Z' }] }),
  });
  __setMirror({ [ns]: [{ blob_id: 'B1', created_at: '2026-11-09T00:00:00Z', text }] });
  try {
    const recs = await recallAll(ns, { fresh: true });
    assert.deepEqual(recs.map((r) => `${r.type}:${r.blob_id}`).sort(), ['CONVICTION:B1', 'OUTCOME:B2']);
    assert.equal((await findRecord(ns, 'CONVICTION', 'M1'))?.blob_id, 'B1', 'exact lookup answers from the mirror');
    listed = ['B2'];                                   // B1 deleted upstream
    __resetMemwal({
      listMemories: async () => ({ memories: listed.map((b) => ({ blob_id: b, namespace_id: ns })), has_more: false }),
      recall: async () => ({ results: [] }),
    });
    const after = await recallAll(ns, { fresh: true });
    assert.ok(!after.some((r) => r.blob_id === 'B1'), 'a delisted blob is never served from the mirror');
  } finally { __setMirror(null); __resetMemwal(); }
});

test('a fresh write survives a refresh that runs before listMemories lists it', async () => {
  const { remember } = await import('../src/memory/store.ts');
  const ns = namespaceFor('0x' + 'ce'.repeat(32));
  const text = formatRecord('REPORT', [['blob', 'R1'], ['ts', 9]]);
  __resetMemwal({
    rememberAndWait: async () => ({ blob_id: 'FRESH1', job_id: null }),
    listMemories: async () => ({ memories: [], has_more: false }),     // the listing hasn't caught up yet
    recall: async () => ({ results: [] }),                             // and search doesn't return it yet
  });
  try {
    await remember(ns, text);
    const recs = await recallAll(ns, { fresh: true });
    assert.ok(recs.some((r) => r.blob_id === 'FRESH1'), 'own recent write kept');
  } finally { __resetMemwal(); }
});
