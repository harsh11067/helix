// Chain audit (fun/audit.ts): each indexed ConvictionCommitted event is checked against its own transaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditCommit, summarize } from '../src/fun/audit.ts';

const OWNER = '0x' + 'ab'.repeat(32), ORACLE = '0x' + 'cd'.repeat(32);
const HASH_B64 = Buffer.from('11'.repeat(32), 'hex').toString('base64');
const EXPIRY = 1_794_260_700_000, COMMITTED = EXPIRY - 600_000;
const ev = { owner: OWNER, hash: '11'.repeat(32), oracle: ORACLE, expiry_ms: EXPIRY, committed_ms: COMMITTED, digest: 'D1' };
const tx = (over: any = {}) => ({
  digest: 'D1', sender: { address: OWNER },
  effects: {
    status: 'SUCCESS', timestamp: new Date(COMMITTED + 130).toISOString(), checkpoint: { sequenceNumber: '404686941' },
    events: { nodes: [{ contents: { type: { repr: '0x5bcf::journal::ConvictionCommitted' }, json: { owner: OWNER, hash: HASH_B64, oracle: ORACLE, expiry_ms: String(EXPIRY), committed_ms: String(COMMITTED) } } }] },
    ...over.effects,
  },
  ...over.top,
});

test('a clean commit passes every check, with its lead time before expiry', () => {
  const r = auditCommit(ev, tx());
  assert.deepEqual(r.failed, []); assert.equal(r.ok, true);
  assert.equal(r.checkpoint, 404686941); assert.equal(r.lead_s, 600);
});

test('a commit whose checkpoint time is at/after expiry is flagged as backdated-impossible', () => {
  const r = auditCommit(ev, tx({ effects: { timestamp: new Date(EXPIRY + 1).toISOString() } }));
  assert.ok(r.failed.includes('before_expiry')); assert.ok(r.failed.includes('clock'));
});

test('missing tx, failed tx, wrong sender and a different hash are each caught', () => {
  assert.deepEqual(auditCommit(ev, null).failed, ['exists']);
  assert.ok(auditCommit(ev, tx({ effects: { status: 'FAILURE' } })).failed.includes('success'));
  assert.ok(auditCommit(ev, tx({ top: { sender: { address: '0x' + 'ee'.repeat(32) } } })).failed.includes('sender'));
  const other = Buffer.from('22'.repeat(32), 'hex').toString('base64');
  const tampered = tx({ effects: { events: { nodes: [{ contents: { type: { repr: '0x5bcf::journal::ConvictionCommitted' }, json: { owner: OWNER, hash: other, oracle: ORACLE, expiry_ms: String(EXPIRY), committed_ms: String(COMMITTED) } } }] } } });
  assert.deepEqual(auditCommit(ev, tampered).failed, ['event']);
});

test('a sponsored commit (gas paid by someone else) still has the committer as sender', () => {
  assert.equal(auditCommit(ev, tx()).ok, true);   // GraphQL sender = signer of the intent; the sponsor is only the gas owner
});

test('summary counts per check, keeps failures, and reports the tightest lead', () => {
  const rows = [auditCommit(ev, tx()), auditCommit({ ...ev, digest: 'D2' }, null)];
  const s = summarize(rows, { started_ms: 0, finished_ms: 10, tatum_requests: 1, hidden: null });
  assert.equal(s.audited, 2); assert.equal(s.ok, 1);
  assert.equal(s.passed.exists, 1); assert.equal(s.passed.sender, 1);
  assert.deepEqual(s.failures, [{ digest: 'D2', owner: OWNER, failed: ['exists'] }]);
  assert.equal(s.min_lead_s, 600); assert.equal(s.hidden, null);
});
