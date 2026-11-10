// Snapshot every HELIX record the live service has recalled (blob id + exact text) into
// tee/mirror/memory-mirror.json, merged with the previous snapshot (union by blob id), so a restart
// never loses a memory that Walrus Memory's top-k search happens not to return this time.
//   node scripts/memory-mirror.mjs [--api URL] [--rounds N]
// Reads only public API data (GET /memory/:address already serves these texts). Writes nothing remote.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const API = opt('api', 'https://helix-compiler.onrender.com').replace(/\/+$/, '');
const ROUNDS = Number(opt('rounds', 1));
const FILE = new URL('../mirror/memory-mirror.json', import.meta.url);
let prev = { namespaces: {} };
try { prev = JSON.parse(readFileSync(FILE, 'utf8')); } catch {}
const get = async (p) => { const r = await fetch(API + p, { signal: AbortSignal.timeout(120_000) }); if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`); return r.json(); };

const council = await get('/council').catch(() => ({ agents: [] }));
const demo = (await get('/demo').catch(() => null))?.address ?? '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
const addresses = [demo, ...(council.agents ?? []).map((a) => a.address)].filter(Boolean);
const out = { ...prev.namespaces };
for (let round = 0; round < ROUNDS; round++) {
  for (const a of addresses) {
    const t = await get(`/memory/${a}`).catch((e) => { console.warn(a.slice(0, 10), e.message); return null; });
    if (!t?.namespace) continue;
    const by = new Map((out[t.namespace] ?? []).map((e) => [e.blob_id, e]));
    const before = by.size;
    for (const r of t.timeline ?? []) if (r.blob_id && typeof r.text === 'string') by.set(r.blob_id, { blob_id: r.blob_id, created_at: r.created_at, text: r.text });
    out[t.namespace] = [...by.values()].sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
    console.log(`${t.namespace}: ${by.size} records (+${by.size - before}) · server recalled ${t.recall?.recalled}/${t.recall?.listed} listed`);
  }
}
mkdirSync(new URL('../mirror/', import.meta.url), { recursive: true });
writeFileSync(FILE, JSON.stringify({ saved_at: new Date().toISOString(), source: API, namespaces: out }, null, 0) + '\n');
console.log('wrote', FILE.pathname);
