// Compiler service HTTP API — the HELIX hub (architecture.md §10.3 + Total Recall).
//
//   POST /compile, /preview      conviction → structure (+ memory block when `address` given)
//   POST /tx/fund, /tx/mint      unsigned Predict v4 transactions built server-side via Tatum
//   POST /tx/execute             wallet-signed bytes → executed through Tatum → CONVICTION memory
//   POST /graphql, /graphql-main browser read proxy → Tatum Sui GraphQL (testnet / mainnet, read-only)
//   POST /rpc, /rpc-main         JSON-RPC compatibility façade (allowlisted, translated to GraphQL)
//   GET  /memory/:address[...]   Walrus Memory (mainnet) timeline, proof, dividend
//   GET  /health                 Tatum checkpoints (both networks) + Walrus Memory health
import { jsonServer, HttpError } from '../shared/http.ts';
import { compileOffline } from './compiler.ts';
import { MOCK_TEE } from '../shared/attestation.ts';
import type { Conviction } from '../shared/types.ts';
import { gql, latestCheckpoint, stats as tatumStats, checkProxyQuery, recordExecution, tatumConfigured, tatumDegraded, TATUM_URLS } from '../shared/tatum.ts';
import { usage as tatumUsage, installFetchCounter, startUsagePersistence } from '../shared/tatumUsage.ts';
import { GRPC_HOSTS } from '../shared/tatumGrpc.ts';
import { handleRpc } from '../shared/rpcFacade.ts';
import * as P from '../predict/predict.ts';
import {
  liveCompile, buildMint, buildFund, onMintExecuted, buildCommit, recordCommit, onCommitExecuted, timelineFor, dividendFor, credibilityFor,
  resolveByDigest, startWatcher, pendingCount, reasonCheck,
} from '../memory/service.ts';
import { PRIVACY_COPY } from '../memory/reasons.ts';
import { memwalHealth, mode as memMode, writesLastHour, writeStats, warmNamespaces } from '../memory/store.ts';
import { namespaceFor, NS_PREFIX } from '../memory/format.ts';
import { memoryProof } from '../memory/proof.ts';
import { crowdMarketFor } from '../crowd/polymarket.ts';
import { witnessBtc } from '../shared/tatumRates.ts';
import { paidRoutes } from '../agents/paid.ts';
import { passportOnchainRoutes } from '../passport/onchain/routes.ts';
import { askRoutes } from '../ask/routes.ts';
import { assetsRoutes } from '../assets/routes.ts';
import { timemachineRoutes } from '../memory/timemachine.ts';
import { rulesRoutes } from '../memory/rulesService.ts';
import { boardFor } from '../memory/board.ts';
import { sponsorRefusal, sponsorSign, sponsorAddress } from '../memory/commit.ts';
import { councilRoutes } from '../council/routes.ts';
import { passportRoutes } from '../passport/offchain/routes.ts';
import { ticker } from '../fun/ticker.ts';
import { latestAudit, lastAudit, startAudit } from '../fun/audit.ts';
import { paymentRoutes } from '../payments/routes.ts';
import { startCouncil } from '../council/runner.ts';
import { council } from '../council/state.ts';

const offline = () => process.env.OFFLINE === '1';

function asConviction(b: any): Conviction {
  const num = (v: any, lo: number, hi: number, name: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`invalid ${name}: ${v}`);
    return n;
  };
  return {
    direction: num(b.direction, -100, 100, 'direction'),
    confidence: num(b.confidence, 0, 100, 'confidence'),
    horizonCode: num(b.horizonCode ?? 0, 0, 3, 'horizonCode'),
    volView: num(b.volView ?? b.vol, 0, 100, 'volView'),
    capital: num(b.capital ?? b.commit, 0, 1e12, 'capital'),
  };
}
const addr = (a: unknown): string | null => (typeof a === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a) ? a.toLowerCase() : null);
function needAddr(a: unknown): string {
  const x = addr(a);
  if (!x) throw new HttpError(400, { error: 'invalid Sui address (0x + 64 hex)' });
  return x;
}

