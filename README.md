# HELIX

### A living marketplace of composable financial convictions, built on Sui.

> Don't build strategies. Express convictions. Watch them live, evolve, and compose.

---

HELIX is the first financial platform where strategies are not tools you construct — they are **living organisms** you bring into existence by expressing what you believe about the market. An AI compiler translates your conviction into an optimal multi-leg structure on DeepBook Predict. That structure becomes a Sui object with its own DNA, heartbeat, and lifecycle. It can chain to other users' convictions, breed with successful strategies, be copied by followers, and adapt as the market regime shifts.

It is not an options platform. It is not a prediction market. It is not a copy-trading app. It is a new category: **conviction-native finance.**

---

## The Document Set

This repository's design is specified across seven documents. Read them in this order:

| Document | What it covers | Read it for |
|---|---|---|
| **[idea.md](./idea.md)** | The concept in plain words, with diagrams | Understanding *what* HELIX is and *why* it matters |
| **[architecture.md](./architecture.md)** | Six-layer system design, object model, data flows | Understanding *how* it's built |
| **[decisions.md](./decisions.md)** | Architecture Decision Records, tradeoffs, edge cases, scalability | Understanding *why* each choice was made over alternatives |
| **[plan.md](./plan.md)** | 8-week backend-first build plan, phase by phase | Understanding *when* each piece gets built |
| **[test.md](./test.md)** | 278 binary checkpoints across all phases | Tracking progress with confidence |
| **[frontend.md](./frontend.md)** | Immersive design language, components, motion | Understanding the *experience* |

Each document cross-references the others. A decision in `decisions.md` points to the system it shapes in `architecture.md`, the week it's built in `plan.md`, and the checkpoint that verifies it in `test.md`.

---

## The Problem

Three walls separate retail traders from sophisticated finance:

1. **The Knowledge Wall** — you must understand options, Greeks, implied volatility surfaces, hedging. Most never get past it.
2. **The Time Wall** — even if you understand it, managing positions is a full-time job.
3. **The Trust Wall** — copy-trading "track records" are unverifiable. Are the gurus actually winning?

HELIX breaks all three: express convictions instead of constructs (the AI handles the technical part), strategies self-adapt (they monitor themselves), and every strategy has verifiable on-chain DNA and lineage (no fake claims). Full treatment in [idea.md](./idea.md).

---

## How It Works (90 seconds)

```
   YOUR CONVICTION          AI COMPILER            LIVING STRATEGY
   ───────────────          ───────────            ───────────────
   "Bullish BTC,      →    Reads SVI surface,  →   A Sui object with
    choppy, ~1 hour"        picks optimal           DNA, a heartbeat,
                            Predict structure,       and a lifecycle.
                            builds the PTB            It trades, adapts,
                                                      and can be...
                                                          │
                          ┌───────────────┬──────────────┼──────────────┐
                          ▼               ▼              ▼              ▼
                       CHAINED         BRED           COPIED        NETTED
                    to other users' with winning   by followers   into one
                    convictions      DNA for        for fees       portfolio
                    (cascading)      offspring                     risk view
```

Five layers, each solving a problem no existing platform solves:

1. **Conviction Canvas** — express beliefs, not legs. The AI compiles.
2. **Cascading Conviction Trees** — chain your strategy to other users' outcomes, cross-user, with undercollateralized credit.
3. **Strategy DNA + Evolutionary Marketplace** — strategies breed, lineages emerge, winning genes propagate.
4. **Greeks Netting Engine** — institutional portfolio-level risk, in retail DeFi, for the first time.
5. **Regime-Adaptive Risk Guardian** — composes with Predict's native PLP liquidity vault and surfaces portfolio risk in plain language before every signature.

Full architecture in [architecture.md](./architecture.md). The reasoning behind each in [decisions.md](./decisions.md).

---

## Built on Research, Not Vibes

Three published papers anchor the live engine; the protocol itself supplies what two earlier papers would have. This is not decoration — each maps to a specific component, and we are explicit about what ships now versus what is roadmap:

