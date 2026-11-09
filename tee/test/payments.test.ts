// P3 paid Credibility API: the MPP verify checks (library-equivalent) reading the chain through a client we inject.
//   OFFLINE=1 node --test test/payments.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { verifyPayment, proofBytes, __resetPayments, currency } from '../src/payments/mpp.ts';

process.env.PAYMENT_RECIPIENT = '0x' + '29'.repeat(32);
const payer = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(3));
const other = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(4));
const challenge = (amount = '0.001') => ({ id: 'ch1', method: 'sui', intent: 'charge', request: { amount, currency: currency().type, recipient: process.env.PAYMENT_RECIPIENT } });
const stubClient = (o: { amount?: string; to?: string; ok?: boolean; sender?: string } = {}) => ({
  core: { getTransaction: async () => ({ Transaction: {
    status: { success: o.ok ?? true }, transaction: { sender: o.sender ?? payer.toSuiAddress() },
    balanceChanges: [{ coinType: '0x2::sui::SUI', address: o.to ?? process.env.PAYMENT_RECIPIENT, amount: o.amount ?? '1000000' }],
  } }) },
});
async function cred(signer = payer, digest = 'D' + Math.random().toString(36).slice(2), ch = challenge()) {
  const { signature } = await signer.signPersonalMessage(proofBytes(ch, digest));
  return { challenge: ch, payload: { digest, signature } };
}

test('a valid payment verifies once; the same digest is rejected afterwards (replay)', async () => {
  __resetPayments();
  const c = await cred();
  const r = await verifyPayment(c, stubClient());
  assert.equal(r.payer, payer.toSuiAddress());
  await assert.rejects(verifyPayment(c, stubClient()), /already used/);
});

test('underpaid, wrong recipient, failed tx and wrong currency are rejected', async () => {
  __resetPayments();
  await assert.rejects(verifyPayment(await cred(), stubClient({ amount: '999999' })), /less than requested/);
  await assert.rejects(verifyPayment(await cred(), stubClient({ to: '0x' + '11'.repeat(32) })), /Payment not found/);
  await assert.rejects(verifyPayment(await cred(), stubClient({ ok: false })), /failed on-chain/);
  const c = await cred(); c.challenge.request.currency = '0xa1ec::usdc::USDC';
  await assert.rejects(verifyPayment(c, stubClient()), /Unsupported currency/);
});

test('a proof signed by anyone other than the paying sender is rejected (grief protection)', async () => {
  __resetPayments();
  await assert.rejects(verifyPayment(await cred(other), stubClient()), /does not match transaction sender/);
});

test('proof message is byte-identical to @suimpp/mpp createSuiPaymentProofMessage', () => {
  const ch = challenge();
  const expected = JSON.stringify({ domain: 'suimpp.sui.payment-proof', version: 1, method: 'sui', intent: 'charge', challengeId: 'ch1', amount: '0.001', currency: ch.request.currency, recipient: ch.request.recipient, digest: 'X' });
  assert.equal(new TextDecoder().decode(proofBytes(ch, 'X')), expected);
});

test('a payment whose response failed can be retried with the same digest', async () => {
  const { releaseDigest, digestFromAuthorization } = await import('../src/payments/mpp.ts');
  __resetPayments();
  const c = await cred();
  await verifyPayment(c, stubClient());
  releaseDigest(c.payload.digest);
  await verifyPayment(c, stubClient());   // not "already used"
  const hdr = 'Payment ' + Buffer.from(JSON.stringify({ challenge: {}, payload: { digest: 'Abc' } })).toString('base64url');
  assert.equal(digestFromAuthorization(hdr), 'Abc');
  assert.equal(digestFromAuthorization('Bearer x'), null);
});

test('allocator admits only calibrated forecasters with enough history', async () => {
  const { decide } = await import('../src/council/allocator.ts');
  assert.equal(decide({ n: 26, brier: { you: 0.41 } }).admit, false);
  assert.match(decide({ n: 26, brier: { you: 0.41 } }).reason, /not calibrated enough/);
  assert.equal(decide({ n: 7, brier: { you: 0.1 } }).admit, false, 'needs n ≥ 8');
  assert.equal(decide({ n: 8, brier: { you: 0.22 } }).admit, true, 'boundary inclusive');
  assert.equal(decide(null).admit, false);
});
