// Forecaster Passport (NEXT_BIG.md §3, LANES.md §0): signed JSON, BCS attestation, badges, card.
//   OFFLINE=1 node --test test/passport.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Ed25519Keypair, Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { canonicalJson, signJson, verifyJson, signAttestation, AttestationBcs, badgeMask, badgeNames, __setAttestationKey, pubkeyHex } from '../src/passport/offchain/attest.ts';
import { passportCardSVG } from '../src/passport/offchain/card.ts';

const KEY = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
const OWNER = '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';

test('canonical JSON is stable regardless of key order, at every depth', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }), canonicalJson({ a: { c: null, d: [3, { y: 2, z: 1 }] }, b: 1 }));
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('signed passport JSON verifies with the published key; one changed byte fails', async () => {
  __setAttestationKey(KEY);
  const passport = { address: OWNER, n_settled: 14, wins: 5, brier: 0.466, hidden: 0, commits: [{ digest: 'x', status: 'settled' }] };
  const sig = await signJson(passport);
  assert.equal(sig.pubkey_hex, pubkeyHex());
  assert.ok(await verifyJson(passport, sig.sig_b64, sig.pubkey_hex));
  assert.ok(await verifyJson({ ...passport, commits: [{ status: 'settled', digest: 'x' }] }, sig.sig_b64, sig.pubkey_hex), 'key order does not matter');
  assert.ok(!(await verifyJson({ ...passport, hidden: 1 }, sig.sig_b64, sig.pubkey_hex)), 'tampered passport fails');
  assert.ok(!(await verifyJson(passport, sig.sig_b64, Buffer.from(Ed25519Keypair.generate().getPublicKey().toRawBytes()).toString('hex'))), 'wrong key fails');
  __setAttestationKey(null);
});

test('BCS attestation: LANES.md §0 layout, raw Ed25519 over the payload bytes', async () => {
  __setAttestationKey(KEY);
  const fields = { owner: OWNER, ns: 'helix-v1-4d922636976d', n_settled: 14, wins: 5, brier_bps: 4660, gap_bps: 5063, gap_negative: false, hidden: 0, badges: 0, issued_ms: 1794236000000, expires_ms: 1794236900000 };
  const a = await signAttestation(fields);
  const payload = Buffer.from(a.payload_b64, 'base64');
  const back: any = AttestationBcs.parse(payload);
  assert.equal(back.owner, OWNER); assert.equal(back.ns, fields.ns); assert.equal(String(back.brier_bps), '4660'); assert.equal(back.gap_negative, false);
  // 32 owner + (1 + 21) ns + 8 u64 (n_settled, wins, brier_bps, gap_bps, hidden, badges, issued_ms, expires_ms) + 1 bool
  assert.equal(payload.length, 32 + 1 + fields.ns.length + 8 * 8 + 1);
  const pk = new Ed25519PublicKey(Buffer.from(a.pubkey_hex, 'hex'));
  assert.ok(await pk.verify(payload, Buffer.from(a.sig_b64, 'base64')));
  payload[40] ^= 1;
  assert.ok(!(await pk.verify(payload, Buffer.from(a.sig_b64, 'base64'))), 'tampered payload fails');
  __setAttestationKey(null);
});

test('badges come from data only, with their thresholds', () => {
  const base = { n: 0, brier: null as number | null, losses: 0, hidden: 0, contrarianWins: 0, councilMember: false, assetsWith3: 0 };
  assert.equal(badgeMask(base), 0);
  assert.equal(badgeMask({ ...base, n: 10, brier: 0.19 }), 1);
  assert.equal(badgeMask({ ...base, n: 9, brier: 0.1 }), 0, 'Calibrated needs n ≥ 10');
  assert.equal(badgeMask({ ...base, losses: 10, hidden: 0 }), 2);
  assert.equal(badgeMask({ ...base, losses: 10, hidden: 1 }), 0, 'Honest Loser needs hidden 0');
  assert.equal(badgeMask({ ...base, contrarianWins: 5, councilMember: true, assetsWith3: 2 }), 4 | 8 | 16);
  assert.deepEqual(badgeNames(1 | 8), ['Calibrated', 'Council Member']);
});

test('passport card: real numbers, escaped text, "—" when nothing is measured yet', () => {
  const svg = passportCardSVG({ kind: 'agent', agent: 'surface', namespace: 'helix-v1-abc', address: OWNER, n_settled: 7, wins: 2, brier: 0.56, gap_you: 0.51, hidden: 0, committed: 7, shown: 7, badge_names: [], latest_lesson: { text: 'Size <down> & wait' }, issued_ms: 1794236000000 });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok(svg.includes('Council agent · surface') && svg.includes('>0.56<') && svg.includes('+51 pts'));
  assert.ok(svg.includes('Size &lt;down&gt; &amp; wait'));
  const empty = passportCardSVG({ kind: 'forecaster', namespace: 'n', address: OWNER, n_settled: 0, wins: 0, brier: null, gap_you: null, hidden: 0 });
  assert.ok(!/>0\.\d\d</.test(empty), 'no Brier drawn with n = 0');
});
