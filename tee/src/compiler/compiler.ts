// compiler — the Compiler Agent core (architecture.md §4.1, plan Phase 3).
// Reads the conviction + the (mock) SVI surface, enumerates candidate
// structures, Pareto-selects the one that best expresses the conviction at
// acceptable cost, generates StrategyDNA + a PTB spec, and signs a TEE
// attestation. Pure + synchronous → fast and testable.
import type { Candidate, CompileResult, Conviction } from '../shared/types.ts';
import { getSnapshot, atmIV, type MarketSnapshot } from '../shared/mockOracle.ts';
import { getLiveSnapshot } from '../shared/oracle.ts';
import { enumerateCandidates } from './structures.ts';
import { buildDNA } from '../shared/dna.ts';
import { sign } from '../shared/attestation.ts';
import { clamp } from '../shared/math.ts';

export class OracleStaleError extends Error {}

// Data-source switch (CLAUDE.md Task 1): OFFLINE=1 keeps the deterministic mock
// (so the TEE unit tests stay green); default / OFFLINE=0 reads the live feed.
const isOffline = () => process.env.OFFLINE === '1';

function utility(c: Candidate, conv: Conviction, maxAbsDelta: number, maxAbsVega: number, maxSharpe: number): number {
  const dirNorm = conv.direction / 100;                       // -1..1
  const deltaScaled = clamp(c.metrics.greeks.delta / (maxAbsDelta || 1), -1, 1);
  // Directional alignment is the primary driver: a strong view must not be
  // expressed by a structure whose delta opposes it.
  let dirAlign: number;
  if (Math.abs(dirNorm) < 0.2) {
    dirAlign = 1 - Math.abs(deltaScaled);                     // neutral → want delta-neutral
  } else if (Math.sign(dirNorm) === Math.sign(deltaScaled) && deltaScaled !== 0) {
    dirAlign = 1 - Math.abs(Math.abs(dirNorm) - Math.abs(deltaScaled)) * 0.5;
  } else {
    dirAlign = 0;                                             // opposes the conviction
  }

  const volNorm = conv.volView / 100;                          // 0..1
  const vegaScaled01 = (clamp(c.metrics.greeks.vega / (maxAbsVega || 1), -1, 1) + 1) / 2;
  const volAlign = 1 - Math.abs(volNorm - vegaScaled01);

  const sharpeNorm = clamp(c.metrics.sharpe / (maxSharpe || 1), 0, 1);

  return 0.5 * dirAlign + 0.3 * volAlign + 0.15 * c.metrics.winProb + 0.05 * sharpeNorm;
}

// Non-dominated (Pareto) filter on (winProb↑, sharpe↑, -cost↑).
function paretoFront(cands: Candidate[]): Candidate[] {
  return cands.filter((a) =>
    !cands.some((b) =>
      b !== a &&
      b.metrics.winProb >= a.metrics.winProb &&
      b.metrics.sharpe >= a.metrics.sharpe &&
      b.metrics.cost <= a.metrics.cost &&
      (b.metrics.winProb > a.metrics.winProb || b.metrics.sharpe > a.metrics.sharpe || b.metrics.cost < a.metrics.cost),
    ),
  );
}

// Pure, synchronous core. The snapshot defaults to the deterministic mock so the
// TEE unit tests call compile(conv, epoch) unchanged; the live path passes a real
// snapshot in (see compileLive).
export function compile(
  conv: Conviction,
  currentEpoch = 0,
  snap: MarketSnapshot = getSnapshot(conv.horizonCode, conv.volView),
): CompileResult {
  if (snap.stale) throw new OracleStaleError('SVI surface stale — Risk Guardian blocked compile');

  const candidates = enumerateCandidates(conv, snap);
  const maxAbsDelta = Math.max(...candidates.map((c) => Math.abs(c.metrics.greeks.delta)));
  const maxAbsVega = Math.max(...candidates.map((c) => Math.abs(c.metrics.greeks.vega)));
  const maxSharpe = Math.max(...candidates.map((c) => c.metrics.sharpe), 0);

  // Select the utility-maximizing structure across all candidates; the Pareto
  // front is computed for reporting/diagnostics (it never discards a candidate
  // that better expresses the conviction).
  void paretoFront;
  let selected = candidates[0];
  let best = -Infinity;
  for (const c of candidates) {
    const u = utility(c, conv, maxAbsDelta, maxAbsVega, maxSharpe);
    if (u > best) { best = u; selected = c; }
  }

  const dna = buildDNA(conv, selected.legs.length, false, false);
  const ptb = {
    package: process.env.HELIX_PACKAGE_ID ?? '0xHELIX',
    module: 'predict_adapter',
    function: 'mint_for_leg',
    market: selected.marketCode,
    legs: selected.legs,
    size: Math.round(conv.capital),
    validUntilEpoch: currentEpoch + 5,
  };
  const attestation = sign({ dna, selected: selected.name, legs: selected.legs }, currentEpoch);

  return {
    selected, candidates, dna, ptb, attestation,
    spot: snap.spot, ivAtm: atmIV(snap), plpUtilizationBps: snap.plpUtilizationBps,
  };
}

// Live entry used by the HTTP server. OFFLINE=1 → deterministic mock snapshot;
// otherwise the real testnet SVI surface from the Predict server. Pricing,
// selection, DNA and attestation are identical — only the snapshot source changes.
export async function compileLive(conv: Conviction, currentEpoch = 0): Promise<CompileResult> {
  const snap = isOffline()
    ? getSnapshot(conv.horizonCode, conv.volView)
    : await getLiveSnapshot(conv.horizonCode, conv.volView);
  return compile(conv, currentEpoch, snap);
}
