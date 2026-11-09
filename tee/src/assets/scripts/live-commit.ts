// live-commit — test3.md P5-02/03: commit an ETH or SUI conviction from a fresh test key through a LOCAL
// server's HTTP API (same calls as the browser), then resolve it after expiry and print the OUTCOME.
//
//   (cd tee && WATCHER=0 FEATURE_ASSETS=1 COMPILER_PORT=8091 node --env-file=../.env src/compiler/server.ts)
//   node --env-file=../.env src/assets/scripts/live-commit.ts --keyfile <path> --asset SUI --dir up      # commit
//   node --env-file=../.env src/assets/scripts/live-commit.ts --keyfile <path> --resolve <digest>         # after expiry
//
// The test key is funded with 0.012 SUI from LANE_B_DEPLOYER when it has less than 0.006 SUI, then pays its
// own gas. WATCHER=0: no second watcher; this script resolves only its own conviction (/memory/resolve/:digest).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { suiClient, gql, recordExecution } from '../../shared/tatum.ts';
import { keypairFrom } from '../../passport/onchain/attestation.ts';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const C = opt('server') ?? 'http://localhost:8091';
const keyfile = opt('keyfile');
if (!keyfile) throw new Error('--keyfile required');
if (!existsSync(keyfile)) writeFileSync(keyfile, Ed25519Keypair.generate().getSecretKey() + '\n', { mode: 0o600 });
const T = keypairFrom(readFileSync(keyfile, 'utf8'));
const addr = T.toSuiAddress();
const client: any = suiClient('testnet');
const unwrap = (r: any) => r?.Transaction ?? r?.FailedTransaction ?? r?.transaction ?? r;

async function api(path: string, body?: unknown) {
  const r = await fetch(C + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${j.error ?? ''}`);
  return j;
}
async function balance(a: string): Promise<bigint> {
  const r: any = await gql('testnet', `query($a:SuiAddress!){ address(address:$a){ balance(coinType:"0x2::sui::SUI"){ totalBalance } } }`, { a });
  return BigInt(r.data?.address?.balance?.totalBalance ?? 0);
}

if (opt('resolve')) {
  const digest = opt('resolve')!;
  const r = await api(`/memory/resolve/${digest}`, { address: addr });
  console.log('resolve:', JSON.stringify(r));
  const t = await api(`/memory/${addr}`);
  for (const e of t.timeline.filter((x: any) => x.fields?.tx === digest)) console.log(e.type, e.blob_id, '\n  ', e.text);
  process.exit(0);
}

// ---- fund the test key (LANE_B_DEPLOYER), only if needed
if ((await balance(addr)) < 6_000_000n) {
  const dep = keypairFrom(process.env.LANE_B_DEPLOYER!);
  const tx = new Transaction(); tx.setSender(dep.toSuiAddress());
  const [c] = tx.splitCoins(tx.gas, [tx.pure.u64(12_000_000)]); tx.transferObjects([c], addr);
  const bytes = await tx.build({ client });
  const sim = unwrap(await client.simulateTransaction({ transaction: bytes, include: { effects: true } }));
  if (!sim?.effects?.status?.success) throw new Error('fund simulate failed ' + JSON.stringify(sim?.effects?.status));
  const r = unwrap(await client.executeTransaction({ transaction: bytes, signatures: [(await dep.signTransaction(bytes)).signature], include: { effects: true } }));
  recordExecution('testnet', r.digest);
  await client.waitForTransaction({ digest: r.digest, timeout: 60_000 });
  console.log('funded', addr, 'with 0.012 SUI, tx', r.digest);
}

// ---- compile → commit → sign → execute (browser path)
const asset = (opt('asset') ?? 'SUI').toUpperCase();
const dir = opt('dir') === 'down' ? -60 : 60;
const comp = await api('/assets/compile', { asset, direction: dir, confidence: Number(opt('conf') ?? 55), horizonCode: 0, volView: 40, capital: 5, address: addr });
console.log('compile:', JSON.stringify({ call: comp.call, window: comp.window, price: comp.price, voices: { you: comp.voices.you, market: comp.voices.market, helix: comp.voices.helix, crowd: comp.voices.crowd }, bucket: comp.memory.bucket }));
const c = await api('/tx/commit', { address: addr, compileId: comp.compileId, commit: 5, origin: 'cli' });
const bytes = Uint8Array.from(Buffer.from(c.txBytes, 'base64'));
const { signature } = await T.signTransaction(bytes);
const ex = await api('/tx/execute', { txBytes: c.txBytes, signatures: [signature], commitId: c.commitId });
console.log('commit:', JSON.stringify({ digest: ex.digest, success: ex.success, committed: ex.committed, hash: c.hash, expiry: new Date(c.market.expiryMs).toISOString(), sponsored: c.sponsored }));
for (let i = 0; i < 18; i++) {
  await new Promise((r) => setTimeout(r, 10_000));
  const t = await api(`/memory/${addr}`).catch(() => null);
  const m = t?.timeline?.find((x: any) => x.type === 'CONVICTION' && x.fields?.tx === ex.digest);
  if (m) { console.log('CONVICTION memory', m.blob_id, '\n  ', m.text); break; }
}
console.log(`resolve after ${new Date(c.market.expiryMs + 60_000).toISOString()}: --resolve ${ex.digest}`);
