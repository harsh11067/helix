# HELIX — Submission & Demo Lock

> The honest state of the build, the locked 5-minute demo, and the answers to the questions judges will ask. Record from this. Do not improvise claims beyond what's here.

---

## 1. What is genuinely real (verifiable, not claimed)

- **On-chain package**, published to Sui testnet: `0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3`
  - 15 modules; `mock_predict` provably absent from bytecode (the `#[test_only]` gate held)
  - Linkage table binds the real DeepBook Predict (`0xf5ea…5138`) + upgraded deepbook v19
- **Real `predict::mint` from a browser wallet** — personally minted with 5 DUSDC end-to-end through the Conviction Canvas. This is the demo's smoking gun and it is verified by a human, not just CLI dry-run.
- **Live SVI pricing** — `/compile` prices conviction against the real testnet BTC oracle (verified: spot ≈ $63,945, ATM IV ≈ 37%); guardian SVI-age reads the real on-chain oracle timestamp; oracle auto-rotates when one nears settlement.
- **Real Walrus** — backtest equity curves upload to and round-trip from Walrus testnet (verified blob `QE8n…mX4`).
- **Real indexer** — live `SuiEventSource` ingests the real `StrategyCreated` event from the deployed package.
- **Tests green throughout**: Move 56/56 (87.4% cov), TEE 20/20, Indexer 7/7.
- **Frontend** — six pages, all reading real chain/Predict-server data, no fabricated seed data, in a locked design language (`tistu/DESIGN.md`).

## 2. What is intentionally stubbed (labeled, defensible)

| Stub | Why | What to say if asked |
|---|---|---|
| TEE attestation (`attestation.ts` HMAC) | Nautilus Nitro enclave deploy is out of hackathon scope | "Agent logic is real and tested; hardware attestation is the documented next step, stubbed with a structurally-correct signed pattern." |
| `bridges.move` verify (non-empty check) | Same | "Stub verification; swaps to `ed25519::verify` against the enclave key once Nautilus lands." |
| `backtest.ts` PRNG paths | Sui options markets are weeks old; no real history | "Simulated deterministic backtest — labeled in the UI. Real backtests pending sufficient market history." |

These are honest, scope-bounded, and labeled in code. The judging methodology rewards this over hollow over-claiming.

## 3. Claims to NEVER make (stale or unbuilt)

- ❌ "zkLogin" — you use Wallet Standard. Say "connect your Sui wallet."
- ❌ "Greeks netting" (Delta/Gamma/Vega) — say "portfolio risk axes" (Net Exposure, Directional Bias, Time-to-Resolution, Concentration, Liquidity Headroom).
- ❌ "Nautilus TEE running in production" — say "TEE agent logic, attestation stubbed."
- ❌ "iron condor / straddle / butterfly" — say Predict-native: directional bet, range bet, bracketed range.
- ❌ "neural-corrected IV / LSTM pricing" — you read Predict's SVI surface; that's the honest and stronger story.

## 4. Track fit (confirmed against the real problem statements)

- **Primary — Agentic Web → Sub-track 3 (Intent Engine).** Every must-have is met and demonstrable: text→PTB→execution, human-readable preview, guardian catching ≥2 risk classes (SVI staleness + PLP utilization + time-to-resolution), explicit confirm. You are NOT a swap chatbot — you're an intent engine for structured Predict positions with a real guardian.
- **Secondary — DeepBook Predict.** Minimum requirement ("integrate Predict on testnet, work end to end") is met with real `create_manager`/`deposit`/`mint`/`redeem` and a published package.

## 5. THE LOCKED DEMO SCRIPT (5:00 max)

Record exactly this. Every beat is something that actually works.

**[0:00–0:30] Hook — the landing page.**
Show `tistu/index.html`. Say: *"Sophisticated options trading is walled off by knowledge, time, and trust. HELIX is an Intent Engine on DeepBook Predict — you express what you believe, and we compile it into a real on-chain position, guard it, and execute it."*

