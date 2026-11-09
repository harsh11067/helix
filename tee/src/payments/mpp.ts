// payments/mpp — P3 Credibility API, paid per call with the Machine Payments Protocol on Sui (NEXT_BIG.md §4).
//
// Free tier: GET /passport/:id (signed summary). Paid tier: GET /api/v1/credibility/:id?bucket=…
//   → 402 Payment Required (WWW-Authenticate: Payment … method="sui" intent="charge")
//   → the client pays on Sui (0x2::balance::send_funds to the HELIX treasury) and signs a personal-message
//     proof binding the digest to its address → retries with Authorization: Payment … → 200 + Payment-Receipt.
//
// We use @suimpp/mpp's own `suiCharge` method definition and mppx for the protocol, and re-implement ONLY
// its verify step so the chain read goes through Tatum (HELIX's single chokepoint) instead of the library's
// default public gRPC fullnode. The checks are the library's, unchanged (MIT, @suimpp/mpp 0.9.0 server.js):
// tx succeeded · payment of the currency to the recipient ≥ amount · proof signer == tx sender · digest unused.
// Replay protection survives restarts: every redeemed digest is also written as a PAYMENT memory.

import type { IncomingMessage } from 'node:http';
import { Method, Receipt } from 'mppx';
import { Mppx } from 'mppx/server';
import { suiCharge, USDC_TESTNET } from '@suimpp/mpp/server';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { suiClient } from '../shared/tatum.ts';
import { remember, recallAll } from '../memory/store.ts';
import { formatRecord, NS_PREFIX, str, num } from '../memory/format.ts';

export const PAYMENTS_NS = `${NS_PREFIX}-payments`;
export const enabled = () => process.env.FEATURE_PAYMENTS === '1';
const SUI = { type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI', decimals: 9 };
export const currency = () => (process.env.PAYMENT_CURRENCY === 'USDC_TESTNET' ? USDC_TESTNET : SUI);
export const currencyName = () => (process.env.PAYMENT_CURRENCY === 'USDC_TESTNET' ? 'USDC (Circle, testnet)' : 'SUI (testnet)');
export const price = () => process.env.PAYMENT_PRICE ?? (process.env.PAYMENT_CURRENCY === 'USDC_TESTNET' ? '0.01' : '0.001');
export const recipient = () => normalizeSuiAddress(process.env.PAYMENT_RECIPIENT ?? process.env.SUBMISSION_SUI_ADDRESS ?? process.env.DEMO_ADDRESS ?? '0x0');

// ---------------------------------------------------------------- digest store (replay protection)
const used = new Set<string>();
let seeded: Promise<void> | null = null;
export const paidCalls: { digest: string; payer: string; amount: string; ts: number }[] = [];
export async function seed(): Promise<void> {
  seeded ??= (async () => {
    const recs = await recallAll(PAYMENTS_NS).catch(() => []);
    for (const r of recs) {
      if (r.type !== 'PAYMENT') continue;
      const d = str(r, 'digest'); if (!d) continue;
      used.add(d);
      if (!paidCalls.some((p) => p.digest === d)) paidCalls.push({ digest: d, payer: str(r, 'payer') ?? '', amount: str(r, 'amount') ?? '', ts: num(r, 'ts') ?? 0 });
    }
  })();
  return seeded;
}
export const __resetPayments = () => { used.clear(); paidCalls.length = 0; seeded = Promise.resolve(); };
/** Un-redeem a digest whose paid response could not be produced, so the payer can retry with the same payment. */
export function releaseDigest(digest: string): void {
  used.delete(digest);
  const i = paidCalls.findIndex((p) => p.digest === digest);
  if (i >= 0) paidCalls.splice(i, 1);
}
/** The payment digest inside an `Authorization: Payment <base64url JSON>` header, if any. */
export function digestFromAuthorization(h: string | null | undefined): string | null {
  const m = /^Payment\s+(\S+)/i.exec(h ?? '');
  if (!m) return null;
  try { return JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))?.payload?.digest ?? null; } catch { return null; }
}

/** Proof message — byte-identical to @suimpp/mpp's createSuiPaymentProofMessage (not exported by the package). */
export function proofBytes(challenge: any, digest: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    domain: 'suimpp.sui.payment-proof', version: 1, method: challenge.method, intent: challenge.intent,
    challengeId: challenge.id, amount: challenge.request.amount, currency: challenge.request.currency,
    recipient: challenge.request.recipient, digest,
  }));
}
const toRaw = (amount: string, decimals: number) => {
  const [w = '0', f = ''] = amount.split('.');
  return BigInt(w + f.padEnd(decimals, '0').slice(0, decimals));
};