let healthCache: { at: number; v: any } | null = null;
// Render injects the deployed commit; exposing it makes a stale or rolled-back deploy visible.
const RUNNING_COMMIT = (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? '').slice(0, 7) || null;
// G-06: gas for every signer HELIX runs (judge sponsor, Council agents, allocator, operator), low below 0.05 SUI
let gasCache: { at: number; v: any } | null = null;
async function gasHealth() {
  if (gasCache && Date.now() - gasCache.at < 5 * 60_000) return gasCache.v;   // T0: balances move slowly
  const signers: Record<string, string | null> = { sponsor: sponsorAddress(), operator: process.env.DEMO_ADDRESS?.trim() ?? null };
  for (const a of council.agents) signers[`agent:${a.name}`] = a.address;
  const alloc = (await import('../council/allocator.ts').catch(() => null))?.allocatorKey()?.toSuiAddress();
  if (alloc) signers.allocator = alloc;
  const out: Record<string, number | null> = {};
  for (const [k, a] of Object.entries(signers)) {
    if (!a) continue;
    const r: any = await gql('testnet', `query($a:SuiAddress!){ address(address:$a){ balance(coinType:"0x2::sui::SUI"){ totalBalance } } }`, { a }).catch(() => null);
    const b = r?.data?.address?.balance?.totalBalance;
    out[k] = b == null ? null : Number(b) / 1e9;
  }
  const v = { sui: out, low: Object.entries(out).filter(([, b]) => b != null && b < 0.05).map(([k]) => k), threshold_sui: 0.05 };
  gasCache = { at: Date.now(), v };
  return v;
}

async function health() {
  if (healthCache && Date.now() - healthCache.at < 60_000) return { ...healthCache.v, tatum: { ...healthCache.v.tatum, usage: tatumUsage(), degraded: tatumDegraded() } };
  const base: any = { ok: true, agent: 'compiler', commit: RUNNING_COMMIT, gas_sponsor: sponsorAddress(), mockTee: MOCK_TEE, offline: offline(),
    council: { enabled: council.enabled, agents: council.agents.length, last_error: council.lastError },
    council_last_commit_age_s: council.lastCommitAt ? Math.round((Date.now() - council.lastCommitAt) / 1000) : null,
    memory_writes: { last_hour: writesLastHour(), cap_per_hour: writeStats.maxPerHour, waited: writeStats.waited } };
  if (!offline()) base.gas = await gasHealth().catch((e) => ({ error: (e as Error).message }));
  if (offline()) return { ...base, memwal: 'mock' };
  const [tn, mn, mw] = await Promise.all([
    latestCheckpoint('testnet').catch((e) => ({ error: (e as Error).message })),
    latestCheckpoint('mainnet').catch((e) => ({ error: (e as Error).message })),
    memwalHealth(),
  ]);
  let predict: any = null;
  try {
    const t = await P.tradeableMarkets();
    predict = { network: P.NETWORK, open_windows: t.map((m) => Math.round(m.minutesLeft * 10) / 10), quote_coin: P.quoteCoinType() };
  } catch (e) { predict = { error: (e as Error).message.slice(0, 120) }; }
  const v = {
    ...base,
    tatum_testnet_checkpoint: typeof tn === 'number' ? tn : null,
    tatum_mainnet_checkpoint: typeof mn === 'number' ? mn : null,
    tatum: {
      configured: tatumConfigured(), plan: tatumStats.plan,
      testnet: { url: new URL(TATUM_URLS.testnet).host, checkpoint: tn }, mainnet: { url: new URL(TATUM_URLS.mainnet).host, checkpoint: mn },
      requests: tatumStats.requests, retries: tatumStats.retries, rate_limited: tatumStats.rateLimited,
      recent_executions: tatumStats.executed.slice(0, 5),
      usage: tatumUsage(), degraded: tatumDegraded(),
    },
    memwal: mw.status, memwal_detail: mw, memory_network: memMode() === 'mainnet' ? 'walrus-mainnet' : memMode(),
    watcher: { pending: pendingCount() },
    predict,
  };
  healthCache = { at: Date.now(), v };
  return v;
}