| # | Paper | Used for | Status |
|---|---|---|---|
| 7 | Intent-based DeFi (CoW Protocol / Anoma 2025) | The conviction-as-intent paradigm — the spine of the product | **Core** |
| 3 | Deep Learning for Options Trading End-to-End (Tan/Roberts/Zohren, ICAIF 2024) | Mapping a conviction (direction + vol view) to the right structure | **Core** |
| 4 | Gamma/Vega Hedging via Distributional RL (Cao/Hull et al. 2022) | The risk guardian's hedge logic (rule-based in MVP, RL as roadmap) | **Core (MVP-lite)** |
| 1 | Neural Network Correction of IV Surface (Duan, *J. Futures Markets* 2026) | — superseded: Predict's oracle publishes a live SVI surface natively | Roadmap |
| 2 | Bidirectional LSTM Option Pricing (Springer 2026) | — superseded: requires multi-year pooled data that does not yet exist for Sui markets | Roadmap |

**Why two papers are roadmap, not core:** DeepBook Predict's oracle (built with Block Scholes) publishes a live SVI volatility surface via `oracle::OracleSVIUpdated`. HELIX *reads* that surface rather than computing it with neural-corrected Black-Scholes — overclaiming ML the protocol already does for you would fail the judging bar ("unused imports don't count"). Papers 1 and 2 re-enter the critical path only once Sui options accrue enough history to train on.

How each is implemented is detailed in [architecture.md §4](./architecture.md) and defended in [decisions.md](./decisions.md).

---

## Sui Stack Usage

HELIX uses the Sui stack genuinely and pervasively — not as box-ticking:

- **Move object model** — strategies as first-class owned objects with lineage (ADR-001)
- **DeepBook Predict** — `predict::mint` (open binary/range/option positions), `predict::supply` (PLP liquidity), `predict::redeem_permissionless`, per-user `PredictManager` accounts; composes with `deepbook_margin` and `iron_bank` (architecture.md §6)
- **Block Scholes / OracleSVI** — live SVI volatility surface read via `oracle::OracleSVIUpdated`; HELIX reads it, never recomputes it (architecture.md §9.1)
- **dUSDC** — Predict's testnet quote asset (not official USDC); BTC sub-hour rolling oracles
- **Nautilus TEEs** — verifiable AI compiler, hedger, regime classifier, backtester (architecture.md §4)
- **Walrus** — lineage archives, backtest reports, equity curves, TEE attestation storage (architecture.md §8)
- **Seal** — private strategy DNA, premium copy-trade access control (architecture.md §8.3)
- **Pyth** — auxiliary spot price feeds (architecture.md §9.2)
- **zkLogin** — wallet-less onboarding for non-crypto-native users (ADR-007)
- **Programmable Transaction Blocks** — atomic multi-leg deployment and breeding
- **dApp Kit + Sui SDK** — frontend integration (frontend.md §10.4)

---

## Track Fit (Sui Overflow 2026)

Primary submission: **Agentic Web → Sub-track 3: Intent Engine** (Core). HELIX's core loop matches that sub-track's required deliverables almost verbatim, and genuine DeepBook Predict integration makes it a legitimate **DeepBook Predict** (Specialized) submission as well.

**Agentic Web / Intent Engine (Core, PRIMARY).** The sub-track asks for: *"parse a plain-English financial goal, compile it into a Sui PTB, and before signing, run a guardian check that surfaces risks in plain language. The user must explicitly confirm before execution."* HELIX maps to every must-have:

| Sub-track 3 must-have | HELIX component |
|---|---|
| text → PTB → execution flow | Conviction Canvas → AI compiler → DeepBook Predict PTB |
| human-readable PTB preview | Payoff curve + plain-language structure summary before signing |
| guardian catching ≥2 risk classes | Risk Compass: stale SVI feed, liquidity thinning near expiry, concentration, slippage |
| explicit confirmation step | "Bring to life" confirm gate after preview |

The sub-track explicitly warns *"a swap chatbot with no guardian layer is not an intent engine."* HELIX is an intent engine for **structured options positions** with a **real risk guardian** — the exact differentiation they ask for. It also nods to Sub-track 1 (Autonomous Risk Guardian — the auto-hedge with owner override) and Sub-track 2 (Autonomous Agent Wallet — capped, scoped, revocable execution). ✅

