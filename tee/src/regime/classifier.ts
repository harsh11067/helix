// classifier — the Regime Classifier (architecture.md §4.3, plan Phase 3).
// Maps market features to one of four regimes and emits change events so
// regime-sensitive strategies can adapt.
export const Regime = {
  TRENDING_BULL: 'TRENDING_BULL',
  TRENDING_BEAR: 'TRENDING_BEAR',
  RANGE_BOUND: 'RANGE_BOUND',
  HIGH_VOLATILITY: 'HIGH_VOLATILITY',
} as const;
export type RegimeName = (typeof Regime)[keyof typeof Regime];

export interface RegimeFeatures {
  realizedVol: number;   // annualized, e.g. 0.55
  ivTermSlope: number;   // front - back IV
  skew: number;          // put IV - call IV
  trend: number;         // -1..1 normalized drift
  volumeZ: number;       // volume z-score
}

export interface RegimeResult { regime: RegimeName; confidence: number }

export function classify(f: RegimeFeatures): RegimeResult {
  // High realized vol or a volume shock dominates everything else.
  if (f.realizedVol > 0.9 || f.volumeZ > 2.5) {
    return { regime: Regime.HIGH_VOLATILITY, confidence: clampConf(f.realizedVol) };
  }
  if (f.trend > 0.35) return { regime: Regime.TRENDING_BULL, confidence: clampConf(f.trend) };
  if (f.trend < -0.35) return { regime: Regime.TRENDING_BEAR, confidence: clampConf(-f.trend) };
  return { regime: Regime.RANGE_BOUND, confidence: 0.6 };
}

function clampConf(x: number): number {
  return Math.max(0.5, Math.min(0.99, Math.abs(x)));
}

// Stateful detector — emits a change event when the classification flips, and
// flags which regime-sensitive strategies should be notified (test 3.20/3.21).
export class RegimeMonitor {
  private current: RegimeName | null = null;
  step(f: RegimeFeatures, sensitivities: { strategyId: string; regimeSensitivity: number }[]) {
    const { regime, confidence } = classify(f);
    const changed = this.current !== null && this.current !== regime;
    const from = this.current;
    this.current = regime;
    const notify = changed ? sensitivities.filter((s) => s.regimeSensitivity > 0).map((s) => s.strategyId) : [];
    return { regime, confidence, changed, from, notify };
  }
  get(): RegimeName | null { return this.current; }
}
