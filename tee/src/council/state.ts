// council/state — the live Council snapshot, shared without import cycles: the runner writes it,
// memory/service.ts reads it (Council voice in every compile) and registers settlement hooks here.

import type { AgentCall } from './signals.ts';
import type { AgentRecord } from './ensemble.ts';

export interface CouncilWindow { marketId: string; expiryMs: number; ref: number | null }
export interface CouncilState {
  enabled: boolean;
  agents: { name: string; address: string }[];
  calls: AgentCall[];          // current calls (recomputed every minute)
  callsAt: number;
  pMktUp: number | null;       // the market's P(above the open) on the Council's window
  pUp: number | null;          // weighted Council P(above the open)
  edge: number | null;         // pUp − pMktUp: what the Council adds to the market
  window: CouncilWindow | null;
  weights: Record<string, number>;
  records: AgentRecord[];
  lastCommitAt: number | null;
  lastError: string | null;
}

export const council: CouncilState = {
  enabled: false, agents: [], calls: [], callsAt: 0, pMktUp: null, pUp: null, edge: null,
  window: null, weights: {}, records: [], lastCommitAt: null, lastError: null,
};

/** Calls older than this no longer describe the market; the Council voice goes quiet rather than stale. */
export const CALLS_FRESH_MS = 5 * 60_000;
export const councilLive = (now = Date.now()) => council.enabled && council.edge != null && now - council.callsAt < CALLS_FRESH_MS;

/** Hooks run after the watcher writes an OUTCOME (the runner re-weights after agents settle). */
type ResolvedHook = (origin: string | null, tx: string) => void;
export const resolvedHooks: ResolvedHook[] = [];
export const onResolved = (h: ResolvedHook) => { resolvedHooks.push(h); };
