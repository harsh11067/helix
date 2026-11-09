// P4 On-chain Forecaster Passport — encoder, signatures, mock attestation, sponsor predicate, routes.
// Offline: no network. The Move side of the TS↔Move agreement runs in `cd contracts-passport && sui move test`.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, Inputs } from '@mysten/sui/transactions';
import {
  encodeAttestation, decodeAttestation, signAttestation, attestationProblem, badgesFor, badgeNames, BADGE, keypairFrom, __setAttestor,
  type AttestationFields,
} from '../src/passport/onchain/attestation.ts';
import { renderMoveVectors, VECTORS_PATH, CASES, TEST_ATTESTOR } from '../src/passport/onchain/vectors.ts';
import { statsFromTimeline, mockAttestation, UNSCORED_BRIER_BPS, COUNCIL_ADDRESSES, ATTESTATION_TTL_MS } from '../src/passport/onchain/mockAttestation.ts';
import { isSponsorablePassportCall, PASSPORT_SPONSOR_GAS_BUDGET } from '../src/passport/onchain/sponsor.ts';
import { buildClaimTx, buildRefreshTx, friendlyAbort, parsePassportJson, vecHex, PASSPORT_PACKAGE, PASSPORT_REGISTRY } from '../src/passport/onchain/chain.ts';
import { checkAttestation } from '../src/passport/onchain/routes.ts';
import { settledRows } from '../src/memory/service.ts';
import { makeServer } from '../src/compiler/server.ts';

const OWNER = '0x' + 'ab'.repeat(32);
const fields = (o: Partial<AttestationFields> = {}): AttestationFields => ({
  owner: OWNER, ns: 'helix-v1-0123456789ab', n_settled: 12, wins: 8, brier_bps: 1800, gap_bps: 350, gap_negative: false,
  hidden: 0, badges: 3, issued_ms: 1_794_000_000_000, expires_ms: 1_794_000_600_000, ...o,
});

// ---------------------------------------------------------------- P4-02: TS ↔ Move agreement
test('passport vectors: committed Move vectors are byte-identical to a fresh TS render', async () => {
  assert.equal(readFileSync(VECTORS_PATH, 'utf8'), await renderMoveVectors(),
    'contracts-passport/tests/vectors.move is stale: run `node src/passport/onchain/vectors.ts --write`');
});

test('passport attestation: BCS layout is LANES.md §0, field by field', () => {
  const f = fields({ ns: 'ab', n_settled: 1, wins: 2, brier_bps: 3, gap_bps: 4, gap_negative: true, hidden: 5, badges: 6, issued_ms: 7, expires_ms: 8 });
  const b = Buffer.from(encodeAttestation(f));
  const u64 = (n: number) => { const x = Buffer.alloc(8); x.writeBigUInt64LE(BigInt(n)); return x; };
  const expected = Buffer.concat([
    Buffer.from('ab'.repeat(32), 'hex'),          // owner: address (32 bytes)
    Buffer.from([2]), Buffer.from('ab'),           // ns: ULEB128 length + UTF-8
    u64(1), u64(2), u64(3), u64(4),                // n_settled, wins, brier_bps, gap_bps
    Buffer.from([1]),                              // gap_negative: bool
    u64(5), u64(6), u64(7), u64(8),                // hidden, badges, issued_ms, expires_ms
  ]);
  assert.equal(b.toString('hex'), expected.toString('hex'));
  assert.deepEqual(decodeAttestation(b), f);
});

test('passport attestation: decoder rejects trailing bytes; encoder rejects bad fields', () => {
  const b = encodeAttestation(fields());
  assert.throws(() => decodeAttestation(new Uint8Array([...b, 0])), /trailing/);
  assert.throws(() => encodeAttestation(fields({ n_settled: -1 })), /non-negative integer/);
  assert.throws(() => encodeAttestation(fields({ brier_bps: 1.5 })), /non-negative integer/);
  assert.throws(() => encodeAttestation(fields({ owner: 'nope' })), /invalid owner/);
  assert.throws(() => encodeAttestation({ ...fields(), gap_negative: 'yes' as any }), /boolean/);
});

