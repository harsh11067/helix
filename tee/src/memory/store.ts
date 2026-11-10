// store — Walrus Memory (MemWal) on MAINNET, via the hosted relayer.
//
// Walrus Memory is the source of truth. Every read the product makes about a
// user's history (timeline, calibration, the compile's memory block) is a fresh
// `recall` from the relayer; the local ledger is only an evidence log of what this
// process wrote (blob id, job id, tx digest) and can be regenerated from recall.
//
// OFFLINE=1 (tests) swaps in the SDK's in-memory MemWalMock — no key, no network.

import { MemWal, MemWalMock, delegateKeyToPublicKey } from '@mysten-incubation/memwal';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecord, type MemRecord, type RecordType, REGISTRY_NS, formatRecord, namespaceFor, str } from './format.ts';

const offline = () => process.env.OFFLINE === '1';
const RELAYER = process.env.MEMWAL_RELAYER_URL ?? process.env.MEMWAL_SERVER_URL ?? 'https://relayer.memory.walrus.xyz';

let client: any = null;
export function memwalConfigured(): boolean {
  return !!(process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID);
}
export function mode(): 'mock' | 'mainnet' | 'unconfigured' {
  if (offline()) return 'mock';
  return memwalConfigured() ? 'mainnet' : 'unconfigured';
}
export function memwal(): any {
  if (client) return client;
  if (offline()) {
    client = MemWalMock.create({ namespace: REGISTRY_NS });
  } else {
    if (!memwalConfigured()) throw new Error('Walrus Memory not configured (MEMWAL_PRIVATE_KEY / MEMWAL_ACCOUNT_ID)');
    client = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY!.trim(),
      accountId: process.env.MEMWAL_ACCOUNT_ID!.trim(),
      serverUrl: RELAYER,
      namespace: REGISTRY_NS,
    });
  }
  return client;
}
export function __resetMemwal(c: any = null): void { client = c; timelineCache.clear(); parsedByNs.clear(); }

/** The delegate PUBLIC key (= MEMWAL_AGENT_ID on the submission form). Never the private key. */
export async function agentPublicKey(): Promise<string | null> {
  try {
    if (!process.env.MEMWAL_PRIVATE_KEY) return null;
    const pk: any = await delegateKeyToPublicKey(process.env.MEMWAL_PRIVATE_KEY.trim());
    return typeof pk === 'string' ? pk.replace(/^0x/, '') : Buffer.from(pk).toString('hex');
  } catch { return null; }
}

export async function memwalHealth(): Promise<{ status: string; mode: string; agentMatches?: boolean }> {
  const m = mode();
  if (m === 'unconfigured') return { status: 'unconfigured', mode: m };
  try {
    const h = await memwal().health();
    const ok = h?.status === 'ok' || h?.ok === true || m === 'mock';
    let agentMatches: boolean | undefined;
    if (m === 'mainnet' && process.env.MEMWAL_AGENT_ID) {
      const pk = await agentPublicKey();
      agentMatches = !!pk && pk.toLowerCase() === process.env.MEMWAL_AGENT_ID.trim().replace(/^0x/, '').toLowerCase();
    }
    return { status: ok ? 'ok' : 'degraded', mode: m, agentMatches };
  } catch (e) {
    return { status: `error: ${(e as Error).message.slice(0, 120)}`, mode: m };
  }
}

// ---------------------------------------------------------------- ledger (evidence log)
const LEDGER = process.env.MEMORY_LEDGER_PATH
  ?? fileURLToPath(new URL('../../data/memory-ledger.json', import.meta.url));
export interface LedgerEntry {
  type: RecordType; namespace: string; blob_id: string; job_id: string | null;
  tx: string | null; ts: number; origin: string | null; text: string; network: 'walrus-mainnet' | 'mock';
}
export function readLedger(): LedgerEntry[] {
  try { return existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : []; } catch { return []; }
}
function appendLedger(e: LedgerEntry): void {
  if (offline() && !process.env.MEMORY_LEDGER_PATH) return;   // tests never touch the real ledger
  const all = readLedger();
  all.push(e);
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(all, null, 2) + '\n');
}

// ---------------------------------------------------------------- write
/**
 * rememberAndWait one record into a namespace and log it. `dedupe` makes identical
 * (namespace, text) writes resolve to the existing blob, so two watchers (or a retry)
 * can never mint a duplicate memory for the same fact.
 */
