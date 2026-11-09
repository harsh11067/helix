// Generates TOTAL_RECALL_EVIDENCE.md from LIVE data — nothing hand-typed:
//   • /health (both Tatum checkpoints, Walrus Memory health)
//   • every trading memory in tee/data/memory-ledger.json (run verify-ledger.mjs --rebuild first)
//   • L-01 vs L-02: the same conviction previewed for a fresh address vs. an address with history
//   node --env-file=../.env scripts/evidence.mjs --api https://helix-compiler.onrender.com --addr 0x… [--conv '{"direction":70,...}']
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const API = opt('api', 'https://helix-compiler.onrender.com').replace(/\/+$/, '');
const ADDR = opt('addr');
const conv = JSON.parse(opt('conv', '{"direction":70,"confidence":85,"horizonCode":1,"volView":70,"capital":5}'));
const FRESH = '0x0000000000000000000000000000000000000000000000000000000000000001';
const get = async (p) => (await fetch(API + p)).json();
const post = async (p, b) => (await fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();

const health = await get('/health');
const ledgerPath = new URL('../data/memory-ledger.json', import.meta.url);
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : [];
const trading = ledger.filter((e) => !['USER', 'SELFTEST'].includes(e.type));
const byType = trading.reduce((a, e) => ((a[e.type] = (a[e.type] ?? 0) + 1), a), {});
const pick = (r) => r && !r.error ? {
  order: r.predict?.order?.label, structure: r.predict?.order?.kind,
  memory: { n: r.memory?.n, message: r.memory?.message, commit: r.memory?.commit, suggested_commit: r.memory?.suggested_commit,
    structure_suggestion: r.memory?.structure_suggestion?.order?.label ?? null, lesson_text: r.memory?.lesson_text ?? null,
    gap_you: r.memory?.gap_you, best_voice: r.memory?.best_voice, blob_ids: r.memory?.blob_ids },
  guardian_memory: (r.guardian ?? []).find((g) => g.cls === 'memory')?.t ?? null,
} : r;
const before = pick(await post('/preview', { ...conv, address: FRESH }));
const after = ADDR ? pick(await post('/preview', { ...conv, address: ADDR })) : null;
const timeline = ADDR ? await get(`/memory/${ADDR}`) : null;

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
// Commit mode (RECOVERY.md R3/R4): every CONVICTION ↔ its on-chain commit ↔ its OUTCOME, from the live service
const tl = timeline?.timeline ?? [];
const commitConv = tl.filter((r) => r.type === 'CONVICTION' && r.fields?.mode === 'commit');
const outByTx = new Map(tl.filter((r) => r.type === 'OUTCOME').map((r) => [r.fields?.tx, r]));
const commitOut = commitConv.filter((c) => outByTx.has(c.fields?.tx));
const commitRows = commitConv.map((c, i) => {
  const o = outByTx.get(c.fields.tx), f = c.fields;
  return `| ${i + 1} | ${f.ts ? new Date(Number(f.ts) * 1000).toISOString().slice(0, 16).replace('T', ' ') : '—'} | ${esc(f.dir)}/${esc(f.conf)}/${esc(f.vol)} · ${esc(f.structure)} | [\`${f.tx.slice(0, 10)}…\`](https://suiscan.xyz/testnet/tx/${f.tx}) | \`${f.hash?.slice(0, 12)}…\` | \`${c.blob_id}\` | ${o ? `${o.fields.result} · ${o.fields.payoff} · reveal_ok=${o.fields.reveal_ok}` : 'pending'} | ${o ? '`' + o.blob_id + '`' : '—'} | ${esc(f.origin)} |`;
}).join('\n');
const rows = trading.map((e, i) => `| ${i + 1} | ${e.type} | \`${e.blob_id}\` | ${e.job_id ? '`' + e.job_id + '`' : '—'} | ${e.ts ? new Date(e.ts * 1000).toISOString().replace('.000Z', 'Z') : '—'} | ${e.tx ? `[\`${e.tx.slice(0, 10)}…\`](https://suiscan.xyz/testnet/tx/${e.tx})` : '—'} | ${e.origin ?? '—'} |`).join('\n');

const md = `# TOTAL_RECALL_EVIDENCE

Generated ${new Date().toISOString()} by \`tee/scripts/evidence.mjs\` from live endpoints — nothing in this file is hand-typed.
Service: ${API}

## 1. Tatum chokepoint + Walrus Memory health (\`GET /health\`)

\`\`\`json
${JSON.stringify({
  tatum_testnet_checkpoint: health.tatum_testnet_checkpoint, tatum_mainnet_checkpoint: health.tatum_mainnet_checkpoint,
  tatum: health.tatum && { plan: health.tatum.plan, testnet: health.tatum.testnet?.url, mainnet: health.tatum.mainnet?.url, requests: health.tatum.requests, retries: health.tatum.retries, recent_executions: health.tatum.recent_executions },
  memwal: health.memwal, memwal_detail: health.memwal_detail, memory_network: health.memory_network, watcher: health.watcher, predict: health.predict,
}, null, 2)}
\`\`\`

## 2. Memories on Walrus Mainnet — ${trading.length} trading memories

By type: ${Object.entries(byType).map(([k, v]) => `**${k}** ${v}`).join(' · ') || '—'}

Every row was written with \`rememberAndWait\` to the Walrus Memory mainnet relayer; \`tx\` is the Sui testnet transaction it describes (verify all with \`node scripts/verify-ledger.mjs\`). Registry bookkeeping memories (\`USER\`) are excluded from the count.

| # | type | blob id | job id | written | tx | origin |
|---|---|---|---|---|---|---|
${rows || '| — | — | — | — | — | — | — |'}

## 2b. Commit mode — on-chain commit–reveal (${commitConv.length} CONVICTION · ${commitOut.length} OUTCOME; target ≥30 / ≥20)

${timeline?.commits ? `On-chain ledger (\`ConvictionCommitted\` events by this address via Tatum, matched to memory by hash): \`${JSON.stringify(timeline.commits)}\`` : ''}

| # | committed (UTC) | conviction | commit tx | sha256 | CONVICTION blob | outcome | OUTCOME blob | origin |
|---|---|---|---|---|---|---|---|---|
${commitRows || '| — | — | — | — | — | — | — | — | — |'}

## 3. Memory visibly changes the product (L-01 vs L-02)

Same conviction \`${JSON.stringify(conv)}\` compiled against the live market for a fresh address vs. ${ADDR ? '`' + ADDR.slice(0, 10) + '…`' : '(no address given)'}:

**Without history** (\`${FRESH.slice(0, 10)}…\`):
\`\`\`json
${JSON.stringify(before, null, 2)}
\`\`\`

**With history**:
\`\`\`json
${JSON.stringify(after, null, 2)}
\`\`\`

${timeline ? `## 4. Calibration for ${'`' + timeline.namespace + '`'}

\`\`\`json
${JSON.stringify({ overall: timeline.overall, buckets: timeline.buckets, reliability: timeline.reliability, reasons: timeline.reasons }, null, 2)}
\`\`\`
` : ''}`;
writeFileSync(new URL('../../TOTAL_RECALL_EVIDENCE.md', import.meta.url), md);
console.log(`wrote TOTAL_RECALL_EVIDENCE.md · ${trading.length} memories · ${ADDR ? 'with' : 'without'} before/after`);