test('passport attestation: raw Ed25519 signature verifies; any tampering is caught', async () => {
  const kp = Ed25519Keypair.generate();
  const pk = Buffer.from(kp.getPublicKey().toRawBytes()).toString('hex');
  const r = await signAttestation(fields(), kp);
  assert.equal(r.pubkey_hex, pk);
  assert.equal(await attestationProblem(r, pk), null);
  // raw signature over the BCS bytes, not an intent-wrapped personal message
  assert.ok(await kp.getPublicKey().verify(Buffer.from(r.payload_b64, 'base64'), Buffer.from(r.sig_b64, 'base64')));
  const flipped = Buffer.from(r.payload_b64, 'base64'); flipped[40] ^= 1;
  assert.match((await attestationProblem({ ...r, payload_b64: flipped.toString('base64') }, pk))!, /does not verify/);
  assert.match((await attestationProblem({ ...r, fields: { ...r.fields, wins: 9 } }, pk))!, /fields.wins differs/);
  const other = Buffer.from(Ed25519Keypair.generate().getPublicKey().toRawBytes()).toString('hex');
  assert.match((await attestationProblem(r, other))!, /different attestor key/);
  const forged = await signAttestation(fields(), Ed25519Keypair.generate());
  assert.match((await attestationProblem({ ...forged, pubkey_hex: pk }, pk))!, /does not verify/);
});

test('passport attestation: the test-vector attestor is deterministic (fixed seed)', async () => {
  const a = await signAttestation(CASES.claim, TEST_ATTESTOR);
  const b = await signAttestation(CASES.claim, TEST_ATTESTOR);
  assert.equal(a.sig_b64, b.sig_b64);
  assert.equal(await attestationProblem(a, a.pubkey_hex), null);
});

test('passport attestation: keypairFrom accepts suiprivkey, hex and base64', () => {
  const seed = Buffer.alloc(32, 7);
  const kp = Ed25519Keypair.fromSecretKey(seed);
  const addr = kp.toSuiAddress();
  assert.equal(keypairFrom(kp.getSecretKey()).toSuiAddress(), addr);
  assert.equal(keypairFrom(seed.toString('hex')).toSuiAddress(), addr);
  assert.equal(keypairFrom('0x' + seed.toString('hex')).toSuiAddress(), addr);
  assert.equal(keypairFrom(seed.toString('base64')).toSuiAddress(), addr);
  assert.throws(() => keypairFrom('abcd'), /32 bytes/);
});

// ---------------------------------------------------------------- badges (shared bitmask)
test('passport badges: bits from real counts only, at the documented thresholds', () => {
  const none = { n: 0, brier_bps: null, losses: 0, hidden: 0, contrarian_wins: 0 };
  assert.equal(badgesFor(none), 0);
  assert.equal(badgesFor({ ...none, n: 10, brier_bps: 1999 }), BADGE.CALIBRATED);
  assert.equal(badgesFor({ ...none, n: 10, brier_bps: 2000 }), 0, 'Brier must be strictly under 2000');
  assert.equal(badgesFor({ ...none, n: 9, brier_bps: 1000 }), 0, 'needs n >= 10');
  assert.equal(badgesFor({ ...none, losses: 10 }), BADGE.HONEST_LOSER);
  assert.equal(badgesFor({ ...none, losses: 10, hidden: 1 }), 0, 'a hidden commit voids Honest Loser');
  assert.equal(badgesFor({ ...none, contrarian_wins: 5 }), BADGE.CONTRARIAN);
  assert.equal(badgesFor({ ...none, contrarian_wins: 4 }), 0);
  assert.equal(badgesFor({ ...none, council: true }), BADGE.COUNCIL_MEMBER);
  assert.equal(badgesFor({ ...none, assets_with_n3: 2 }), BADGE.MULTI_ASSET);
  assert.equal(badgesFor({ ...none, assets_with_n3: 1 }), 0);
  assert.deepEqual(badgeNames(1 | 4 | 16), ['Calibrated', 'Contrarian', 'Multi-asset']);
  assert.deepEqual(Object.values(BADGE), [1, 2, 4, 8, 16]);
});

