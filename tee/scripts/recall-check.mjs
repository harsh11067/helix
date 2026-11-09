// M-04 — persistence beyond the service process: a FRESH process recalls a user's
// HELIX memories straight from Walrus Memory (mainnet relayer) with the SDK.
//   node --env-file=../.env scripts/recall-check.mjs <address> ["query text"]
import { MemWal } from '@mysten-incubation/memwal';
import { createHash } from 'node:crypto';

const [address, query = 'BTC conviction outcome calibration'] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{64}$/.test(address ?? '')) { console.error('usage: recall-check.mjs <0x address> [query]'); process.exit(2); }
const prefix = process.env.MEMWAL_NAMESPACE_PREFIX ?? 'helix-v1';
const namespace = `${prefix}-${createHash('sha256').update(address.toLowerCase()).digest('hex').slice(0, 12)}`;

const m = MemWal.create({
  key: process.env.MEMWAL_PRIVATE_KEY, accountId: process.env.MEMWAL_ACCOUNT_ID,
  serverUrl: process.env.MEMWAL_RELAYER_URL ?? 'https://relayer.memory.walrus.xyz', namespace,
});
const t0 = Date.now();
const r = await m.recall({ query, limit: 20, namespace });
console.log(`namespace ${namespace} · ${r.results.length} hit(s) for "${query}" in ${Date.now() - t0}ms (pid ${process.pid})`);
for (const h of r.results) console.log(`  ${h.blob_id}  d=${h.distance.toFixed(3)}  ${h.created_at ?? ''}\n    ${h.text}`);
process.exit(r.results.length ? 0 : 1);
