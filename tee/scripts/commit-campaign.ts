// commit-campaign — RECOVERY.md R4: scripted, varied commit-mode convictions from the operator key,
// through the SAME server path the browser uses:
//   /compile → /tx/commit → sign locally → /tx/execute (Tatum) → /memory/conviction (verified, written to Walrus mainnet)
// Every conviction is tagged origin=cli. The signing key never leaves this machine.
//
//   node --env-file=../.env scripts/commit-campaign.ts --once                     # one commit, then exit
//   node --env-file=../.env scripts/commit-campaign.ts --every 15 --until "2026-11-10T22:00:00+05:30"
//   flags: --api <url> (default $HELIX_API or http://localhost:8081), --past-expiry-check (J-04 dry run),
//          --no-focus (rotate the grid only; default alternates with one focus bucket)

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { suiClient } from '../src/shared/tatum.ts';
import { commitTx } from '../src/memory/commit.ts';

const args = process.argv.slice(2);
const flag = (k: string) => args.includes(`--${k}`);
const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const API = opt('api', process.env.HELIX_API ?? 'http://localhost:8081')!.replace(/\/+$/, '');
const EVERY_MIN = Number(opt('every', '15'));
const UNTIL = Date.parse(opt('until', '2026-11-10T22:00:00+05:30')!);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(0, 19), ...a);

const d: any = decodeSuiPrivateKey(String(process.env.CAMPAIGN_SUI_KEY ?? process.env.SUI_DEPLOYER_PRIVATE_KEY ?? '').trim());
const kp = Ed25519Keypair.fromSecretKey(d.secretKey);
const address = kp.toSuiAddress();

async function call(path: string, body?: unknown, timeoutMs = 120_000): Promise<any> {
  const r = await fetch(API + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${j.error ?? JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// bull/bear × calm/choppy × low/high confidence, horizons spread over the 5–20 min windows
const GRID = [
  { direction: 70, volView: 30, confidence: 35 }, { direction: -70, volView: 70, confidence: 80 },
  { direction: 55, volView: 75, confidence: 80 }, { direction: -55, volView: 25, confidence: 35 },
  { direction: 80, volView: 30, confidence: 85 }, { direction: -80, volView: 70, confidence: 30 },
  { direction: 45, volView: 70, confidence: 30 }, { direction: -45, volView: 30, confidence: 85 },
];

// Every other commit lands in one focus bucket (up/high/choppy) so memory reaches n ≥ 3 there within
// ~an hour — the point where lessons, Kelly suggestions and the dividend switch on. The rest rotate the grid.
const FOCUS = { direction: 70, volView: 75, confidence: 85 };
const pick = (i: number) => (flag('no-focus') ? GRID[i % GRID.length] : i % 2 === 0 ? FOCUS : GRID[((i - 1) / 2) % GRID.length]);

async function once(i: number): Promise<string> {
  const g = pick(i);
  const conv = { address, ...g, horizonCode: 1 + (i % 3), capital: [3, 5, 8][i % 3] };
  const c = await call('/compile', conv);
  const o = c.predict.order;
  const cm = await call('/tx/commit', { address, compileId: c.compileId, commit: conv.capital, origin: 'cli', useMemoryStructure: false });
  const { signature } = await kp.signTransaction(Uint8Array.from(Buffer.from(cm.txBytes, 'base64')));
  const ex = await call('/tx/execute', { txBytes: cm.txBytes, signatures: [signature] });
  if (!ex.success) throw new Error(`commit tx failed: ${ex.error}`);
  const mem = await call('/memory/conviction', { address, text: cm.text, digest: ex.digest, origin: 'cli' }, 180_000);
  log(`#${i} ${o.kind} ${o.label} · conf ${g.confidence} · ${c.predict.market.minutesLeft.toFixed(1)}m · commit ${ex.digest} → blob ${mem.blob_id}`);
  return ex.digest;
}

/** J-04: a commit whose expiry is already past must abort on-chain (simulated, no gas spent). */
async function pastExpiryCheck() {
  const tx = commitTx(address, 'ab'.repeat(32), '0x' + '1'.repeat(64), Date.now() - 60_000);
  const client: any = suiClient('testnet');
  try {
    await tx.build({ client });   // resolution dry-runs the call; a past expiry must abort here
    log('past-expiry commit → UNEXPECTEDLY RESOLVED');
    return false;
  } catch (e: any) {
    const msg = String(e?.executionError?.message ?? e?.message ?? e);
    log('past-expiry commit → rejected on-chain:', msg);
    return /MoveAbort/.test(msg) && /journal::commit/.test(msg) && /abort code: 0\b/.test(msg);   // 0 = EExpiryNotInFuture
  }
}

log(`operator ${address} → ${API}`);
if (flag('past-expiry-check')) process.exit((await pastExpiryCheck()) ? 0 : 1);

let i = Number(opt('start', String(Math.floor(Date.now() / 60_000) % GRID.length)));
for (;;) {
  try { await once(i); } catch (e) { log(`#${i} failed: ${(e as Error).message}`); }
  i++;
  if (flag('once') || Date.now() + EVERY_MIN * 60_000 > UNTIL) break;
  // keep the (free-tier) server awake between commits so its settlement watcher keeps resolving
  for (let t = 0; t < EVERY_MIN; t += 5) {
    await new Promise((r) => setTimeout(r, Math.min(5, EVERY_MIN - t) * 60_000));
    fetch(API + '/healthz').catch(() => {});
  }
}
log('campaign finished');