// Budget guard (NEXT_BIG.md §1.5): at most MEMORY_WRITES_PER_HOUR relayer writes per rolling hour.
// A write over budget WAITS for a slot (logged) — it is never dropped.
const writesAt: number[] = [];
export const writeStats = { waited: 0, maxPerHour: Number(process.env.MEMORY_WRITES_PER_HOUR ?? 150) };
export async function writeBudget(now = () => Date.now()): Promise<void> {
  for (;;) {
    const t = now();
    while (writesAt.length && t - writesAt[0] > 3_600_000) writesAt.shift();
    if (writesAt.length < writeStats.maxPerHour) { writesAt.push(t); return; }
    writeStats.waited++;
    const wait = Math.min(60_000, 3_600_000 - (t - writesAt[0]) + 50);
    console.warn(`[memory] write budget ${writeStats.maxPerHour}/h reached — waiting ${Math.round(wait / 1000)}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
}
export const writesLastHour = () => { const t = Date.now(); return writesAt.filter((x) => t - x <= 3_600_000).length; };

export async function remember(namespace: string, text: string, meta: { tx?: string | null; origin?: string | null } = {}):
  Promise<{ blob_id: string; job_id: string | null }> {
  const rec = parseRecord(text);
  if (!rec) throw new Error('refusing to write a non-HELIX record');
  await writeBudget();
  const r = await memwal().rememberAndWait(text, namespace, { timeoutMs: 120_000, dedupe: true });
  const out = { blob_id: String(r.blob_id), job_id: r.job_id ? String(r.job_id) : (r.id ? String(r.id) : null) };
  appendLedger({
    type: rec.type, namespace, blob_id: out.blob_id, job_id: out.job_id, tx: meta.tx ?? null,
    ts: Math.floor(Date.now() / 1000), origin: meta.origin ?? null, text, network: offline() ? 'mock' : 'walrus-mainnet',
  });
  // we already know this memory's text: put it straight into the parsed cache (no recall round needed)
  const have = parsedByNs.get(namespace) ?? parsedByNs.set(namespace, new Map()).get(namespace)!;
  have.set(out.blob_id, parseRecord(text, { blob_id: out.blob_id, created_at: new Date().toISOString() }));
  // readers see their own write at once; marked stale so the next read also refreshes from the relayer
  if (timelineCache.has(namespace)) timelineCache.set(namespace, { at: Date.now() - TIMELINE_FRESH_MS, recs: sortedRecs(have) });
  console.log(`[memory] ${rec.type} → ${namespace} blob=${out.blob_id} job=${out.job_id}${meta.tx ? ' tx=' + meta.tx : ''}`);
  return out;
}

// ---------------------------------------------------------------- read
const QUERIES = [
  'CONVICTION v1 BTC conviction dir conf vol structure p_you p_mkt p_hlx',
  'OUTCOME v1 result WIN LOSS payoff settle_px',
  'CALIBRATION v1 bucket n wins posterior brier',
  'LESSON v1 bucket text',
  'REASON v1 category facts',
  'VETTING v1 agent decision',
];
const timelineCache = new Map<string, { at: number; recs: MemRecord[] }>();

/** Blob ids the relayer holds for a namespace (paged listMemories; the authoritative count). */
async function listedBlobIds(namespace: string): Promise<Set<string> | null> {
  const m: any = memwal();
  if (typeof m.listMemories !== 'function') return null;           // MemWalMock / older SDKs
  const ids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 40; page++) {
    const p = await m.listMemories({ cursor, limit: 500, namespace });
    for (const x of p.memories ?? []) if (x.namespace_id === namespace && x.blob_id) ids.add(String(x.blob_id));
    if (!p.has_more || !p.next_cursor) break;
    cursor = p.next_cursor;
  }
  return ids;
}

/** How much of the namespace the last recall actually returned (memory is only as honest as it is complete). */
export const recallCoverage = new Map<string, { listed: number | null; recalled: number; at: number; complete: boolean }>();
/** True once a recall has searched for everything listed in the namespace (what is left, if anything, can't be
 *  found by any query), i.e. a commit with no recalled memory really has none. False while a recall is still
 *  catching up (cut off by its time budget) or when the listing itself failed. */
export const recallComplete = (namespace: string): boolean => recallCoverage.get(namespace)?.complete === true;

/**
 * Every HELIX record in a namespace, from Walrus Memory.
 * The relayer Seal-decrypts every result of a recall and times out (~13s) past ~120 at once, so recall is
 * INCREMENTAL: listMemories gives the authoritative blob set; only blobs not already parsed are fetched,
 * with typed queries capped at RECALL_CHUNK results each, until everything listed is covered or the time
 * budget is spent (the rest continues on the next call; coverage is reported, never hidden).
 */
const RECALL_CHUNK = 50;
const RECALL_BUDGET_MS = 25_000;
const RECALL_QUERIES = [
  ...QUERIES, 'COUNCIL v1 weights n brier', 'PAYMENT v1 digest payer amount', 'USER v1 ns registry',
  // diversifiers: similar records compete inside a capped recall, so slice large namespaces several ways
  'CONVICTION v1 mode=commit dir=up conf=0.85 vol=choppy', 'CONVICTION v1 mode=commit dir=down conf=0.35 vol=calm',
  'CONVICTION v1 origin=agent directional side=up', 'CONVICTION v1 origin=browser bracketed_range',
  'OUTCOME v1 result=WIN reveal_ok=true', 'OUTCOME v1 result=LOSS reveal_ok=true',
  'CALIBRATION v1 bucket=up/high/choppy', 'CALIBRATION v1 bucket=down/low/calm', 'CALIBRATION v1 bucket=up/low/calm',
];
const parsedByNs = new Map<string, Map<string, MemRecord | null>>();   // blob_id → record (null = not HELIX)
// blobs no capped query has returned (e.g. facts the relayer's analyze stored): retried every 10 min, not every call
const unfindable = new Map<string, { blobs: Set<string>; at: number }>();
const inflight = new Map<string, Promise<MemRecord[]>>();

const TIMELINE_FRESH_MS = 10_000, TIMELINE_MAX_STALE_MS = 5 * 60_000;
export async function recallAll(namespace: string, opts: { fresh?: boolean } = {}): Promise<MemRecord[]> {
  const hit = timelineCache.get(namespace);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (!opts.fresh && age < TIMELINE_FRESH_MS) return hit!.recs;
  let running = inflight.get(namespace);
  if (!running) {
    running = recallIncremental(namespace).finally(() => inflight.delete(namespace));
    inflight.set(namespace, running);
  }
  // stale-while-revalidate: a compile or page never waits on the relayer for a timeline it read minutes ago;
  // one background recall refreshes it (writes made here are already in the cache, see remember()).
  // The watcher and anything that must see the latest outcome pass { fresh: true }.
  if (!opts.fresh && age < TIMELINE_MAX_STALE_MS) { running.catch(() => {}); return hit!.recs; }
  return running;
}
const sortedRecs = (have: Map<string, MemRecord | null>) => [...have.values()].filter((r): r is MemRecord => !!r)
  .sort((a, b) => (Number(a.f.ts ?? 0) - Number(b.f.ts ?? 0)) || a.type.localeCompare(b.type));

async function recallIncremental(namespace: string): Promise<MemRecord[]> {
  const t0 = Date.now();
  // never let a stalled listMemories hold the shared in-flight recall (and every request for this namespace) hostage
  const listed = await Promise.race([
    listedBlobIds(namespace).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
  ]);
  const have = parsedByNs.get(namespace) ?? new Map<string, MemRecord | null>();
  if (listed) for (const b of [...have.keys()]) if (!listed.has(b)) have.delete(b);       // deleted upstream
  const skip = unfindable.get(namespace);
  const skipSet = skip && Date.now() - skip.at < 10 * 60_000 ? skip.blobs : new Set<string>();
  const missing = () => (listed ? [...listed].filter((b) => !have.has(b) && !skipSet.has(b)).length : Infinity);
  let idle = 0, budgetHit = false;
  for (const q of listed ? RECALL_QUERIES : QUERIES) {
    if (missing() === 0 || idle >= 3) break;
    if (Date.now() - t0 > RECALL_BUDGET_MS) { budgetHit = true; break; }
    const before = have.size;
    let res: any;
    try { res = await memwal().recall({ query: q, limit: listed ? Math.min(RECALL_CHUNK, missing() + 20) : 100, namespace }); }
    catch (e) {
      if (/not found|no memories|empty/i.test((e as Error).message)) continue;
      if (have.size) { console.warn(`[memory] recall chunk failed for ${namespace}: ${(e as Error).message.slice(0, 120)}`); continue; }
      throw e;
    }
    for (const h of res?.results ?? []) {
      if (!h.blob_id || have.has(h.blob_id)) continue;
      have.set(h.blob_id, parseRecord(h.text, { blob_id: h.blob_id, created_at: h.created_at }));
    }
    idle = have.size > before ? 0 : idle + 1;
  }
  parsedByNs.set(namespace, have);
  if (listed) {
    const still = [...listed].filter((b) => !have.has(b));
    // only blobs that were actually searched for are "unfindable" — not ones the time budget never reached
    if (still.length && !skipSet.size && !budgetHit) unfindable.set(namespace, { blobs: new Set(still), at: Date.now() });
    else if (!still.length) unfindable.delete(namespace);
  }
  const recalled = listed ? [...listed].filter((b) => have.has(b)).length : have.size;
  if (listed && recalled < listed.size) console.warn(`[memory] recall covered ${recalled}/${listed.size} blobs in ${namespace} (continues next call)`);
  const supportsList = typeof (memwal() as any).listMemories === 'function';
  const complete = !supportsList || (!!listed && (recalled >= listed.size || !budgetHit));
  recallCoverage.set(namespace, { listed: listed?.size ?? null, recalled, at: Date.now(), complete });
  const recs = sortedRecs(have);
  timelineCache.set(namespace, { at: Date.now(), recs });
  return recs;
}

/**
 * Exact lookup of one record by commit digest. Recall is semantic top-k search, so past ~200 records some
 * memories never rank in any query's top results and the incremental recall can't reach them. A query
 * carrying the exact digest ranks that record first (verified live), so commits whose memory wasn't
 * recalled are looked up one by one before anything is called hidden. Misses are cached for 10 minutes.
 */
const lookupMiss = new Map<string, number>();
export async function findRecord(namespace: string, type: 'CONVICTION' | 'OUTCOME', tx: string): Promise<MemRecord | null> {
  const key = `${namespace}|${type}|${tx}`, miss = lookupMiss.get(key);
  if (miss && Date.now() - miss < 10 * 60_000) return null;
  const res: any = await memwal().recall({ query: `${type} v1 | tx=${tx}`, limit: 3, namespace });
  for (const h of res?.results ?? []) {
    const r = h?.blob_id ? parseRecord(h.text, { blob_id: h.blob_id, created_at: h.created_at }) : null;
    if (!r || r.type !== type || (str(r, 'tx') !== tx && str(r, 'commit_tx') !== tx)) continue;
    const have = parsedByNs.get(namespace) ?? parsedByNs.set(namespace, new Map()).get(namespace)!;
    have.set(h.blob_id, r);
    const hit = timelineCache.get(namespace);
    if (hit) timelineCache.set(namespace, { at: hit.at, recs: sortedRecs(have) });
    lookupMiss.delete(key);
    return r;
  }
  lookupMiss.set(key, Date.now());
  return null;
}

/** Warm the parsed-record cache for namespaces judges are likely to open first (after a restart). */
export async function warmNamespaces(namespaces: string[]): Promise<void> {
  for (const ns of namespaces) {
    for (let k = 0; k < 4; k++) {
      await recallAll(ns, { fresh: true }).catch(() => []);
      const c = recallCoverage.get(ns);
      if (!c || c.listed == null || c.recalled >= c.listed) break;
    }
  }
}

export async function recallForAddress(address: string, opts: { fresh?: boolean } = {}) {
  return recallAll(namespaceFor(address), opts);
}

// ---------------------------------------------------------------- registry
/** Namespaces are hashed, so the watcher learns which ones exist from a registry namespace. */
export async function registerNamespace(ns: string): Promise<void> {
  const known = await registeredNamespaces();
  if (known.includes(ns)) return;
  await remember(REGISTRY_NS, formatRecord('USER', [['ns', ns], ['ts', Math.floor(Date.now() / 1000)]]), { origin: 'registry' });
}
export async function registeredNamespaces(): Promise<string[]> {
  let res: any;
  const listed = await listedBlobIds(REGISTRY_NS).catch(() => null);
  try { res = await memwal().recall({ query: 'USER v1 ns registry', limit: Math.max(100, (listed?.size ?? 0) + 20), namespace: REGISTRY_NS }); }
  catch { return []; }
  const out = new Set<string>();
  for (const h of res?.results ?? []) {
    const r = parseRecord(h.text);
    const ns = str(r ?? undefined, 'ns');
    if (r?.type === 'USER' && ns) out.add(ns);
  }
  return [...out];
}
