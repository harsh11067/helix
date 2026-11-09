// P3-04 — an agent pays for a forecaster's detailed credibility record with MPP on Sui:
//   402 → pay (0x2::balance::send_funds via Tatum) → sign proof → retry → 200 + Payment-Receipt.
//   node --env-file=../.env scripts/pay-credibility.mjs <address|namespace> [--bucket up/high/choppy] [--api URL] [--key ENV_NAME]
import { Mppx } from 'mppx/client';
import { sui } from '@suimpp/mpp/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { suiClient, recordExecution } from '../src/shared/tatum.ts';
import { currency } from '../src/payments/mpp.ts';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const id = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) ?? 'helix-v1-4d922636976d';
const API = opt('api', 'https://helix-compiler.onrender.com').replace(/\/+$/, '');
const kp = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(process.env[opt('key', 'PAYER_AGENT_KEY')].trim()).secretKey);
const client = suiClient('testnet');

const mppx = Mppx.create({
  polyfill: false,
  methods: [sui({
    client, signer: kp, currency: currency(),
    // execute through Tatum (HELIX's chokepoint) and wait, so the server sees the payment when we retry
    execute: async (tx) => {
      const bytes = await tx.build({ client });
      const { signature } = await kp.signTransaction(bytes);
      const res = await client.executeTransaction({ transaction: bytes, signatures: [signature], include: { effects: true } });
      const t = res.Transaction ?? res.FailedTransaction ?? res;
      recordExecution('testnet', t.digest);
      if (!t.effects?.status?.success) throw new Error(t.effects?.status?.error ?? 'payment failed');
      await client.waitForTransaction({ digest: t.digest, timeout: 60_000 });
      console.log(`paid: ${t.digest} (https://suiscan.xyz/testnet/tx/${t.digest})`);
      return { digest: t.digest };
    },
  })],
});

const url = `${API}/api/v1/credibility/${encodeURIComponent(id)}${opt('bucket') ? '?bucket=' + encodeURIComponent(opt('bucket')) : ''}`;
const first = await fetch(url);
console.log(`unpaid → HTTP ${first.status} · ${first.headers.get('www-authenticate')?.slice(0, 140) ?? ''}`);
const res = await mppx.fetch(url);
const text = await res.text();
let body = {}; try { body = JSON.parse(text); } catch {}
if (res.status !== 200) console.log('body:', text.slice(0, 400));
console.log(`paid → HTTP ${res.status} · receipt ${res.headers.get('payment-receipt') ? 'present' : 'missing'}`);
console.log(JSON.stringify({ owner: body.owner, bucket: body.bucket, overall_n: body.overall?.n, buckets: body.buckets?.length, lessons: body.lessons?.length }));
process.exit(res.status === 200 ? 0 : 1);
