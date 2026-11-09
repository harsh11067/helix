// council/routes — GET /council: agents, records, weights, history and the shared-window scoreboard.
import { council, councilLive } from './state.ts';
import { AGENT_BLURB, type AgentName } from './signals.ts';
import { councilHistory, agentRecords, COUNCIL_NS } from './runner.ts';
import { vettingHistory, ADMIT_MAX_BRIER, ADMIT_MIN_N } from './allocator.ts';
import { weightsEqual, MIN_N_WEIGHT } from './ensemble.ts';
import { commitsBy } from '../memory/commit.ts';
import { recallForAddress } from '../memory/store.ts';
import { settledRows } from '../memory/service.ts';
import { bucketStats, brierOf } from '../memory/calibration.ts';
import { namespaceFor, str, num } from '../memory/format.ts';

const addr = (a: unknown) => (typeof a === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a) ? a.toLowerCase() : null);

/**
 * Council vs You vs Market, ONLY on settled convictions where the Council voice was live when the
 * person committed (p_council recorded) — the same windows for all three voices.
 */
export async function scoreboardFor(address: string) {
  const rows = settledRows(await recallForAddress(address)).filter((r) => r.p_council != null);
  const by = (k: 'p_you' | 'p_mkt' | 'p_council') => brierOf(rows.map((r) => [r[k] as number, r.won]));
  return { n: rows.length, brier: { you: by('p_you'), market: by('p_mkt'), council: by('p_council') }, note: 'Brier on the same settled windows (lower is better)' };
}

// stale-while-revalidate: /council does memory recalls + chain reads for every agent (~10s cold)
const cache = new Map<string, { at: number; v: any; refreshing?: boolean }>();
async function cached(key: string, build: () => Promise<any>): Promise<any> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.v;
  if (hit) {
    if (!hit.refreshing) { hit.refreshing = true; build().then((v) => cache.set(key, { at: Date.now(), v })).catch(() => { hit.refreshing = false; }); }
    return hit.v;
  }
  const v = await build();
  cache.set(key, { at: Date.now(), v });
  return v;
}
export const warmCouncil = () => councilRoutes()['GET /council'](null, new URL('http://x/council')).catch(() => null);

export function councilRoutes() {
  return {
    'GET /council': (_b: any, u: URL) => cached(u.searchParams.get('address') ?? '', () => councilSummary(u)),
  };
}

async function councilSummary(u: URL) {
  const records = council.records.length ? council.records : await agentRecords().catch(() => []);
  const agents = await Promise.all(council.agents.map(async (a) => {
    const rec = records.find((r) => r.agent === a.name);
    const commits = await commitsBy(a.address).catch(() => []);
    const last = commits.sort((x, y) => y.committed_ms - x.committed_ms)[0] ?? null;
    const call = council.calls.find((c) => c.agent === a.name) ?? null;
    return {
      name: a.name, blurb: AGENT_BLURB[a.name as AgentName], address: a.address, namespace: namespaceFor(a.address),
      record: rec ? { n: rec.n, wins: rec.wins, brier: rec.brier, qualified: rec.n >= MIN_N_WEIGHT } : null,
      weight: council.weights[a.name] ?? null, commits: commits.length,
      call: call ? { side: call.side, p_up: call.pUp, confidence: call.confidence, reason: call.reason } : { abstain: true },
      last_commit: last ? { digest: last.digest, expiry_ms: last.expiry_ms, committed_ms: last.committed_ms } : null,
    };
  }));
  const who = addr(u.searchParams.get('address')) ?? addr(process.env.DEMO_ADDRESS?.trim());
  return {
    enabled: council.enabled, live: councilLive(), memory_namespace: COUNCIL_NS,
    rule: `weights ∝ 1 / max(Brier, 0.05) from recalled memory; equal until an agent has n ≥ ${MIN_N_WEIGHT} settled calls`,
    weights: council.weights, weights_equal: weightsEqual(council.weights),
    council_p_up: council.pUp, market_p_up: council.pMktUp, edge: council.edge, window: council.window,
    calls_at: council.callsAt || null, last_commit_at: council.lastCommitAt, last_error: council.lastError,
    agents, history: await councilHistory().catch(() => []),
    allocator: { rule: `admit a human forecaster only if Brier ≤ ${ADMIT_MAX_BRIER} with n ≥ ${ADMIT_MIN_N}; the record is bought per call over MPP`, vetting: await vettingHistory().catch(() => []) },
    scoreboard: who ? { address: who, ...(await scoreboardFor(who).catch(() => ({ n: 0, brier: {} }))) } : null,
  };
}
