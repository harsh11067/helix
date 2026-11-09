// council/signals — four transparent, rule-based forecasting agents (NEXT_BIG.md §2). No LLM.
//
// Every agent answers the same question each 15-minute window: "will BTC settle ABOVE the window's
// reference price (the price when the window opened)?" — the exact question Polymarket's
// "Bitcoin Up or Down – 15 min" market asks, so the Crowd agent is directly comparable.
// Pure and deterministic: same inputs → same call. An agent with no signal abstains (null).

export type AgentName = 'momentum' | 'reversion' | 'surface' | 'crowd';
export const AGENTS: AgentName[] = ['momentum', 'reversion', 'surface', 'crowd'];
export const AGENT_BLURB: Record<AgentName, string> = {
  momentum: 'Follows the last 15 minutes of BTC price updates: trend strength sets its confidence.',
  reversion: 'Fades an outsized 15-minute move; the bigger the move, the more confident the fade.',
  surface: "Follows DeepBook Predict's on-chain volatility surface: P(BTC above the window's open).",
  crowd: "Follows Polymarket's crowd on the same 15-minute Up/Down window.",
};

export interface Sample { t: number; px: number }
export interface SignalInputs {
  samples: Sample[];          // BTC forward/spot samples, oldest first (≈1 per minute)
  now: number;
  pMktUp: number | null;      // Predict surface: P(settle > reference) for this window
  crowdUp: number | null;     // Polymarket P(Up) for the same 15-minute window, when reachable
}
export interface AgentCall {
  agent: AgentName;
  pUp: number;                // the agent's probability that BTC settles above the reference
  side: 'up' | 'down';
  confidence: number;         // 0–100, so HELIX's "you" mapping 0.5 + 0.45·conf/100 ≈ the agent's p(side)
  reason: string;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const LOOKBACK_MS = 15 * 60_000;

/** One call from a probability of "up": side, and the confidence HELIX's p_you mapping turns back into p(side). */
export function toCall(agent: AgentName, pUp: number, reason: string): AgentCall {
  const p = clamp(pUp, 0.02, 0.98);
  const side = p >= 0.5 ? 'up' : 'down';
  const pSide = Math.max(p, 1 - p);
  return { agent, pUp: p, side, confidence: clamp(Math.round(((pSide - 0.5) / 0.45) * 100), 1, 99), reason };
}

/** z-score of the 15-minute move: log return over the window ÷ the window's own realized volatility. */
export function moveZ(samples: Sample[], now: number): { r: number; sigma: number; z: number; n: number } | null {
  const w = samples.filter((s) => s.t >= now - LOOKBACK_MS && s.t <= now && s.px > 0);
  if (w.length < 6 || w[w.length - 1].t - w[0].t < 5 * 60_000) return null;
  const rets: number[] = [];
  for (let i = 1; i < w.length; i++) rets.push(Math.log(w[i].px / w[i - 1].px));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  const r = Math.log(w[w.length - 1].px / w[0].px);
  const sigma = Math.max(sd * Math.sqrt(rets.length), 1e-6);
  return { r, sigma, z: r / sigma, n: w.length };
}

export function momentum(i: SignalInputs): AgentCall | null {
  const m = moveZ(i.samples, i.now);
  if (!m) return null;
  const pUp = 0.5 + clamp(0.1 * m.z, -0.3, 0.3);
  return toCall('momentum', pUp, `15-min move ${(m.r * 100).toFixed(3)}% (z ${m.z.toFixed(2)}, ${m.n} samples) → follow the trend`);
}

export function reversion(i: SignalInputs): AgentCall | null {
  const m = moveZ(i.samples, i.now);
  if (!m || Math.abs(m.z) < 0.5) return null;                 // no outsized move → no fade, abstain
  const edge = clamp(0.03 + 0.08 * (Math.abs(m.z) - 0.5), 0.03, 0.25);
  return toCall('reversion', 0.5 - Math.sign(m.z) * edge, `15-min move ${(m.r * 100).toFixed(3)}% (z ${m.z.toFixed(2)}) is outsized → fade it`);
}

export function surface(i: SignalInputs): AgentCall | null {
  if (i.pMktUp == null || !Number.isFinite(i.pMktUp)) return null;
  return toCall('surface', i.pMktUp, `Predict surface prices "above the open" at ${(i.pMktUp * 100).toFixed(1)}% → follow it`);
}

export function crowd(i: SignalInputs): AgentCall | null {
  if (i.crowdUp == null || !Number.isFinite(i.crowdUp)) return null;
  return toCall('crowd', i.crowdUp, `Polymarket's same-window Up market trades at ${(i.crowdUp * 100).toFixed(1)}% → follow the crowd`);
}

export const SIGNALS: Record<AgentName, (i: SignalInputs) => AgentCall | null> = { momentum, reversion, surface, crowd };
