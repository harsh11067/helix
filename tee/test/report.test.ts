// N3 Forecaster Report: a signed passport snapshot frozen as a Walrus blob + a REPORT memory pointing at it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { createReport, buildReport, __resetReports } from '../src/passport/offchain/report.ts';
import { __setAttestationKey, verifyJson } from '../src/passport/offchain/attest.ts';
import { fetchJson } from '../src/shared/walrus.ts';
import { __resetMemwal } from '../src/memory/store.ts';
import { parseRecord } from '../src/memory/format.ts';

test('report: signed snapshot stored as a blob, remembered, reused for 10 min, refused when hidden is unknown', async () => {
  const kp = Ed25519Keypair.generate();
  __setAttestationKey(kp); __resetReports();
  const written: string[] = [];
  __resetMemwal({ rememberAndWait: async (text: string) => { written.push(text); return { blob_id: 'MEM' + written.length, job_id: null }; } });
  const owner = '0x' + 'cd'.repeat(32);
  const pp = { namespace: 'helix-v1-test', committed: 9, shown: 8, hidden: 1, n_settled: 7, wins: 3, brier: 0.31, commits: [] };
  try {
    const out: any = await createReport(owner, async () => pp, 1_794_300_000_000);
    assert.ok(out.blob_id && out.viewer_url.endsWith(out.blob_id));
    const doc = await fetchJson(out.blob_id);                 // OFFLINE: the mock Walrus store
    assert.equal(doc.report.kind, 'helix-forecaster-report');
    assert.deepEqual(doc.report.passport, pp);
    assert.equal(await verifyJson(doc.report, doc.signature.sig_b64, doc.signature.pubkey_hex), true);
    assert.equal(await verifyJson({ ...doc.report, passport: { ...pp, hidden: 0 } }, doc.signature.sig_b64, doc.signature.pubkey_hex), false);
    const rec = parseRecord(written[0])!;
    assert.equal(rec.type, 'REPORT'); assert.equal(rec.f.blob, out.blob_id); assert.equal(rec.f.hidden, '1');
    const again: any = await createReport(owner, async () => { throw new Error('should not rebuild'); }, 1_794_300_000_000 + 60_000);
    assert.equal(again.reused, true); assert.equal(again.blob_id, out.blob_id);
    __resetReports();
    await assert.rejects(createReport(owner, async () => ({ ...pp, hidden: null })), /unknown hidden count/);
    assert.equal(buildReport(pp).verify.script, 'node tee/scripts/verify-report.mjs <blob_id>');
  } finally { __setAttestationKey(null); __resetMemwal(); __resetReports(); }
});
