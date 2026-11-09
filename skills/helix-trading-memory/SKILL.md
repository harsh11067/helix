---
name: helix-trading-memory
description: Consult a trader's HELIX memory (Walrus Memory, mainnet) before helping them place, size or reason about a BTC prediction/position. Use when the user asks whether to take a trade, how much to commit, or "what does my memory/track record say", and a HELIX MCP server (helix_memory, helix_credibility, helix_lessons, helix_preview) is available.
---

# HELIX trading memory

HELIX records three-to-four probability "voices" for every conviction — the trader's own
confidence, the DeepBook Predict market (SVI-implied), HELIX's regime model, and, when
comparable, the Polymarket crowd — then scores each voice against settled outcomes.

## When to consult it
- Before the user commits to a BTC directional or range bet.
- When the user states a confidence level ("I'm 85% sure…") — check whether their stated
  confidence has been calibrated in that setup.
- When asked "who should I trust here?" — compare Brier scores per voice.

## How
1. `helix_credibility(address)` → find the bucket matching the setup
   (`direction/confidence-band/vol`, e.g. `up/high/choppy`). Lower Brier = better calibrated.
   Ignore buckets with n < 3; say so.
2. `helix_lessons(address, bucket)` → quote any lesson verbatim, with its blob id.
3. `helix_preview({ address, direction, confidence, volView, commit })` → report
   "you set X · memory suggests Y" and any structure suggestion. Never present memory's
   suggestion as a decision — the trader chooses.

## Honesty rules
- Always state n. Small samples are noisy; HELIX uses a Beta(2,2) prior.
- Positions trade on Sui **testnet**; memories live on Walrus **mainnet**.
- Cite blob ids when quoting memory so the user can verify them.
