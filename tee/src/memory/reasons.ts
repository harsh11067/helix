// reasons — opt-in reasoning memory (WIN_FEATURES.md W6).
//
// If (and only if) the trader opts in, their thesis text is sent IN PLAINTEXT to the
// Walrus Memory relayer's `analyze`, which extracts and stores facts. The Seal-encrypted
// thesis on Walrus stays private either way. HELIX tags a reason category with a
// deterministic keyword classifier (no external LLM) and writes a REASON memory, then
// learns which kinds of reasons have been right.

export const REASON_CATEGORIES = ['flows', 'technical', 'macro', 'gut', 'other'] as const;
export type ReasonCategory = (typeof REASON_CATEGORIES)[number];

const LEXICON: Record<Exclude<ReasonCategory, 'other'>, RegExp> = {
  flows: /\b(etf|inflows?|outflows?|flows?|funding|whales?|liquidations?|open interest|\boi\b|basis|order ?book|bids?|asks?|spot buying|selling pressure|exchange (in|out)flows?)\b/i,
  technical: /\b(support|resistance|breakout|breakdown|rsi|macd|chart|trend ?line|momentum|moving average|\bma\b|ema|pattern|wedge|triangle|fib(onacci)?|candles?|higher (highs|lows)|lower (highs|lows)|range|retest|overbought|oversold|volume profile)\b/i,
  macro: /\b(fed|fomc|rates?|cpi|ppi|inflation|jobs|nfp|payrolls|dollar|dxy|yields?|treasur(y|ies)|macro|powell|tariffs?|recession|gdp|risk[- ]on|risk[- ]off|equities|nasdaq|s&p)\b/i,
  gut: /\b(feel(ing)?|gut|vibes?|hunch|intuition|sense|just think|i believe|pretty sure|confident|lucky)\b/i,
};

/** Deterministic category: the lexicon with the most hits wins; ties break flows > technical > macro > gut. */
export function classifyReason(text: string): ReasonCategory {
  let best: ReasonCategory = 'other', bestHits = 0;
  for (const cat of ['flows', 'technical', 'macro', 'gut'] as const) {
    const hits = (String(text).match(new RegExp(LEXICON[cat].source, 'gi')) ?? []).length;
    if (hits > bestHits) { best = cat; bestHits = hits; }
  }
  return best;
}

export const PRIVACY_COPY =
  'Let HELIX learn from my reasoning — sends a PLAINTEXT copy of this thesis to the Walrus Memory relayer, ' +
  'which extracts and stores facts from it. Your Seal-encrypted thesis stays private. Off by default.';
