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
