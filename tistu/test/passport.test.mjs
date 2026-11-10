// Passport browser logic (pure): re-hash the remembered conviction exactly as the chain committed it.
//   node --test tistu/test/*.test.mjs
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { commitBody, b64ToHex, sha256Hex, passportShareUrls, passportEmbedHTML } from '../js/passport.js';

const body = 'CONVICTION v1 | mode=commit | asset=BTC | dir=up | conf=0.80 | nonce=a1b2c3d4';
const mem = `${body} | hash=${'ab'.repeat(32)} | tx=Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt | commit_tx=Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt`;

test('commitBody strips exactly hash / tx / commit_tx and is idempotent', () => {
  assert.equal(commitBody(mem), body);
  assert.equal(commitBody(body), body);
});

test('browser sha256 equals the server/commit hash; base64 → hex matches GraphQL vector<u8>', async () => {
  const expect = createHash('sha256').update(body, 'utf8').digest('hex');
  assert.equal(await sha256Hex(commitBody(mem)), expect);
  assert.equal(b64ToHex(Buffer.from(expect, 'hex').toString('base64')), expect);
  assert.notEqual(await sha256Hex(commitBody(mem.replace('dir=up', 'dir=down'))), expect, 'an edited memory cannot match');
});

test('share links tag Tatum and Walrus; embed shows hidden count and no invented Brier', () => {
  const p = { namespace: 'helix-v1-4d922636976d', n_settled: 2, wins: 1, brier: 0.3, committed: 3, hidden: 0 };
  const s = passportShareUrls(p, 'https://helix-compiler.onrender.com');
  const text = new URL(s.x).searchParams.get('text');
  assert.match(text, /@Tatum_io/); assert.match(text, /@WalrusFoundation/); assert.match(text, /hidden 0/);
  assert.ok(!/Brier/.test(text), 'no Brier claim with n < 3');
  assert.equal(s.card, 'https://helix-compiler.onrender.com/passport/helix-v1-4d922636976d/card.svg');
  assert.match(s.embed, /passport\.html\?id=helix-v1-4d922636976d&embed=1/);
  const e = passportEmbedHTML({ ...p, n_settled: 0, brier: null });
  assert.match(e, /hidden 0/); assert.match(e, /Brier<\/span> <b class="mono">—/);
});

test('T2 Verify: ✓✓ only when GraphQL AND gRPC both match; a gRPC outage is shown as 1 interface, never faked', async () => {
  const { verifyCommitInBrowser, verifyResultHTML, sha256Hex: sh, commitBody: cb } = await import('../js/passport.js');
  const text = 'CONVICTION v1 | dir=up | conf=80 | hash=abc | tx=D1';
  const memHex = await sh(cb(text));
  const owner = '0x' + 'ab'.repeat(32);
  const gqlBody = { data: { transaction: { sender: { address: owner }, effects: { events: { nodes: [{ contents: { type: { repr: '0x1::journal::ConvictionCommitted' }, json: { hash: memHex } } }] } } } } };
  const orig = globalThis.fetch;
  const mock = (grpc) => { globalThis.fetch = async (url) => ({ ok: grpc !== 'down' || !String(url).includes('/grpc'), json: async () => String(url).includes('/grpc') ? grpc : gqlBody }); };
  try {
    mock({ success: true, sender: owner, checkpoint: 7, events: [{ hash: memHex }] });
    let v = await verifyCommitInBrowser('http://x', 'D1', text);
    assert.equal(v.interfaces, 2); assert.match(verifyResultHTML(v), /✓✓ match.*2 Tatum interfaces/);
    mock('down');
    v = await verifyCommitInBrowser('http://x', 'D1', text);
    assert.equal(v.interfaces, 1); assert.match(verifyResultHTML(v), /1 Tatum interface \(gRPC unavailable\)/); assert.doesNotMatch(verifyResultHTML(v), /✓✓/);
    mock({ success: true, sender: owner, checkpoint: 7, events: [{ hash: 'ff'.repeat(32) }] });
    v = await verifyCommitInBrowser('http://x', 'D1', text);
    assert.match(verifyResultHTML(v), /✗ gRPC hash differs/);
  } finally { globalThis.fetch = orig; }
});

test('T3 price chip: settlement vs every independent source, honest when they disagree', async () => {
  const { priceChipHTML } = await import('../js/passport.js');
  const p = { settle: 74000, oracle: 'DeepBook Predict oracle', sources: [{ name: 'Tatum', usd: 74010, bps: 1.4 }, { name: 'Pyth', usd: 73990, bps: -1.4 }] };
  assert.match(priceChipHTML(p), /3 price sources agree ✓ · ≤1\.4 bps/);
  assert.match(priceChipHTML({ ...p, sources: [{ name: 'Tatum', usd: 2127, bps: 19 }] }), /2 price sources agree ✓ · ≤19 bps/);
  assert.match(priceChipHTML({ ...p, sources: [{ name: 'Tatum', usd: 75000, bps: 135 }] }), /differ by 135 bps/);
  assert.equal(priceChipHTML(null), '');
  assert.equal(priceChipHTML({ ...p, sources: [] }), '');
});

test('N3 report: listed from REPORT memories, and the browser check accepts a genuine signature and rejects an edit', async () => {
  const { reportsHTML, verifyReportSignature } = await import('../js/passport.js');
  const html = reportsHTML({ reports: [{ blob_id: 'BLOB123456789abc', ts: 1794300000, committed: 89, hidden: 3, network: 'walrus-testnet' }] });
  assert.match(html, /passport\.html\?report=BLOB123456789abc/); assert.match(html, /hidden 3/); assert.match(html, /freeze-report/);
  const { webcrypto } = await import('node:crypto');
  const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  const report = { kind: 'helix-forecaster-report', v: 1, passport: { namespace: 'ns', hidden: 3, b: [2, 1] } };
  const canonical = '{"kind":"helix-forecaster-report","passport":{"b":[2,1],"hidden":3,"namespace":"ns"},"v":1}';
  const sig = new Uint8Array(await webcrypto.subtle.sign({ name: 'Ed25519' }, kp.privateKey, new TextEncoder().encode(canonical)));
  const doc = { report, signature: { pubkey_hex: Buffer.from(raw).toString('hex'), sig_b64: Buffer.from(sig).toString('base64') } };
  assert.equal(await verifyReportSignature(doc), true);
  assert.equal(await verifyReportSignature({ ...doc, report: { ...report, passport: { ...report.passport, hidden: 0 } } }), false, 'hiding a call breaks the signature');
});