// ---------------------------------------------------------------- mock attestation (numbers from memory)
const conv = (tx: string, p_mkt: number) => ({ type: 'CONVICTION', fields: { tx, p_you: '0.8', p_mkt: String(p_mkt), p_hlx: '0.6' }, text: '' });
const out = (tx: string, result: string) => ({ type: 'OUTCOME', fields: { tx, result }, text: '' });
const timeline = {
  overall: { n: 3, wins: 2, brier: { you: 0.2345, market: 0.25 }, gap_you: -0.0412 },
  commits: { onchain: 4, missing_memory: 1, settled: 3, wins: 2 },
  timeline: [conv('A', 0.4), out('A', 'WIN'), conv('B', 0.7), out('B', 'WIN'), conv('C', 0.3), out('C', 'LOSS')],
};

test('passport mock: stats come from the memory timeline and the commit ledger', () => {
  const s = statsFromTimeline(timeline, settledRows);
  assert.deepEqual(s, { n_settled: 3, wins: 2, brier_bps: 2345, gap_bps: 412, gap_negative: true, hidden: 1, badges: 0 });
  const council = statsFromTimeline(timeline, settledRows, [...COUNCIL_ADDRESSES][0]);
  assert.equal(council.badges, BADGE.COUNCIL_MEMBER);
});

test('passport mock: unscored is the worst Brier, never 0; an unreadable ledger is an error, never hidden=0', () => {
  const empty = { overall: { n: 0, wins: 0, brier: { you: null }, gap_you: null }, commits: { missing_memory: 0, settled: 0, wins: 0 }, timeline: [] };
  const s = statsFromTimeline(empty, settledRows);
  assert.equal(s.brier_bps, UNSCORED_BRIER_BPS);
  assert.equal(s.gap_bps, 0);
  assert.throws(() => statsFromTimeline({ ...timeline, commits: { error: 'tatum down' } }, settledRows), /cannot count hidden commits/);
});

test('passport mock: signed with the configured attestor, LANES.md §0 shape, short TTL', async () => {
  const kp = Ed25519Keypair.generate();
  __setAttestor(kp);
  try {
    const now = 1_794_000_000_000;
    const r = await mockAttestation('helix-v1-0123456789ab', OWNER, statsFromTimeline(timeline, settledRows), now);
    assert.deepEqual(Object.keys(r).sort(), ['fields', 'payload_b64', 'pubkey_hex', 'sig_b64']);
    assert.deepEqual(Object.keys(r.fields).sort(), ['badges', 'brier_bps', 'expires_ms', 'gap_bps', 'gap_negative', 'hidden', 'issued_ms', 'n_settled', 'ns', 'owner', 'wins']);
    assert.equal(r.fields.issued_ms, now);
    assert.equal(r.fields.expires_ms, now + ATTESTATION_TTL_MS);
    assert.equal(await attestationProblem(r, Buffer.from(kp.getPublicKey().toRawBytes()).toString('hex')), null);
    await assert.rejects(checkAttestation(r, 'helix-v1-other0000000', OWNER, r.pubkey_hex, now), /different namespace/);
    await assert.rejects(checkAttestation(r, r.fields.ns, '0x' + 'cd'.repeat(32), r.pubkey_hex, now), /different address/);
    await assert.rejects(checkAttestation(r, r.fields.ns, OWNER, r.pubkey_hex, r.fields.expires_ms), /expires too soon/);
    await assert.rejects(checkAttestation(r, r.fields.ns, OWNER, null, now), /attestor key/);
    await checkAttestation(r, r.fields.ns, OWNER, r.pubkey_hex, now);
  } finally { __setAttestor(null); }
});

// ---------------------------------------------------------------- transactions + sponsor predicate
const ATT = { payload_b64: Buffer.from(encodeAttestation(fields())).toString('base64'), sig_b64: Buffer.alloc(64, 1).toString('base64'), pubkey_hex: '', fields: fields() };
const PASSPORT_ID = '0x' + '5'.repeat(64);