export function makeServer() {
  return jsonServer({
    // ---------------------------------------------------------------- compile
    'POST /compile': async (b) => {
      const conv = asConviction(b);
      if (offline()) return compileOffline(conv, Number(b.currentEpoch ?? 0));
      return liveCompile(conv, { address: addr(b.address), currentEpoch: Number(b.currentEpoch ?? 0) });
    },
    'POST /preview': async (b) => {
      const conv = asConviction(b);
      const r: any = offline() ? compileOffline(conv, Number(b.currentEpoch ?? 0))
        : await liveCompile(conv, { address: addr(b.address), currentEpoch: Number(b.currentEpoch ?? 0) });
      return {
        selected: r.selected, candidates: r.candidates,
        spot: r.spot, ivAtm: r.ivAtm, plpUtilizationBps: r.plpUtilizationBps,
        predict: r.predict, voices: r.voices, memory: r.memory, guardian: r.guardian, regime: r.regime,
        rules_triggered: r.rules_triggered ?? [],   // N2
      };
    },
    'GET /health': () => health(),
    // dependency-free liveness for the host's health checker / keep-alive (no Tatum credits)
    'GET /healthz': () => ({ ok: true, agent: 'compiler', commit: RUNNING_COMMIT, uptime_s: Math.round(process.uptime()), tatum_degraded: !!tatumDegraded() }),
    // T1: the Ops panel — every number computed from the chokepoint's counters, none invented
    'GET /ops/tatum': () => ({ ...tatumUsage(), plan: tatumStats.plan, degraded: tatumDegraded(), requests_total: tatumStats.requests,
      retries: tatumStats.retries, rate_limited: tatumStats.rateLimited, last_latency_ms: tatumStats.lastLatencyMs,
      hosts: { testnet: new URL(TATUM_URLS.testnet).host, mainnet: new URL(TATUM_URLS.mainnet).host, 'grpc-testnet': GRPC_HOSTS.testnet, 'grpc-mainnet': GRPC_HOSTS.mainnet },
      recent_executions: tatumStats.executed.slice(0, 5) }),

    // ---------------------------------------------------------------- transactions (Predict v4 via Tatum)
    'POST /tx/fund': (b) => buildFund({ address: needAddr(b.address), amount: Number(b.amount) }),
    // Commit mode (no capital): journal::commit(sha256(conviction), market, expiry) — gas only
    'POST /tx/commit': (b) => buildCommit({ address: needAddr(b.address), compileId: String(b.compileId ?? ''), commit: b.commit, useMemoryStructure: !!b.useMemoryStructure, origin: b.origin === 'cli' ? 'cli' : 'browser', reason: b.reason, override: b.override }),
    'POST /memory/conviction': (b) => recordCommit({ address: needAddr(b.address), text: String(b.text ?? ''), digest: String(b.digest ?? ''), origin: b.origin === 'cli' ? 'cli' : 'browser' }),
    'POST /tx/mint': (b) => buildMint({ address: needAddr(b.address), compileId: String(b.compileId ?? ''), commit: b.commit, useMemoryStructure: !!b.useMemoryStructure, origin: b.origin === 'cli' ? 'cli' : 'browser', reason: b.reason, override: b.override }),
    'POST /tx/execute': async (b) => {
      const txBytes = String(b.txBytes ?? '');
      const sigs: string[] = Array.isArray(b.signatures) ? b.signatures : b.signature ? [b.signature] : [];
      if (!txBytes || !sigs.length) throw new HttpError(400, { error: 'txBytes and signature(s) required' });
      // sponsored commit: co-sign only a validated helix::journal::commit (see memory/commit.ts)
      const refusal = sponsorRefusal(txBytes);
      if (refusal) throw new HttpError(403, { error: refusal });
      if (refusal === null) sigs.push(await sponsorSign(txBytes));
      const res = await P.executeSigned(txBytes, sigs);
      const tx = res.Transaction ?? res.FailedTransaction ?? res;
      const digest: string = tx?.digest;
      if (digest) recordExecution('testnet', digest);
      const ok = !!tx?.effects?.status?.success;
      let recordId: string | null = null;
      if (ok && b.mintId) recordId = (await onMintExecuted(String(b.mintId), digest, res)).recordId;
      const committed = ok && b.commitId ? onCommitExecuted(String(b.commitId), digest) : false;
      const changed = (tx?.effects?.changedObjects ?? []).map((o: any) => ({ id: o.objectId ?? o.id, op: o.idOperation ?? o.outputState, type: tx?.objectTypes?.[o.objectId ?? o.id] ?? null }));
      return { digest, success: ok, error: tx?.effects?.status?.error ?? null, recordId, committed, changed, executedVia: new URL(TATUM_URLS.testnet).host };
    },
    'GET /predict/account/:address': async (_b, _u, p) => {
      const a = needAddr(p.address);
      const [acct, wallet] = await Promise.all([P.accountState(a), P.walletQuoteBalance(a).catch(() => null)]);
      return { ...acct, walletQuoteBalance: wallet, quoteCoinType: P.quoteCoinType() };
    },
    'GET /predict/markets': async () => (await P.tradeableMarkets()).map((m) => ({ id: m.id, expiryMs: m.expiryMs, minutesLeft: m.minutesLeft, referencePrice: m.referencePrice })),

    // ---------------------------------------------------------------- Tatum chokepoint for the browser
    'POST /graphql': async (b) => {
      const why = checkProxyQuery('testnet', b);
      if (why) throw new HttpError(403, { errors: [{ message: why }] });
      return gql('testnet', b.query, b.variables);
    },
    'POST /graphql-main': async (b) => {
      const why = checkProxyQuery('mainnet', b);
      if (why) throw new HttpError(403, { errors: [{ message: why }] });
      return gql('mainnet', b.query, b.variables);
    },
    'POST /rpc': (b) => handleRpc('testnet', b),
    'POST /rpc-main': (b) => handleRpc('mainnet', b),

    // ---------------------------------------------------------------- Walrus Memory
    'GET /memory/:address': (_b, _u, p) => timelineFor(needAddr(p.address)),
    'GET /memory/:address/proof/:blobId': (_b, _u, p) => memoryProof(needAddr(p.address), p.blobId),
    'GET /memory/:address/dividend': (_b, _u, p) => dividendFor(needAddr(p.address)),
    'POST /memory/resolve/:digest': (b, _u, p) => resolveByDigest(needAddr(b.address), p.digest),
    'GET /credibility/:address': async (_b, _u, p) => {
      const c = await credibilityFor(needAddr(p.address));
      return { namespace: c.namespace, n: c.n, overall: { n: c.overall.n, wins: c.overall.wins, posterior: c.overall.posterior, brier: c.overall.brier }, memory_network: c.memory_network, detail: 'per-bucket detail and lessons: GET /paid/credibility/:address (402, pay-per-call)' };
    },
    'GET /board': () => boardFor(),
    // Judge Mode: the read-only demo trader (an address is public on-chain; nothing here can sign)
    'GET /demo': () => {
      const a = addr(process.env.DEMO_ADDRESS?.trim());
      return { address: a, readOnly: true, label: process.env.DEMO_LABEL ?? 'HELIX demo trader' };
    },
    // W6 reasoning memory (opt-in): category + what memory says about it — the text is NOT stored here
    'POST /reason/check': (b) => reasonCheck(needAddr(b.address), String(b.text ?? '').slice(0, 2000)),
    'GET /reason/privacy': () => ({ copy: PRIVACY_COPY, default: 'off' }),

    // ---------------------------------------------------------------- win features
    'GET /crowd/btc': async (_b, u) => {
      const exp = Number(u.searchParams.get('expiry')) || Math.ceil(Date.now() / 900_000) * 900_000;
      const m = await crowdMarketFor(exp > 1e12 ? exp : exp * 1000);
      return m ?? { status: 'unavailable', reason: 'no Polymarket BTC Up/Down market for that window' };
    },
    'GET /witness/btc': async () => {
      const t = await P.tradeableMarkets().catch(() => []);
      const pv = t.length ? await P.pricerFor(t[t.length - 1]).catch(() => null) : null;
      return witnessBtc(pv?.forward ?? null);
    },
    ...paidRoutes(),
    ...councilRoutes(),
    ...passportRoutes(),
    // F1 live proof ticker, from chain events
    'GET /proof/ticker': async () => {
      const a = lastAudit();
      const d = tatumDegraded();
      return { ...(await ticker()), audit: a ? { ok: a.ok, audited: a.audited, at_ms: a.finished_ms } : null,
        degraded: d ? { since_ms: d.since, banner: 'Live chain reads paused — showing cached data' } : null };
    },
    // continuous chain audit: every commit re-fetched as a transaction through Tatum and checked independently
    'GET /proof/audit': () => latestAudit(),
    ...passportOnchainRoutes(),
    ...paymentRoutes(),
    ...askRoutes(),
    ...assetsRoutes(),
    ...timemachineRoutes(),   // N1 (FEATURE_TIMEMACHINE)
    ...rulesRoutes(),         // N2 (FEATURE_RULES)
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Render (and most PaaS) inject PORT; prefer it, then COMPILER_PORT, then local default.
  const port = Number(process.env.PORT ?? process.env.COMPILER_PORT ?? 8081);
  installFetchCounter();
  startUsagePersistence();
  // Render sends SIGTERM to the old instance when a deploy goes live (then SIGKILL after ~30 s). Stop starting
  // agent commits and wait for in-flight memory writes, so no commit lands without its memory (10 Nov lesson).
  process.once('SIGTERM', async () => {
    council.shuttingDown = true;
    const { memoryWritesInFlight } = await import('../memory/store.ts');
    const t0 = Date.now();
    while ((memoryWritesInFlight() > 0 || (council.committing ?? 0) > 0) && Date.now() - t0 < 25_000) await new Promise((r) => setTimeout(r, 250));
    console.log(`[compiler] SIGTERM: drained memory writes (${memoryWritesInFlight()} left after ${Date.now() - t0} ms); exiting`);
    process.exit(0);
  });
  makeServer().listen(port, '0.0.0.0', () => console.log(`[compiler] listening on :${port} (mockTee=${MOCK_TEE}, memory=${memMode()}, tatum=${tatumConfigured() ? 'keyed' : 'anonymous'})`));
  startWatcher();
  startCouncil();
  startAudit();
  // warm the parsed-memory cache for what judges open first (demo trader, Council, agents)
  if (!offline() && process.env.WATCHER !== '0') setTimeout(() => {
    const demo = process.env.DEMO_ADDRESS?.trim();
    void warmNamespaces([...(demo ? [namespaceFor(demo)] : []), `${NS_PREFIX}-council`, ...council.agents.map((a) => namespaceFor(a.address)), `${NS_PREFIX}-payments`]);
  }, 2_000);
  // free-tier hosts sleep when idle, which would pause the settlement watcher
  const ka = process.env.KEEPALIVE_URL;
  if (ka && !offline()) setInterval(() => { fetch(ka).catch(() => {}); }, 10 * 60_000).unref?.();
}
