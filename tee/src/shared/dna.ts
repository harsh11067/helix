// dna — build + validate StrategyDNA off-chain. Validation rules MIRROR the
// authoritative on-chain `dna::is_valid` (contracts/sources/dna.move); the chain
// is the source of truth, this just lets the compiler fail fast (test 3.7).
import type { Conviction, StrategyDNA } from './types.ts';
import { Signal } from './types.ts';

export function validateDNA(d: StrategyDNA): string[] {
  const errs: string[] = [];
  const pct = (v: number, name: string) => { if (v < 0 || v > 100) errs.push(`${name} out of range: ${v}`); };
  pct(d.dirMagnitude, 'dirMagnitude');
  pct(d.confidence, 'confidence');
  pct(d.volView, 'volView');
  pct(d.regimeSensitivity, 'regimeSensitivity');
  pct(d.entryThreshold, 'entryThreshold');
  pct(d.exitThreshold, 'exitThreshold');
  if (d.legCount < 1 || d.legCount > 4) errs.push(`legCount out of range: ${d.legCount}`);
  if (d.assetPairCode > 8) errs.push('assetPairCode out of range');
  if (d.entrySignalType > 3) errs.push('entrySignalType out of range');
  if (d.exitSignalType > 3) errs.push('exitSignalType out of range');
  if (d.leverageX100 < 100 || d.leverageX100 > 1000) errs.push('leverageX100 out of range');
  if (d.dirNegative && d.dirMagnitude === 0) errs.push('negative-zero direction');
  if (d.hedgeNeg && d.hedgeDeltaMag === 0) errs.push('negative-zero hedge');
  return errs;
}

export function isValidDNA(d: StrategyDNA): boolean {
  return validateDNA(d).length === 0;
}

// Map a conviction + the AI-chosen structure into DNA genes.
export function buildDNA(
  conv: Conviction, legCount: number, usesSpot: boolean, usesMargin: boolean,
): StrategyDNA {
  const dirNegative = conv.direction < 0;
  const dirMagnitude = Math.min(100, Math.abs(Math.round(conv.direction)));
  // behavioral genes from the volatility/direction view (Paper 3 momentum vs mean-reversion)
  const entrySignal = conv.volView > 60 ? Signal.BREAKOUT
    : conv.direction === 0 ? Signal.RANGE
    : conv.confidence > 60 ? Signal.MOMENTUM : Signal.MEAN_REVERSION;
  const horizonDays = conv.horizonCode >= 3 ? 1 : 0;
  return {
    dirNegative, dirMagnitude,
    confidence: Math.round(conv.confidence),
    horizonDays,
    volView: Math.round(conv.volView),
    legCount: Math.max(1, Math.min(4, legCount)),
    assetPairCode: 0, // BTC/dUSDC
    usesOptions: true,
    usesSpot, usesMargin,
    leverageX100: usesMargin ? 300 : 100,
    entrySignalType: entrySignal,
    entryThreshold: 40,
    exitSignalType: Signal.RANGE,
    exitThreshold: 60,
    regimeSensitivity: Math.round(conv.volView),
    maxDrawdownBps: Math.max(300, 1500 - conv.confidence * 5), // higher confidence → tighter stop band
    hedgeNeg: false,
    hedgeDeltaMag: 0,
    mutationCount: 0,
    crossoverPoints: [],
  };
}
