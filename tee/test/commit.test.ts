// Commit mode (RECOVERY.md R3): commit–reveal helpers. Pure; no network.
//   OFFLINE=1 node --test test/commit.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  commitBody, commitMemoryText, verifyReveal, sha256hex, hashHex, parseCommitEvent, commitEventsOf, checkCommit,
  commitTx, JOURNAL_PKG, COMMIT_EVENT,
} from '../src/memory/commit.ts';
import { formatRecord, parseRecord, str } from '../src/memory/format.ts';
import { settledRows } from '../src/memory/service.ts';

const ADDR = '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
const MKT = '0x0912a64053ad8cfc9c2f5449d2e3e98831fc9ca96671feb1bbeac7b2b9a49b68';
const DIGEST = 'Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt';
const body = formatRecord('CONVICTION', [
  ['mode', 'commit'], ['asset', 'BTC'], ['dir', 'up'], ['conf', '0.80'], ['vol', 'calm'], ['structure', 'directional'],
  ['side', 'up'], ['order', 'binary,up,74100,1'], ['commit', '5.00'], ['p_you', '0.860'], ['p_mkt', '0.420'], ['p_hlx', '0.440'],
  ['market', MKT], ['expiry', 1794218400], ['expiry_ms', 1794218400000], ['fill', 'paper'], ['price', '0.450'],
  ['qty', '11.11'], ['cost', '5.00'], ['origin', 'cli'], ['ts', 1794217897], ['nonce', 'a1b2c3d4'],
]);
const hash = sha256hex(body);

test('commit body excludes exactly hash / tx / commit_tx, so the reveal re-hashes to the committed value', () => {
  const mem = commitMemoryText(body, hash, DIGEST);
  assert.equal(commitBody(mem), body);
  assert.equal(commitBody(body), body, 'idempotent');
  assert.ok(verifyReveal(mem, hash));
  assert.ok(verifyReveal(mem, hash.toUpperCase()), 'hex case-insensitive');
  const r = parseRecord(mem)!;
  assert.equal(str(r, 'tx'), DIGEST); assert.equal(str(r, 'commit_tx'), DIGEST); assert.equal(str(r, 'hash'), hash);
});

test('any edit to the remembered conviction breaks the reveal', () => {
  const mem = commitMemoryText(body, hash, DIGEST);
  assert.ok(!verifyReveal(mem.replace('dir=up', 'dir=down'), hash));
  assert.ok(!verifyReveal(mem.replace('conf=0.80', 'conf=0.81'), hash));
  assert.ok(!verifyReveal(mem, null));
  assert.ok(!verifyReveal(mem, 'ab'.repeat(32)));
});

test('vector<u8> hash decodes from number arrays, base64 and hex', () => {
  const bytes = [...Buffer.from(hash, 'hex')];
  assert.equal(hashHex(bytes), hash);
  assert.equal(hashHex(Buffer.from(hash, 'hex').toString('base64')), hash);
  assert.equal(hashHex('0x' + hash), hash);
  assert.equal(hashHex('short'), null);
  assert.equal(hashHex(undefined), null);
});

test('checkCommit: owner, hash, market, expiry and commit-before-expiry must all match', () => {
  const ev = parseCommitEvent({ owner: ADDR, hash: [...Buffer.from(hash, 'hex')], oracle: MKT, expiry_ms: '1794218400000', committed_ms: '1794217897000' }, DIGEST)!;
  const want = { address: ADDR, hash, market: MKT, expiryMs: 1794218400000 };
  assert.equal(checkCommit(ev, want), null);
  assert.match(checkCommit(undefined, want)!, /no ConvictionCommitted/);
  assert.match(checkCommit({ ...ev, owner: '0x' + '2'.repeat(64) }, want)!, /different address/);
  assert.match(checkCommit({ ...ev, hash: 'cd'.repeat(32) }, want)!, /hash does not match/);
  assert.match(checkCommit({ ...ev, oracle: '0x' + '3'.repeat(64) }, want)!, /market differs/);
  assert.match(checkCommit({ ...ev, expiry_ms: 1 }, want)!, /expiry differs/);
  assert.match(checkCommit({ ...ev, committed_ms: 1794218400000 }, want)!, /after expiry/);
});

test('commitEventsOf picks only helix::journal events from this package', () => {
  const json = { owner: ADDR, hash: [...Buffer.from(hash, 'hex')], oracle: MKT, expiry_ms: '1794218400000', committed_ms: '1794217897000' };
  const res = { Transaction: { digest: DIGEST, events: [
    { eventType: COMMIT_EVENT, json },
    { eventType: '0x' + 'ab'.repeat(32) + '::journal::ConvictionCommitted', json },   // impostor package
    { eventType: '0x2::coin::Whatever', json: {} },
  ] } };
  const evs = commitEventsOf(res);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].digest, DIGEST);
  assert.equal(evs[0].hash, hash);
});

