// tatum — the SINGLE chokepoint for every Sui read and write HELIX makes.
//
// Sui retired JSON-RPC on public fullnodes in 2026 and Tatum's Sui gateway now
// serves GraphQL (`/graphql`) and gRPC. Tatum's gRPC is plain gRPC (not grpc-web),
// so a fetch-based client can't use it; GraphQL is the transport for everything:
// the browser proxy (/graphql), the Predict SDK, the settlement watcher, the
// indexer, and transaction execution.
//
// The free Tatum plan allows 3 req/s per key (`x-ttm-plan: free;ratelimit=3`),
// so requests are serialized through one queue spaced to stay under that, with
// jittered exponential backoff on 429/5xx and a short cache for read queries.
// The API key is server-side only and never reaches the browser.

import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { opOf, recordCall, recordCacheHit } from './tatumUsage.ts';

export type Net = 'testnet' | 'mainnet';

const gqlUrl = (base: string) => (base.endsWith('/graphql') ? base : base.replace(/\/+$/, '') + '/graphql');
export const TATUM_URLS: Record<Net, string> = {
  testnet: gqlUrl(process.env.TATUM_SUI_TESTNET ?? 'https://sui-testnet.gateway.tatum.io'),
  mainnet: gqlUrl(process.env.TATUM_SUI_MAINNET ?? 'https://sui-mainnet.gateway.tatum.io'),
};

const RPS = Math.max(1, Number(process.env.TATUM_RPS ?? 3));
const MIN_GAP_MS = Math.ceil(1000 / RPS) + 15;     // stay just under the plan's rate
const MAX_ATTEMPTS = 5;
const CACHE_MS = 2000;

export interface TatumStats {
  requests: number; retries: number; rateLimited: number; errors: number;
  executed: { net: Net; digest: string; at: number }[];
  plan: string | null;                       // x-ttm-plan header, proof the key is in use
  lastLatencyMs: Record<Net, number | null>;
}
export const stats: TatumStats = {
  requests: 0, retries: 0, rateLimited: 0, errors: 0, executed: [], plan: null,
  lastLatencyMs: { testnet: null, mainnet: null },
};

// Injectable transport (tests replace it to simulate 429 → 200 without network).
type Fetch = typeof fetch;
let transport: Fetch = (...a) => fetch(...a);
export function __setTatumTransport(f: Fetch | null): void { transport = f ?? ((...a) => fetch(...a)); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- degrade mode (FINAL_PUSH T0.5): Tatum refused the key (auth or quota). Reads fall back to the
// last cached answer, writes pause, and the UI says so. Never a silent switch to a public fullnode.
export interface Degraded { since: number; status: number; message: string }
let degraded: Degraded | null = null;
export const tatumDegraded = (): Degraded | null => degraded;
const QUOTA_STATUS = new Set([401, 402, 403]);
export class TatumPausedError extends Error {}
/** test hook */
export function __setDegraded(d: Degraded | null): void { degraded = d; }

// One global FIFO queue: the rate limit is per key, across both networks.
let chain: Promise<unknown> = Promise.resolve();
let lastStart = 0;
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
  });
  chain = run.catch(() => {});
  return run.then(job);
}

const cache = new Map<string, { at: number; status: number; body: string; headers: [string, string][] }>();
const isWrite = (body: string) => /\bmutation\b/.test(body) && /executeTransaction/i.test(body);
const isCacheable = (body: string) =>
  !/\bmutation\b/.test(body) && !/simulateTransaction|executeTransaction|dryRun/i.test(body);

function apiKey(): string | undefined {
  const k = process.env.TATUM_API_KEY?.trim();
  return k ? k : undefined;
}
export const tatumConfigured = () => !!apiKey();

/**
 * fetch-compatible function bound to Tatum: adds the key, queues to respect the
 * rate limit, retries 429/5xx with jittered backoff, and caches read queries for 2s.
 * Passed as `fetch` to SuiGraphQLClient, so every SDK call goes through here.
 */