/** The library's verify checks, reading the transaction through Tatum. Throws → a fresh 402. */
export async function verifyPayment(credential: any, client: any = suiClient('testnet')): Promise<{ digest: string; payer: string; amount: string }> {
  const cur = currency(), to = recipient();
  const digest = String(credential.payload.digest);
  if (credential.challenge.request.currency !== cur.type) throw new Error(`Unsupported currency: ${credential.challenge.request.currency}`);
  await seed();
  if (used.has(digest)) throw new Error(`Digest already used: ${digest}. Each transaction pays for one call.`);
  const tx: any = await client.core.getTransaction({ digest, include: { balanceChanges: true, transaction: true } })
    .catch(() => { throw new Error(`Could not find the referenced transaction [${digest}]`); });
  const t = tx.Transaction ?? tx.FailedTransaction;
  if (!t?.status?.success) throw new Error('Transaction failed on-chain');
  const pay = (t.balanceChanges ?? []).find((bc: any) => normalizeSuiAddress(bc.coinType.split('::')[0]) + '::' + bc.coinType.split('::').slice(1).join('::') === cur.type
    && normalizeSuiAddress(bc.address) === to && BigInt(bc.amount) > 0n);
  if (!pay) throw new Error('Payment not found in transaction balance changes');
  if (BigInt(pay.amount) < toRaw(credential.challenge.request.amount, cur.decimals)) throw new Error('Transferred less than requested');
  const pk = await verifyPersonalMessageSignature(proofBytes(credential.challenge, digest), credential.payload.signature, { client })
    .catch((cause) => { throw new Error('Invalid payment proof signature', { cause }); });
  const sender = t.transaction?.sender;
  if (!sender || normalizeSuiAddress(pk.toSuiAddress()) !== normalizeSuiAddress(sender)) throw new Error('Payment proof signer does not match transaction sender');
  used.add(digest);
  const rec = { digest, payer: normalizeSuiAddress(sender), amount: String(pay.amount), ts: Math.floor(Date.now() / 1000) };
  paidCalls.push(rec);
  console.log(`[payments] verified ${digest} from ${rec.payer.slice(0, 10)}… (${rec.amount} raw ${cur.type.split('::').pop()}) via Tatum`);
  void remember(PAYMENTS_NS, formatRecord('PAYMENT', [['digest', digest], ['payer', rec.payer], ['amount', rec.amount], ['currency', cur.type.split('::').pop()], ['recipient', to], ['ts', rec.ts]]), { tx: digest, origin: 'payments' })
    .catch((e) => console.error('[payments] PAYMENT memory', (e as Error).message));
  return rec;
}

let mppx: any = null;
function server(): any {
  if (mppx) return mppx;
  const method = Method.toServer(suiCharge, {
    defaults: { currency: currency().type, recipient: recipient() },
    async verify({ credential }: any) {
      const r = await verifyPayment(credential);
      return Receipt.from({ method: 'sui', reference: r.digest, status: 'success', timestamp: new Date().toISOString() });
    },
  } as any);
  const secretKey = process.env.MPP_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('MPP_SECRET_KEY not configured');
  mppx = Mppx.create({ methods: [method], realm: 'helix-compiler.onrender.com', secretKey } as any);
  return mppx;
}

/** Runs one paid request through MPP. `handler` builds the paid JSON body once payment verified. */
export async function charge(req: IncomingMessage, url: URL, description: string, handler: () => Promise<unknown>): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request(`https://helix-compiler.onrender.com${url.pathname}${url.search}`, { method: 'GET', headers });
  const r = await server()['sui/charge']({ amount: price(), description })(request);
  let res: Response;
  if (r.status === 402) res = r.challenge;
  else {
    try { res = r.withReceipt(Response.json(await handler())); }
    catch (e) {
      // verified and paid, but the record couldn't be produced: release the digest so the same payment retries
      const d = digestFromAuthorization(headers.get('authorization'));
      if (d) releaseDigest(d);
      res = Response.json({ error: `payment verified but the record is unavailable right now (${(e as Error).message.slice(0, 120)}) — retry with the same payment`, digest: d }, { status: 503 });
    }
  }
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => { out[k] = v; });
  return { status: res.status, headers: out, body: await res.text() };
}

export function pricing() {
  return {
    protocol: 'MPP (Machine Payments Protocol) — https://mpp.dev', method: 'sui', intent: 'charge', package: '@suimpp/mpp 0.9.0 + mppx',
    price: price(), currency: currencyName(), coin_type: currency().type, recipient: recipient(),
    verification: 'on-chain via Tatum (HELIX\'s Sui chokepoint): success, amount ≥ price to the treasury, proof signer == sender, digest never reused',
    free: { 'GET /passport/:id': 'signed summary (n, wins, Brier, hidden, badges, every commit)' },
    paid: { 'GET /api/v1/credibility/:id?bucket=dir/conf/vol': 'per-setup detail: posterior, Brier per voice, lessons, reliability' },
  };
}
