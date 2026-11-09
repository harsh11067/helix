// M-12 / H-01 — every memory traces to a real transaction, and every blob is on
// Walrus MAINNET. Reads tee/data/memory-ledger.json (or --rebuild <address...> to
// regenerate it from Walrus Memory itself, the source of truth), then:
//   • checks each tx digest on Sui testnet through Tatum GraphQL (status SUCCESS)
//   • fetches each blob from the Walrus mainnet aggregator (bytes present)
//   node --env-file=../.env scripts/verify-ledger.mjs [--rebuild 0xaddr ...] [--skip-blobs]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MemWal } from '@mysten-incubation/memwal';

const LEDGER = new URL('../data/memory-ledger.json', import.meta.url);
const TATUM = (process.env.TATUM_SUI_TESTNET ?? 'https://sui-testnet.gateway.tatum.io').replace(/\/+$/, '') + '/graphql';
const AGG = process.env.WALRUS_MAINNET_AGGREGATOR ?? 'https://aggregator.walrus-mainnet.walrus.space';
const args = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : [];

if (args[0] === '--rebuild') {
  const addrs = args.slice(1).filter((a) => /^0x[0-9a-fA-F]{64}$/.test(a));
  const m = MemWal.create({ key: process.env.MEMWAL_PRIVATE_KEY, accountId: process.env.MEMWAL_ACCOUNT_ID, serverUrl: process.env.MEMWAL_RELAYER_URL ?? 'https://relayer.memory.walrus.xyz' });
  const rebuilt = [];
  for (const a of addrs) {
    const ns = `${process.env.MEMWAL_NAMESPACE_PREFIX ?? 'helix-v1'}-${createHash('sha256').update(a.toLowerCase()).digest('hex').slice(0, 12)}`;
    const seen = new Set();
    for (const q of ['CONVICTION v1 BTC', 'OUTCOME v1 result', 'CALIBRATION v1 bucket', 'LESSON v1 text', 'REASON v1', 'VETTING v1']) {
      const r = await m.recall({ query: q, limit: 100, namespace: ns });
      for (const h of r.results) {
        if (seen.has(h.blob_id)) continue; seen.add(h.blob_id);
        const type = /^([A-Z]+) v\d/.exec(h.text)?.[1] ?? 'UNKNOWN';
        const tx = /\btx=([1-9A-HJ-NP-Za-km-z]{32,44})\b/.exec(h.text)?.[1] ?? null;
        const prev = ledger.find((e) => e.blob_id === h.blob_id);
        rebuilt.push({ type, namespace: ns, blob_id: h.blob_id, job_id: prev?.job_id ?? null, tx, ts: Math.floor(Date.parse(h.created_at ?? '') / 1000) || prev?.ts || null, origin: prev?.origin ?? null, text: h.text, network: 'walrus-mainnet' });
      }
    }
  }
  rebuilt.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  ledger = rebuilt;
  mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`rebuilt ledger from Walrus Memory: ${ledger.length} memories`);
}

const trading = ledger.filter((e) => e.type !== 'USER' && e.type !== 'SELFTEST');
const digests = [...new Set(trading.map((e) => e.tx).filter(Boolean))];
const txStatus = {};
for (const d of digests) {
  const headers = { 'content-type': 'application/json' };
  if (process.env.TATUM_API_KEY) headers['x-api-key'] = process.env.TATUM_API_KEY.trim();
  const r = await fetch(TATUM, { method: 'POST', headers, body: JSON.stringify({ query: 'query($d: String!) { transaction(digest: $d) { effects { status timestamp } } }', variables: { d } }) });
  const j = await r.json();
  txStatus[d] = j.data?.transaction?.effects?.status ?? 'MISSING';
  await sleep(350);   // Tatum free plan: 3 req/s
}
const blobOk = {};
if (!args.includes('--skip-blobs')) {
  for (const e of trading) {
    try { const r = await fetch(`${AGG}/v1/blobs/${e.blob_id}`); blobOk[e.blob_id] = r.ok ? (await r.arrayBuffer()).byteLength : 0; }
    catch { blobOk[e.blob_id] = 0; }
  }
}
const byType = {};
for (const e of trading) byType[e.type] = (byType[e.type] ?? 0) + 1;
let bad = 0;
for (const e of trading) {
  const st = e.tx ? txStatus[e.tx] : 'NO_TX';
  const blob = args.includes('--skip-blobs') ? '' : blobOk[e.blob_id] ? ` blob ${blobOk[e.blob_id]}B` : ' blob MISSING';
  if ((e.tx && st !== 'SUCCESS') || (!e.tx) || (!args.includes('--skip-blobs') && !blobOk[e.blob_id])) bad++;
  console.log(`${e.type.padEnd(11)} ${e.blob_id}  tx ${e.tx ?? '—'} ${st}${blob}`);
}
console.log(`\n${trading.length} trading memories (${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(', ')}) · ${digests.length} distinct tx · ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
