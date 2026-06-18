// Shared types across HELIX TEE workloads. Mirrors the on-chain StrategyDNA
// (contracts/sources/dna.move) and the conviction the Conviction Canvas emits.

export interface Conviction {
  direction: number;   // -100 (strong bear) .. +100 (strong bull)
  confidence: number;  // 0 .. 100
  horizonCode: number; // 0 = ~1h, 1 = ~4h, 2 = ~12h, 3 = ~1d  (sub-hour-first markets)
  volView: number;     // 0 = calm .. 50 = neutral .. 100 = explosive
  capital: number;     // committed dUSDC
}

// market/structure codes shared with mock_predict.move
export const Market = {
  BINARY: 0, RANGE: 1, CALL: 2, PUT: 3, SPREAD: 4,
} as const;

// behavioral signal codes shared with dna.move
export const Signal = {
  MOMENTUM: 0, MEAN_REVERSION: 1, BREAKOUT: 2, RANGE: 3,
} as const;

export interface Leg {
  type: 'call' | 'put';
  strike: number;
  qty: number; // +long / -short, in contracts
}

export interface StructureMetrics {
  cost: number;        // net debit (>0) or credit (<0), in dUSDC
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
  winProb: number;     // 0..1
  expectedPnl: number;
  sharpe: number;
  greeks: Greeks;
}

export interface Greeks {
  delta: number; gamma: number; vega: number; theta: number; rho: number;
}

export interface Candidate {
  name: string;
  marketCode: number;
  legs: Leg[];
  metrics: StructureMetrics;
}

// Mirrors contracts/sources/dna.move StrategyDNA (genes the compiler fills).
export interface StrategyDNA {
  dirNegative: boolean;
  dirMagnitude: number; // 0..100
  confidence: number;   // 0..100
  horizonDays: number;
  volView: number;      // 0..100
  legCount: number;     // 1..4
  assetPairCode: number;
  usesOptions: boolean;
  usesSpot: boolean;
  usesMargin: boolean;
  leverageX100: number; // >=100
  entrySignalType: number;
  entryThreshold: number;
  exitSignalType: number;
  exitThreshold: number;
  regimeSensitivity: number;
  maxDrawdownBps: number;
  hedgeNeg: boolean;
  hedgeDeltaMag: number;
  mutationCount: number;
  crossoverPoints: number[];
}

export interface Attestation {
  enclaveKeyId: number;
  payloadDigest: string;     // hex sha256 of payload
  signature: string;         // hex HMAC (MOCK_TEE) — replaced by Nitro attestation doc in prod
  validUntilEpoch: number;
  mock: boolean;
}

export interface CompileResult {
  selected: Candidate;
  candidates: Candidate[];
  dna: StrategyDNA;
  ptb: PtbSpec;
  attestation: Attestation;
  spot: number;
  ivAtm: number;
  plpUtilizationBps: number;
}

// A declarative PTB spec the frontend turns into a real @mysten/sui transaction.
export interface PtbSpec {
  package: string;
  module: string;
  function: string;
  market: number;
  legs: Leg[];
  size: number;
  validUntilEpoch: number;
}