export function tatumFetch(net: Net): Fetch {
  return (async (input: any, init: any = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const body = typeof init.body === 'string' ? init.body : '';
    const key = `${net}|${body}`;
    if (body && isCacheable(body)) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) { recordCacheHit(); return new Response(hit.body, { status: hit.status, headers: hit.headers }); }
    }
    if (degraded && isWrite(body)) throw new TatumPausedError('Live chain writes paused: Tatum refused the request (quota or key). Showing cached data.');
    const op = body ? opOf(body) : 'unknown';
    const headers = new Headers(init.headers);
    const k = apiKey();
    if (k) headers.set('x-api-key', k);
    headers.set('content-type', 'application/json');

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        stats.retries++;
        await sleep(Math.min(4000, 250 * 2 ** (attempt - 1)) + Math.random() * 200);
      }
      try {
        const t0 = Date.now();
        const res = await enqueue(() => transport(url, { ...init, headers }));
        stats.requests++;
        stats.lastLatencyMs[net] = Date.now() - t0;
        recordCall(net, op, Date.now() - t0, res.status);
        const plan = res.headers.get('x-ttm-plan');
        if (plan) stats.plan = plan;
        if (QUOTA_STATUS.has(res.status)) {
          const msg = (await res.text().catch(() => '')).slice(0, 200);
          if (!degraded) console.error(`[tatum] ${net} HTTP ${res.status}: entering degrade mode (${msg})`);
          degraded = { since: degraded?.since ?? Date.now(), status: res.status, message: msg };
          const stale = body && isCacheable(body) ? cache.get(key) : undefined;
          if (stale) { recordCacheHit(); return new Response(stale.body, { status: stale.status, headers: [...stale.headers, ['x-helix-stale', '1']] }); }
          stats.errors++;
          throw new TatumPausedError(`tatum ${net} HTTP ${res.status}: live chain reads paused (${msg.slice(0, 80)})`);
        }
        if (res.ok && degraded) { console.log('[tatum] recovered; leaving degrade mode'); degraded = null; }
        if (res.status === 429 || res.status >= 500) {
          if (res.status === 429) stats.rateLimited++;
          lastErr = new Error(`tatum ${net} HTTP ${res.status}`);
          continue;
        }
        const text = await res.text();
        if (res.ok && body && isCacheable(body)) {
          if (cache.size > 500) cache.clear();
          cache.set(key, { at: Date.now(), status: res.status, body: text, headers: [['content-type', 'application/json']] });
        }
        return new Response(text, { status: res.status, headers: res.headers });
      } catch (e) {
        if (e instanceof TatumPausedError) throw e;
        lastErr = e;                                   // network error → retry
      }
    }
    stats.errors++;
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }) as Fetch;
}

/** Raw GraphQL request through Tatum (used by the browser proxy and health checks). */
export async function gql<T = any>(net: Net, query: string, variables?: Record<string, unknown>): Promise<{ data?: T; errors?: any[] }> {
  const res = await tatumFetch(net)(TATUM_URLS[net], {
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`tatum ${net}: non-JSON response (${res.status}) ${text.slice(0, 120)}`); }
}

const clients: Partial<Record<Net, SuiGraphQLClient>> = {};
/** A @mysten/sui v2 client whose every request goes through the Tatum chokepoint. */
export function suiClient(net: Net = 'testnet'): SuiGraphQLClient {
  return (clients[net] ??= new SuiGraphQLClient({ url: TATUM_URLS[net], network: net, fetch: tatumFetch(net) }));
}

export async function latestCheckpoint(net: Net): Promise<number> {
  const r = await gql<{ checkpoint: { sequenceNumber: number } }>(net, '{ checkpoint { sequenceNumber } }');
  const n = Number(r.data?.checkpoint?.sequenceNumber);
  if (!Number.isFinite(n)) throw new Error(`tatum ${net}: no checkpoint (${JSON.stringify(r.errors ?? r).slice(0, 160)})`);
  return n;
}

export function recordExecution(net: Net, digest: string): void {
  stats.executed.unshift({ net, digest, at: Date.now() });
  stats.executed.length = Math.min(stats.executed.length, 50);
  console.log(`[tatum] ${net} executeTransaction via ${new URL(TATUM_URLS[net]).host} digest=${digest}`);
}

// ---- GraphQL proxy policy (browser → /graphql, /graphql-main) -----------------
// The browser may READ through the proxy. Writes go through /tx/execute only, so
// the server can log them and attach memory. Mainnet is read-only, full stop.
export function checkProxyQuery(net: Net, body: any): string | null {
  const q = typeof body?.query === 'string' ? body.query : '';
  if (!q) return 'missing query';
  if (q.length > 20_000) return 'query too large';
  // strip strings/comments before scanning for operation keywords
  const bare = q.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/#[^\n]*/g, '');
  if (/\bmutation\b/.test(bare) || /\bsubscription\b/.test(bare)) {
    return net === 'mainnet' ? 'mainnet proxy is read-only' : 'writes must go through /tx/execute';
  }
  return null;
}
