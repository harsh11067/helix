// timemachine — N1 Memory Time Machine HTTP API. Flag: FEATURE_TIMEMACHINE=1 (else no routes → 404, and the
// Memory/Council pages show no scrubber).
//
//   GET /timemachine                    probe: the feature is on
//   GET /memory/:address/history        every parsed record with its timestamp (the same recall the live page
//                                       uses) + the Council's weight snapshots, so the browser can replay
//                                       calibration up to any moment with the SAME code (vendor/memory.js)
//
// Nothing is computed differently here: the browser's state at "now" equals the live page by construction,
// and test N1-01 pins that.
import { HttpError } from '../shared/http.ts';
import { namespaceFor, recordTs } from './format.ts';
import { recallForAddress, recallCoverage, mode as memMode } from './store.ts';
import { replayState, keyMoments, latestSetup } from './rows.ts';
import { councilHistory } from '../council/runner.ts';

export const timemachineEnabled = () => process.env.FEATURE_TIMEMACHINE === '1';

function needAddr(a: unknown): string {
  if (typeof a === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a)) return a.toLowerCase();
  throw new HttpError(400, { error: 'invalid Sui address (0x + 64 hex)' });
}

export async function historyFor(address: string) {
  const ns = namespaceFor(address);
  const recs = await recallForAddress(address);
  const council = await councilHistory().catch(() => []);
  const end = replayState(recs, Infinity, latestSetup(recs));
  return {
    namespace: ns,
    memory_network: memMode() === 'mainnet' ? 'walrus-mainnet' : memMode(),
    recall: recallCoverage.get(ns) ?? null,
    count: recs.length,
    records: recs.map((r) => ({ type: r.type, ts: recordTs(r), blob_id: r.blob_id, created_at: r.created_at, fields: r.f, text: r.text })),
    council_history: council.map((h) => ({ ts: h.ts, weights: h.weights, n: h.n, brier: h.brier, blob_id: h.blob_id })),
    key_moments: keyMoments(recs, council),
    // the server's own replay at "now" — the browser compares its end state against this (N1-01)
    end_state: { count: end.count, overall: end.overall, buckets: end.buckets, suggestion: end.suggestion },
    setup: latestSetup(recs),
  };
}

export function timemachineRoutes(): Record<string, (...a: any[]) => unknown> {
  if (!timemachineEnabled()) return {};
  return {
    'GET /timemachine': () => ({ enabled: true, span_ms: 10_000, note: 'replay runs in the browser with the server\'s own calibration module (tistu/js/vendor/memory.js)' }),
    'GET /memory/:address/history': (_b: any, _u: URL, p: Record<string, string>) => historyFor(needAddr(p.address)),
  };
}