**[0:30–1:30] The conviction.**
Open the app. Connect your Sui wallet (say "connect your Sui wallet" — NOT zkLogin). Open the Conviction Canvas. Drag sliders: bullish BTC, moderate confidence, ~sub-hour horizon, choppy vol. Show the payoff/probability visualization responding live.

**[1:30–2:30] The compile — real SVI.**
Click compile. Say: *"This is pricing against the live DeepBook Predict BTC oracle — spot around $63,900, implied vol around 37%, read this second from chain."* Show the returned structure in Predict-native words ("an up directional bet" / "a bracketed range"), the payoff curve, the cost in DUSDC.

**[2:30–3:30] The guardian — the Intent Engine differentiator.**
Show the Risk Compass. Say: *"Before you sign, the guardian surfaces risk in plain language."* Point to the ≥2 real risk classes: *"The SVI surface is N seconds old — fresh. PLP utilization is X%. Your position resolves in ~16 minutes — exit liquidity thins near settlement."* Emphasize: *"A swap chatbot can't do this. This is what the Intent Engine track asks for."*

**[3:30–4:15] The signature — the smoking gun.**
Click "Bring it to life." Wallet pops. Sign. Show the success panel with the tx digest. Open Suiscan in a new tab; show the real `PositionMinted` on the live BTC oracle, and the `PredictManager`. Say: *"That's a real position, on testnet, against the real protocol — verifiable right now."*

**[4:15–5:00] The depth + honesty close.**
Switch to My Strategies — the position you just minted appears (real `getOwnedObjects` read). Briefly show Marketplace (fitness leaderboard from real events) and Lineage. Say: *"Breeding and cascading conviction trees are built and tested on-chain as the evolutionary layer — that's our roadmap depth."* Close on the package ID + GitHub. Say: *"Compiler logic and risk guardian are real and tested; hardware TEE attestation is our documented next step. We built the loop that matters, end to end, on real infrastructure."*

**The strongest beat is 3:30–4:15.** If live testnet is shaky on demo day, have a screen-recording of a successful mint + the Suiscan page as a backup slide. The static proof still wins.

## 6. Judge Q&A — honest answers ready

- *"Is the TEE real?"* → Agent logic is real and unit-tested; hardware attestation (Nautilus Nitro) is stubbed with a structurally-correct signed pattern, documented as next step.
- *"How is this different from a swap bot?"* → The guardian layer. We catch SVI staleness, PLP utilization, and resolution-proximity risk in plain language before signing. The Intent Engine track explicitly requires this.
- *"Why not real Greeks?"* → Predict's primitives are binary positions and vertical ranges, which don't have continuous Greeks. We net honest portfolio risk axes instead — directionally correct and not overclaimed.
- *"Did you reinvent the AMM?"* → No. We compose Predict's native PLP vault via `predict::supply`/`mint`. Reinventing it would have been a misunderstanding of the stack.
- *"What's actually on-chain vs off-chain?"* → On-chain: the strategy objects, the mint/redeem, the marketplace listings, the risk object. Off-chain: the compiler (reads live SVI), the guardian computation, the indexer. The authoritative state is always on-chain.
- *"Show me it's real."* → Suiscan link to the mint tx + the published package. Done.

## 7. Remaining work before submission (Phase 8)

Ordered by leverage:

1. **Record the demo video** per §5. This is the single highest-value remaining task.
2. **Backup recording** of the mint + Suiscan page (insurance against live-demo network issues).
3. **README polish** — make it the public face; put the package ID, the Suiscan link, and the demo video at the top.
4. **Pitch deck** — 10 slides; the static Suiscan-proof slide is non-negotiable.
5. **Submit on Deepsurge** — confirm all fields, video link, live demo URL, team info.
6. *(Optional)* write the real Walrus blob id into `StrategyObject.performance_history_blob` — needs a small setter in `strategy.move` (a tested module), so only do it if you re-run the 56 tests after.

## 8. One-sentence identity (for the deck, the README, the pitch)

> *HELIX is an Intent Engine for DeepBook Predict: you express a market conviction in plain language, an AI compiler structures it against the live volatility surface, a risk guardian flags the dangers before you sign, and one confirmation mints a real position on-chain.*
