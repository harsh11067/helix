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
export function __resetMemwal(c: any = null): void { client = c; timelineCache.clear(); }

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
export async function remember(namespace: string, text: string, meta: { tx?: string | null; origin?: string | null } = {}):
  Promise<{ blob_id: string; job_id: string | null }> {
  const rec = parseRecord(text);
  if (!rec) throw new Error('refusing to write a non-HELIX record');
  const r = await memwal().rememberAndWait(text, namespace, { timeoutMs: 120_000, dedupe: true });
  const out = { blob_id: String(r.blob_id), job_id: r.job_id ? String(r.job_id) : (r.id ? String(r.id) : null) };
  appendLedger({
    type: rec.type, namespace, blob_id: out.blob_id, job_id: out.job_id, tx: meta.tx ?? null,
    ts: Math.floor(Date.now() / 1000), origin: meta.origin ?? null, text, network: offline() ? 'mock' : 'walrus-mainnet',
  });
  timelineCache.delete(namespace);
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
export const recallCoverage = new Map<string, { listed: number | null; recalled: number; at: number }>();

/**
 * Every HELIX record in a namespace, fresh from Walrus Memory (10s cache).
 * Recall is a vector search capped by `limit`, so it is sized from listMemories and checked against it:
 * if a single sweep misses blobs, the typed queries run too, and any remaining gap is reported.
 */
export async function recallAll(namespace: string, opts: { fresh?: boolean } = {}): Promise<MemRecord[]> {
  const hit = timelineCache.get(namespace);
  if (!opts.fresh && hit && Date.now() - hit.at < 10_000) return hit.recs;
  const listed = await listedBlobIds(namespace).catch(() => null);
  const limit = Math.max(100, (listed?.size ?? 0) + 20);
  const seen = new Map<string, MemRecord>();
  let unparsed = 0;
  for (const q of QUERIES) {
    let res: any;
    try { res = await memwal().recall({ query: q, limit, namespace }); }
    catch (e) {
      if (/not found|no memories|empty/i.test((e as Error).message)) continue;
      throw e;
    }
    for (const h of res?.results ?? []) {
      if (!h.blob_id || seen.has(h.blob_id)) continue;
      const r = parseRecord(h.text, { blob_id: h.blob_id, created_at: h.created_at });
      if (r) seen.set(h.blob_id, r); else unparsed++;
    }
    if (listed && seen.size + unparsed >= listed.size) break;       // complete: no need for more sweeps
  }
  if (listed && seen.size + unparsed < listed.size) console.warn(`[memory] recall covered ${seen.size + unparsed}/${listed.size} blobs in ${namespace}`);
  recallCoverage.set(namespace, { listed: listed?.size ?? null, recalled: seen.size + unparsed, at: Date.now() });
  const recs = [...seen.values()].sort((a, b) => (Number(a.f.ts ?? 0) - Number(b.f.ts ?? 0)) || a.type.localeCompare(b.type));
  timelineCache.set(namespace, { at: Date.now(), recs });
  return recs;
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
