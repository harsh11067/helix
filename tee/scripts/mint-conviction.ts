// mint-conviction — operator CLI that places a REAL conviction through the same HELIX
// server path the browser uses: /compile → /tx/mint → sign locally → /tx/execute
// (executed via Tatum) → CONVICTION memory written server-side, tagged origin=cli.
//
//   node --env-file=../.env scripts/mint-conviction.ts --dir 60 --conf 80 --vol 70 --horizon 1 --commit 3
//   node --env-file=../.env scripts/mint-conviction.ts --fund 20          # deposit into the Predict account
//   node --env-file=../.env scripts/mint-conviction.ts --selftest-exec    # 1-MIST self-transfer through /tx/execute
//   flags: --api <url> (default http://localhost:8081), --accept-memory (take memory's commit/structure)
//
// The signing key never leaves this machine; the server only ever sees signed bytes.

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from '../src/shared/tatum.ts';

const args = process.argv.slice(2);
const flag = (k: string) => args.includes(`--${k}`);
const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const API = opt('api', process.env.HELIX_API ?? 'http://localhost:8081')!.replace(/\/+$/, '');

function keypair(): Ed25519Keypair {
  const sk = process.env.SUI_DEPLOYER_PRIVATE_KEY?.trim();
  if (!sk) throw new Error('SUI_DEPLOYER_PRIVATE_KEY missing (use --env-file=../.env)');
  const d: any = decodeSuiPrivateKey(sk);
  const scheme = d.scheme ?? d.schema;
  if (scheme !== 'ED25519') throw new Error(`unsupported key scheme ${scheme}`);
  const secretKey = d.secretKey;
  return Ed25519Keypair.fromSecretKey(secretKey);
}

async function post(path: string, body: unknown): Promise<any> {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${j.error ?? JSON.stringify(j).slice(0, 300)}`);
  return j;
}
const get = async (path: string) => (await fetch(API + path)).json();

async function signAndExecute(kp: Ed25519Keypair, txBytes: string, extra: Record<string, unknown> = {}) {
  const { signature } = await kp.signTransaction(Uint8Array.from(Buffer.from(txBytes, 'base64')));
  return post('/tx/execute', { txBytes, signatures: [signature], ...extra });
}

const kp = keypair();
const address = kp.toSuiAddress();
console.log(`operator ${address.slice(0, 8)}…${address.slice(-4)} → ${API}`);

if (flag('selftest-exec')) {
  // proves the execution path (server → Tatum executeTransaction) without spending USDC
  const tx = new Transaction();
  const [c] = tx.splitCoins(tx.gas, [1]);
  tx.transferObjects([c], address);
  tx.setSender(address);
  const bytes = await tx.build({ client: suiClient('testnet') });
  const out = await signAndExecute(kp, Buffer.from(bytes).toString('base64'));
  console.log('selftest', JSON.stringify(out));
  process.exit(out.success ? 0 : 1);
}

const acct = await get(`/predict/account/${address}`);
console.log(`predict account ${acct.exists ? 'exists' : 'not created'} · balance ${acct.balance} · wallet ${acct.walletQuoteBalance} test-USDC`);

if (opt('fund')) {
  const amount = Number(opt('fund'));
  const f = await post('/tx/fund', { address, amount });
  const out = await signAndExecute(kp, f.txBytes);
  console.log(`fund ${amount} → ${out.success ? 'OK' : 'FAILED ' + out.error} digest=${out.digest}`);
  process.exit(out.success ? 0 : 1);
}

const conv = {
  address,
  direction: Number(opt('dir', '60')), confidence: Number(opt('conf', '70')),
  horizonCode: Number(opt('horizon', '1')), volView: Number(opt('vol', '50')), capital: Number(opt('commit', '3')),
};
const c = await post('/compile', conv);
const o = c.predict.order;
console.log(`compiled: ${o.kind} · ${o.label} · p_mkt ${o.pMkt.toFixed(3)} · resolves in ${c.predict.market.minutesLeft.toFixed(1)} min`);
console.log(`voices: you ${c.voices.you.toFixed(2)} · market ${c.voices.market.toFixed(2)} · helix ${c.voices.helix.toFixed(2)} · crowd ${c.voices.crowd ?? c.voices.crowd_detail?.status}`);
console.log(`memory: n=${c.memory.n} · ${c.memory.message} · suggests ${c.memory.suggested_commit} (you set ${conv.capital})`);
const accept = flag('accept-memory');
const commit = accept ? c.memory.suggested_commit : conv.capital;
const m = await post('/tx/mint', {
  address, compileId: c.compileId, commit, origin: 'cli',
  useMemoryStructure: accept && !!c.memory.structure_suggestion,
});
console.log(`plan: pay ${m.plan.totalDebit} (fee ${m.plan.orderFee}) → payout ${m.plan.potentialPayout} if it wins · entry ${(m.plan.entryProbability * 100).toFixed(1)}¢`);
const out = await signAndExecute(kp, m.txBytes, { mintId: m.mintId });
console.log(`mint ${out.success ? 'OK' : 'FAILED ' + out.error} digest=${out.digest} record=${out.recordId} via ${out.executedVia}`);
if (!out.success) process.exit(1);
console.log(`explorer: https://suiscan.xyz/testnet/tx/${out.digest}`);
// the server waits for the keeper's fill, then writes the CONVICTION memory (~20–40s)
for (let i = 0; i < 18; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const t = await get(`/memory/${address}`);
  const hit = (t.timeline ?? []).find((r: any) => r.type === 'CONVICTION' && r.fields?.tx === out.digest);
  if (hit) { console.log(`CONVICTION memory on Walrus mainnet: blob ${hit.blob_id} (fill=${hit.fields.fill})`); process.exit(0); }
}
console.log('memory not visible yet — check GET /memory/<address> shortly');