test('commit PTB calls journal::commit(hash bytes, market, expiry, clock)', () => {
  const tx = commitTx(ADDR, hash, MKT, 1794218400000);
  const data: any = tx.getData();
  const call = data.commands[0].MoveCall;
  assert.equal(call.package, JOURNAL_PKG);
  assert.equal(`${call.module}::${call.function}`, 'journal::commit');
  assert.equal(call.arguments.length, 4);
});

test('paper commits settle into calibration exactly like minted convictions', () => {
  const conv = parseRecord(commitMemoryText(body, hash, DIGEST))!;
  const outcome = parseRecord(formatRecord('OUTCOME', [['tx', DIGEST], ['mode', 'commit'], ['reveal_ok', true], ['result', 'WIN'], ['payoff', '+6.11']]))!;
  const rows = settledRows([conv, outcome]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].won, 1); assert.equal(rows[0].p_you, 0.86); assert.equal(rows[0].payoff, 6.11);
});

test('watcher: a conviction is never resolved twice concurrently', async () => {
  const { resolveOnce } = await import('../src/memory/service.ts');
  const rec = parseRecord(formatRecord('CONVICTION', [['tx', 'X'], ['expiry', Math.floor(Date.now() / 1000) + 3600], ['market', '0x1']]))!;
  const [a, b] = await Promise.all([resolveOnce('X', 'ns', rec), resolveOnce('X', 'ns', rec)]);
  assert.deepEqual([a.status, b.status].sort(), ['in_progress', 'not_expired']);
});

// ---------------------------------------------------------------- sponsored commits
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { sponsorRefusal, sponsorSign, __setSponsor, SPONSOR_GAS_BUDGET } from '../src/memory/commit.ts';

const SP = Ed25519Keypair.generate();
const DIG = '11111111111111111111111111111111';  // 32-byte base58 digest placeholder for an offline gas coin ref
async function bytesOf(tx: Transaction, gasOwner: string | null, budget = SPONSOR_GAS_BUDGET) {
  if (gasOwner) tx.setGasOwner(gasOwner);
  tx.setGasBudget(budget); tx.setGasPrice(1000);
  tx.setGasPayment([{ objectId: '0x' + '7'.repeat(64), version: '1', digest: DIG }]);
  return Buffer.from(await tx.build()).toString('base64');
}

test('sponsor: only a lone helix::journal::commit paid by the sponsor is co-signed', async () => {
  __setSponsor(SP);
  const sp = SP.toSuiAddress();
  assert.equal(sponsorRefusal(await bytesOf(commitTx(ADDR, hash, MKT, 1794218400000), null)), undefined, 'not sponsored → untouched');
  assert.equal(sponsorRefusal(await bytesOf(commitTx(ADDR, hash, MKT, 1794218400000), sp)), null, 'valid sponsored commit');

  const extra = commitTx(ADDR, hash, MKT, 1794218400000);
  extra.transferObjects([extra.splitCoins(extra.gas, [1])], ADDR);
  assert.match(sponsorRefusal(await bytesOf(extra, sp))!, /only sponsors gas for helix::journal::commit/, 'cannot smuggle a gas transfer');

  const other = new Transaction(); other.setSender(ADDR);
  other.moveCall({ target: '0x2::coin::zero', typeArguments: ['0x2::sui::SUI'] });
  assert.match(sponsorRefusal(await bytesOf(other, sp))!, /only sponsors gas/);

  assert.match(sponsorRefusal(await bytesOf(commitTx(ADDR, hash, MKT, 1794218400000), sp, SPONSOR_GAS_BUDGET + 1))!, /budget too high/);
  assert.match(sponsorRefusal(await bytesOf(commitTx(sp, hash, MKT, 1794218400000), sp))!, /cannot be the sender/);
  __setSponsor(null);
  assert.equal(sponsorRefusal(await bytesOf(commitTx(ADDR, hash, MKT, 1794218400000), sp)), undefined, 'no sponsor configured → never co-signs');
});

test('sponsor: per-sender daily limit', async () => {
  __setSponsor(SP);
  const b = await bytesOf(commitTx(ADDR, hash, MKT, 1794218400000), SP.toSuiAddress());
  for (let i = 0; i < 40; i++) { assert.equal(sponsorRefusal(b), null); await sponsorSign(b); }
  assert.match(sponsorRefusal(b)!, /daily sponsored-commit limit/);
  __setSponsor(null);
});