test('passport tx: claim and refresh call the published package with the registry and Clock', () => {
  const c = buildClaimTx(OWNER, ATT).getData();
  const call = c.commands[0].MoveCall!;
  assert.equal(`${call.package}::${call.module}::${call.function}`, `${PASSPORT_PACKAGE}::passport::claim`);
  assert.equal(call.arguments.length, 4);
  assert.equal(c.sender, OWNER);
  const r = buildRefreshTx(OWNER, PASSPORT_ID, ATT, { sponsor: '0x' + '9'.repeat(64) }).getData();
  assert.equal(r.commands[0].MoveCall!.function, 'refresh');
  assert.equal(r.commands[0].MoveCall!.arguments.length, 5);
  assert.equal(r.gasData.owner, '0x' + '9'.repeat(64));
  assert.equal(Number(r.gasData.budget), PASSPORT_SPONSOR_GAS_BUDGET);
});

test('passport sponsor: only a lone claim/refresh on the HELIX registry within budget', async () => {
  assert.equal(isSponsorablePassportCall(buildClaimTx(OWNER, ATT, { sponsor: '0x' + '9'.repeat(64) }).getData()), null);
  assert.equal(isSponsorablePassportCall(buildRefreshTx(OWNER, PASSPORT_ID, ATT, { sponsor: '0x' + '9'.repeat(64) }).getData()), null);

  // built bytes (what /tx/execute sees): resolved shared-object inputs
  const tx = new Transaction();
  tx.setSender(OWNER); tx.setGasOwner('0x' + '9'.repeat(64)); tx.setGasBudget(PASSPORT_SPONSOR_GAS_BUDGET); tx.setGasPrice(1000);
  tx.setGasPayment([{ objectId: '0x' + '7'.repeat(64), version: '1', digest: '11111111111111111111111111111111' }]);
  tx.moveCall({
    target: `${PASSPORT_PACKAGE}::passport::claim`,
    arguments: [tx.object(Inputs.SharedObjectRef({ objectId: PASSPORT_REGISTRY, initialSharedVersion: 1, mutable: true })),
      tx.pure.vector('u8', [1, 2]), tx.pure.vector('u8', [3]), tx.object.clock()],
  });
  const built = Transaction.from(Buffer.from(await tx.build()).toString('base64')).getData();
  assert.equal(isSponsorablePassportCall(built), null);

  const over = buildClaimTx(OWNER, ATT, { sponsor: '0x' + '9'.repeat(64) }); over.setGasBudget(PASSPORT_SPONSOR_GAS_BUDGET + 1);
  assert.match(isSponsorablePassportCall(over.getData())!, /budget too high/);

  const smuggle = buildClaimTx(OWNER, ATT); smuggle.transferObjects([smuggle.gas], OWNER); smuggle.setGasBudget(1000);
  assert.match(isSponsorablePassportCall(smuggle.getData())!, /single passport::claim or passport::refresh/);

  const gate = new Transaction(); gate.setGasBudget(1000);
  gate.moveCall({ target: `${PASSPORT_PACKAGE}::gate_example::assert_calibrated`, arguments: [gate.object(PASSPORT_ID), gate.pure.u64(1), gate.pure.u64(1)] });
  assert.match(isSponsorablePassportCall(gate.getData())!, /only sponsors gas for helix_passport/);

  const foreign = new Transaction(); foreign.setGasBudget(1000);
  foreign.moveCall({ target: `0x${'4'.repeat(64)}::passport::claim`, arguments: [foreign.object(PASSPORT_REGISTRY), foreign.pure.vector('u8', [1]), foreign.pure.vector('u8', [1]), foreign.object.clock()] });
  assert.match(isSponsorablePassportCall(foreign.getData())!, /only sponsors gas for helix_passport/);

  const wrongReg = new Transaction(); wrongReg.setGasBudget(1000);
  wrongReg.moveCall({ target: `${PASSPORT_PACKAGE}::passport::claim`, arguments: [wrongReg.object('0x' + '3'.repeat(64)), wrongReg.pure.vector('u8', [1]), wrongReg.pure.vector('u8', [1]), wrongReg.object.clock()] });
  assert.match(isSponsorablePassportCall(wrongReg.getData())!, /not the HELIX passport registry/);

  assert.match(isSponsorablePassportCall({})!, /single passport/);
});

