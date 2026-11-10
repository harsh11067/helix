// tatumUsage — what HELIX spends on Tatum, measured at the chokepoint (FINAL_PUSH T0/T1).
//
// Every request tatum.ts makes is recorded here with its network, GraphQL operation, latency and
// outcome; cache hits are counted too. From that: calls in the last hour by operation, p50/p95
// latency, error and cache-hit rates, and a credit runway projected from the dashboard figure
// (TATUM_CREDITS_USED, typed in by hand when deploying) plus everything counted since start.
//
// Outbound fetches to anything else are counted by host, so "direct fullnode calls: 0" is a
// measured number, not a promise.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type UsageNet = 'testnet' | 'mainnet' | 'rates' | 'grpc-testnet' | 'grpc-mainnet';
interface Call { t: number; net: UsageNet; op: string; ms: number; ok: boolean; status: number }

const WINDOW_MS = 3 * 3_600_000;
const calls: Call[] = [];
const cacheHits: number[] = [];
const hourly = new Map<number, { calls: number; byOp: Record<string, number> }>();   // hour start → totals
const startedAt = Date.now();
let sinceStart = 0;

const CREDITS_PER_CALL = () => Number(process.env.TATUM_CREDITS_PER_CALL ?? 2);
const CREDITS_LIMIT = () => Number(process.env.TATUM_CREDITS_LIMIT ?? 100_000);
const CREDITS_USED_INPUT = () => {
  const v = Number(process.env.TATUM_CREDITS_USED);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** The GraphQL operation a request body runs: its first top-level field (aliases resolved). */
export function opOf(body: string): string {
  try {
    const q: string = JSON.parse(body)?.query ?? '';
    if (/\bmutation\b/.test(q)) return (q.match(/\b(executeTransaction|simulateTransaction|dryRunTransactionBlock)\b/)?.[1]) ?? 'mutation';
    const i = q.indexOf('{');
    if (i < 0) return 'unknown';
    const m = q.slice(i + 1).match(/^\s*([A-Za-z_]\w*)\s*(:\s*([A-Za-z_]\w*))?/);
    return (m?.[3] ?? m?.[1]) ?? 'unknown';
  } catch { return 'unknown'; }
}

function prune(now: number) {
  while (calls.length && calls[0].t < now - WINDOW_MS) calls.shift();
  while (cacheHits.length && cacheHits[0] < now - 3_600_000) cacheHits.shift();
  const oldest = Math.floor((now - 48 * 3_600_000) / 3_600_000);
  for (const h of hourly.keys()) if (h < oldest) hourly.delete(h);
}

export function recordCall(net: UsageNet, op: string, ms: number, status: number, now = Date.now()): void {
  calls.push({ t: now, net, op, ms, ok: status > 0 && status < 400, status });
  sinceStart++;
  const h = Math.floor(now / 3_600_000), b = hourly.get(h) ?? { calls: 0, byOp: {} };
  b.calls++; b.byOp[`${net}:${op}`] = (b.byOp[`${net}:${op}`] ?? 0) + 1;
  hourly.set(h, b);
  prune(now);
}
export function recordCacheHit(now = Date.now()): void { cacheHits.push(now); prune(now); }

// ---- every other outbound host (Predict server, Pyth, Polymarket, the memory relayer, …)
const hosts = new Map<string, number>();
const FULLNODE = /(^|\.)fullnode\.(testnet|mainnet|devnet)\.sui\.io(:\d+)?$|^(mysten-)?rpc[.-](testnet|mainnet)\.sui\.io(:\d+)?$|^rpc-(testnet|mainnet)\.suiscan\.xyz$|sui-rpc\.|^(testnet|mainnet)\.suiet\.app$/i;
// The Walrus Memory SDK opens its Seal session with the Sui endpoint the relayer advertises in GET /config
// (no option to inject a client), so those calls are the memory layer's, attributed by host — not HELIX's.
const MEMWAL_SUI_HOSTS = new Set((process.env.MEMWAL_SUI_HOSTS ?? 'mysten-rpc.mainnet.sui.io,rpc-mainnet.suiscan.xyz').split(',').map((h) => h.trim()).filter(Boolean));
export function installFetchCounter(): void {
  const g = globalThis as any;
  if (g.__helixFetchCounted) return;
  g.__helixFetchCounted = true;
  const orig = g.fetch.bind(g);
  g.fetch = (input: any, init?: any) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      if (url) { const h = new URL(url).host; hosts.set(h, (hosts.get(h) ?? 0) + 1); }
    } catch { /* never let counting break a request */ }
    return orig(input, init);
  };
}
export function directFullnodeCalls(): number {
  let n = 0;
  for (const [h, c] of hosts) if (FULLNODE.test(h) && !MEMWAL_SUI_HOSTS.has(h)) n += c;
  return n;
}
export function memwalSdkSuiCalls(): Record<string, number> {
  return Object.fromEntries([...hosts].filter(([h]) => MEMWAL_SUI_HOSTS.has(h)));
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/** Everything the Ops panel and /health show about Tatum; computed only from the counters above. */
export function usage(now = Date.now()) {
  prune(now);
  const hour = calls.filter((c) => c.t >= now - 3_600_000);
  const byNet = (net: UsageNet) => {
    const xs = hour.filter((c) => c.net === net);
    const byOp: Record<string, number> = {};
    for (const c of xs) byOp[c.op] = (byOp[c.op] ?? 0) + 1;
    return {
      calls_last_hour: xs.length,
      p50_ms: pct(xs.map((c) => c.ms), 0.5), p95_ms: pct(xs.map((c) => c.ms), 0.95),
      error_rate: xs.length ? Math.round((xs.filter((c) => !c.ok).length / xs.length) * 1000) / 1000 : null,
      by_op: Object.fromEntries(Object.entries(byOp).sort((a, b) => b[1] - a[1])),
    };
  };
  const cpc = CREDITS_PER_CALL();
  // burn: the last hour once the process has run that long, else the average since start
  const upH = Math.max(1 / 60, (now - startedAt) / 3_600_000);
  const callsPerHour = upH >= 1 ? hour.length : sinceStart / upH;
  const creditsPerHour = Math.round(callsPerHour * cpc);
  const usedInput = CREDITS_USED_INPUT();
  const usedNow = usedInput != null ? Math.round(usedInput + sinceStart * cpc) : null;
  const left = usedNow != null ? CREDITS_LIMIT() - usedNow : null;
  const exhaustion = left != null && creditsPerHour > 0 ? new Date(now + (left / creditsPerHour) * 3_600_000).toISOString() : null;
  const reads = hour.length + cacheHits.length;
  return {
    calls_last_hour: hour.length,
    calls_since_start: sinceStart, started_at: new Date(startedAt).toISOString(),
    credits_per_call_est: cpc,
    credits_last_hour_est: Math.round(hour.length * cpc),
    credits_per_hour_est: creditsPerHour,
    credits_used_dashboard_input: usedInput,
    credits_used_est_now: usedNow,
    credits_limit: CREDITS_LIMIT(),
    projected_exhaustion_iso: exhaustion,
    cache_hit_rate: reads ? Math.round((cacheHits.length / reads) * 1000) / 1000 : null,
    interfaces: { testnet: byNet('testnet'), mainnet: byNet('mainnet'), 'grpc-testnet': byNet('grpc-testnet'), 'grpc-mainnet': byNet('grpc-mainnet'), rates: byNet('rates') },
    hourly: [...hourly].sort((a, b) => a[0] - b[0]).slice(-6).map(([h, b]) => ({ hour: new Date(h * 3_600_000).toISOString(), calls: b.calls })),
    other_hosts: Object.fromEntries([...hosts].filter(([h]) => !/gateway\.tatum\.io$|api\.tatum\.io$/.test(h)).sort((a, b) => b[1] - a[1])),
    direct_fullnode_calls: directFullnodeCalls(),
    memwal_sdk_sui_calls: memwalSdkSuiCalls(),
  };
}

// ---- persistence: hourly totals survive a restart on the same disk (best effort)
const FILE = process.env.TATUM_USAGE_FILE ?? join(process.cwd(), 'data', 'tatum-usage.json');
export function loadUsage(): void {
  try {
    const j = JSON.parse(readFileSync(FILE, 'utf8'));
    for (const [h, b] of Object.entries<any>(j.hourly ?? {})) if (!hourly.has(Number(h))) hourly.set(Number(h), b);
  } catch { /* first run */ }
}
export function saveUsage(): void {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify({ saved_at: new Date().toISOString(), hourly: Object.fromEntries(hourly) }));
  } catch { /* read-only disk: counters stay in memory */ }
}
export function startUsagePersistence(): void {
  loadUsage();
  setInterval(saveUsage, 5 * 60_000).unref?.();
}

/** test hook */
export function __resetUsage(): void { calls.length = 0; cacheHits.length = 0; hourly.clear(); hosts.clear(); sinceStart = 0; }