**DeepBook Predict (Specialized, secondary).** Minimum requirement: *"integrate the DeepBook Predict contract on testnet; work end to end."* HELIX genuinely uses `predict::mint`, `predict::supply` (PLP), `predict::redeem_permissionless`, and per-user `PredictManager` accounts, priced against the live `OracleSVI` surface in dUSDC. The conviction-compiler is a novel structuring frontend on Predict — adjacent to idea-bank items like the Range-Ladder and PLP+Hedge vaults, but driven by intent rather than fixed policy. ✅

**DeFi & Payments (Core, tertiary).** "Novel prediction markets" and "portfolio allocators" are named in its idea bank; HELIX's intent-compiled structured positions and portfolio-level Greeks netting fit cleanly. Kept as a fallback framing, not the lead. ✅

**Walrus (Specialized, optional).** The Walrus track is now agent-*memory*-focused (MemWal). If pursued, the compiler/guardian agent's regime history and "what management genes survived" would live in MemWal as verifiable long-term memory — a clean fit for the breeding/lineage layer, but explicitly Phase-6 optional. ◻️

The strategy: lead with **Intent Engine** (its must-haves are HELIX's spine and reward the guardian differentiation), prove genuine **Predict** integration end-to-end (the DeepBook team tests the full flow), and keep breeding/lineage/Walrus-memory as upside that doesn't gate the core demo.

---

## Meeting the Judges' Actual Bar

The 2026 judging methodology emphasizes: *demo-first verification, genuine Sui Stack usage in the demo, on-chain verification of real deployment and activity, and an explicitly high bar — "template wrappers, hollow UIs, and unused SDK imports don't count."*

HELIX is engineered to clear that bar by construction:

- **Demo-first:** The entire [plan.md](./plan.md) is backend-first so the demo shows *real* working flows, not mockups. By Phase 5 there is a fully working end-to-end demo (test.md 5.28).
- **Genuine stack usage:** Every Sui primitive listed above does real work in the critical path — not a decorative import. The Greeks netting literally cannot function without DeepBook composability; the compiler literally cannot be trusted without Nautilus attestation.
- **On-chain verification:** Strategies are real objects with real DeepBook orders (test.md 2.25–2.29). Package IDs and activity will be verifiable on Sui Explorer.
- **No hollow UI:** [frontend.md](./frontend.md) specifies an immersive experience, but every screen is wired to real backend services by Phase 5 (test.md Phase 5 checkpoints). The beauty sits on top of working substance.

The official scoring weights — 50% Real-World Application, 20% Product & UX, 20% Technical Implementation, 10% Presentation & Vision — are addressed systematically in [decisions.md](./decisions.md) "Why This Wins" and [plan.md](./plan.md) Phase 8.

---

## Repository Structure (Target)

```
helix/
├── README.md                  ← you are here
├── docs/
│   ├── idea.md
│   ├── architecture.md
│   ├── decisions.md
│   ├── plan.md
│   ├── test.md
│   └── frontend.md
├── contracts/                 ← Move modules (architecture.md §3)
│   ├── sources/
│   └── tests/
├── tee/                       ← Nautilus TEE agents (architecture.md §4)
│   ├── compiler/
│   ├── hedger/
│   ├── regime/
│   └── backtest/
├── services/                  ← Indexer, WebSocket hub, notifications
│   ├── indexer/
│   └── ws-hub/
└── web/                       ← Next.js frontend (frontend.md)
    ├── app/
    ├── components/
    └── lib/
```

---

## Status

This is the **design and planning phase**. All seven documents are complete. Implementation follows the sequence in [plan.md](./plan.md), tracked against the 278 checkpoints in [test.md](./test.md).

Next action: Phase 0 setup (plan.md), then Phase 1 on-chain core.

---

## One-Sentence Summary

*HELIX makes sophisticated finance conversational — you express what you believe, an AI brings it to life as a living on-chain organism, and a public marketplace of conviction lineages emerges from the bottom up.*

---

*The first platform where finance becomes biology.*