test('passport chain: Move aborts become sentences; GraphQL JSON parses', () => {
  const e = friendlyAbort(new Error(`Transaction resolution failed: MoveAbort in 1st command, abort code: 7, in '${PASSPORT_PACKAGE}::passport::claim' (instruction 37)`));
  assert.match(e.message, /already holds a passport/);
  assert.equal((e as any).code, 'EPASSPORT_7');
  assert.match(friendlyAbort(new Error(`MoveAbort in 1st command, abort code: 5, in '${PASSPORT_PACKAGE}::passport::refresh'`)).message, /anti-rollback/);
  assert.match(friendlyAbort(new Error('Unable to perform gas selection due to insufficient SUI balance')).message, /no testnet SUI for gas/);
  const other = new Error('object not found');
  assert.equal(friendlyAbort(other), other);
  const p = parsePassportJson('0x1', { owner: OWNER, ns: 'helix-v1-x', n_settled: '12', wins: '8', brier_bps: '1800', gap_bps: '350', gap_negative: false, hidden: '0', badges: '3', issued_ms: '1794000000000', version: '2' });
  assert.equal(p!.n_settled, 12); assert.equal(p!.issued_ms, 1794000000000); assert.equal(p!.version, 2);
  assert.equal(vecHex([1, 255]), '01ff');
  assert.equal(vecHex(Buffer.from('18a0e77777aa256a62417fa8b6debb559aaa1af1b0754a5252897a46b6116a6f', 'hex').toString('base64')), '18a0e77777aa256a62417fa8b6debb559aaa1af1b0754a5252897a46b6116a6f');
});

// ---------------------------------------------------------------- routes (flag)
function listen(server: ReturnType<typeof makeServer>): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}
const post = (port: number, path: string, body: unknown) =>
  fetch(`http://localhost:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('passport routes: 404 when FEATURE_ONCHAIN_PASSPORT is off', async () => {
  delete process.env.FEATURE_ONCHAIN_PASSPORT;
  const server = makeServer(); const port = await listen(server);
  try {
    assert.equal((await post(port, '/passport/helix-v1-0123456789ab/claim-tx', { owner: OWNER })).status, 404);
    assert.equal((await fetch(`http://localhost:${port}/passport/helix-v1-0123456789ab/onchain?owner=${OWNER}`)).status, 404);
  } finally { server.close(); }
});

test('passport routes: input validation when on (no network reached)', async () => {
  process.env.FEATURE_ONCHAIN_PASSPORT = '1';
  const server = makeServer(); const port = await listen(server);
  try {
    assert.equal((await post(port, '/passport/helix-v1-0123456789ab/claim-tx', { owner: 'nope' })).status, 400);
    assert.equal((await post(port, '/passport/BAD%20NS/claim-tx', { owner: OWNER })).status, 400);
    assert.equal((await post(port, '/passport/helix-v1-0123456789ab/refresh-tx', {})).status, 400);
    assert.equal((await fetch(`http://localhost:${port}/passport/helix-v1-0123456789ab/onchain`)).status, 400);
  } finally { server.close(); delete process.env.FEATURE_ONCHAIN_PASSPORT; }
});

// ---------------------------------------------------------------- P4-10 soulbound, at compile time
const SUI = [process.env.SUI_BIN, `${homedir()}/.local/bin/sui`].find((p) => p && existsSync(p));
test('passport soulbound: another package cannot transfer or wrap a ForecasterPassport (must not compile)', { skip: !SUI && 'sui CLI not installed', timeout: 300_000 }, () => {
  const dir = new URL('../../contracts-passport/negative/soulbound', import.meta.url).pathname;
  let outText = '';
  assert.throws(() => {
    try { execFileSync(SUI!, ['move', 'build'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e: any) { outText = `${e.stdout ?? ''}${e.stderr ?? ''}`; throw e; }
  });
  assert.match(outText, /'store' constraint not satis/, 'public_transfer / wrapping must fail for lack of `store`');
  assert.match(outText, /Invalid private transfer/, 'transfer::transfer is private to helix_passport::passport');
});
