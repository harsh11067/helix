// Regression (10 Nov): many callers share the commit-event log; concurrent syncs from one cursor once
// appended the same page several times (ticker showed 776 commits for ~175). Single-flight + de-dupe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setTatumTransport } from '../src/shared/tatum.ts';
import { commitEvents } from '../src/fun/ticker.ts';

test('concurrent commitEvents() callers never duplicate events', async () => {
  let calls = 0;
  const ev = (d: string, i: number) => ({ contents: { json: { owner: '0x' + 'a'.repeat(64), hash: [i], oracle: '0x' + 'b'.repeat(64), expiry_ms: String(1000 + i), committed_ms: String(900 + i) } }, transaction: { digest: d } });
  __setTatumTransport((async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 50));
    return new Response(JSON.stringify({ data: { events: { pageInfo: { hasNextPage: false, endCursor: 'c1' }, nodes: [ev('D1', 1), ev('D2', 2)] } } }), { status: 200 });
  }) as any);
  try {
    const rs = await Promise.all([commitEvents(), commitEvents(), commitEvents(), commitEvents()]);
    for (const r of rs) assert.ok(r.length <= 2);
    const after = await commitEvents();
    assert.equal(after.length, 2);
    assert.equal(new Set(after.map((e) => e.digest)).size, 2);
    assert.equal(calls, 1, 'one sync served every concurrent caller');
  } finally { __setTatumTransport(null); }
});
