# 🧬 HELIX

### A Living Ecosystem of Composable Financial Convictions on Sui

---

[![Sui Overflow 2026](https://img.shields.io/badge/Sui%20Overflow-2026-blueviolet?style=for-the-badge&logo=sui)](https://overflow.sui.io)
[![Track](https://img.shields.io/badge/Track-Agentic%20Web%20%2F%20Intent%20Engine-brightgreen?style=for-the-badge)](https://overflow.sui.io)
[![Sui Stack](https://img.shields.io/badge/Sui%20Stack-DeepBook%20%7C%20Walrus%20%7C%20Nautilus%20TEE-aqua?style=for-the-badge)](https://sui.io)
[![Status](https://img.shields.io/badge/Status-Production%20%26%20Deployed-brightgreen?style=for-the-badge)](./docs/SUBMISSION.md)

> [!IMPORTANT]
> **Don't build strategies. Express convictions. Watch them live, evolve, and compose.**
> HELIX is not an options platform. It is not a prediction market. It is not a copy-trading app. It is a new category: **conviction-native finance.**

---

### 🚀 Live URLs

```text
┌────────────────┬─────────────────────────────────────┬──────────────────────────────────────────────────────────┐
│                │                 URL                 │                          Status                          │
├────────────────┼─────────────────────────────────────┼──────────────────────────────────────────────────────────┤
│ App (frontend) │ https://helix-app-fovn.onrender.com │ HTTP 200 — landing + /app.html                           │
├────────────────┼─────────────────────────────────────┼──────────────────────────────────────────────────────────┤
│ Compiler (TEE) │ https://helix-compiler.onrender.com │ /health ok, warm /compile 1.15s against real testnet SVI │
└────────────────┴─────────────────────────────────────┴──────────────────────────────────────────────────────────┘
```

* **On-Chain Package (Sui Testnet):** `0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3`
* **Real Walrus Testnet Blob:** `QE8njhhplCR8s6UHqjS8SBsQ6SO7AxyNZqI6CoBvmX4`

---

## 📑 The Document Set

The design and planning of the HELIX platform are systematically organized under the [docs/](file:///home/hash/helix/docs/) folder. Read them in the following order:

| Document | Focus | Purpose |
| :--- | :--- | :--- |
| 📋 **[SUBMISSION.md](file:///home/hash/helix/docs/SUBMISSION.md)** | **Honest Submission Proof** | Verdict, locked demo script, Q&A, and live deployment details. |
| 💡 **[idea.md](file:///home/hash/helix/docs/idea.md)** | Concept & Vision | High-level overview, user stories, and conceptual diagrams. |
| 🏗️ **[architecture.md](file:///home/hash/helix/docs/architecture.md)** | System Architecture | Six-layer design, Move contracts object model, and TEE data flows. |
| ⚖️ **[decisions.md](file:///home/hash/helix/docs/decisions.md)** | Tradeoffs & ADRs | Architectural Decision Records explaining the *why* behind design choices. |
| 📅 **[plan.md](file:///home/hash/helix/docs/plan.md)** | 8-Week Build Plan | Phase-by-phase backend-first build schedule. |
| 🧪 **[test.md](file:///home/hash/helix/docs/test.md)** | Binary Checkpoints | 278 verifiable test checkpoints for incremental progress tracking. |
| 🎨 **[DESIGN.md](file:///home/hash/helix/tistu/DESIGN.md)** | UI & Visual Design | High-fidelity UI layouts, bioluminescent theme, and motion specs. |

> [!NOTE]
> Each document is fully cross-referenced. A decision in [decisions.md](file:///home/hash/helix/docs/decisions.md) maps to a system component in [architecture.md](file:///home/hash/helix/docs/architecture.md), a build phase in [plan.md](file:///home/hash/helix/docs/plan.md), and a verification checkpoint in [test.md](file:///home/hash/helix/docs/test.md).

---

## ⚠️ The Problem

Three major walls separate retail traders from sophisticated finance:

1. 🧱 **The Knowledge Wall** — Sophisticated trading requires understanding options, Greeks, implied volatility surfaces, and hedging. Most retail users never get past this barrier.
2. 🧱 **The Time Wall** — Managing and adjusting derivative positions is a full-time job. Markets shift constantly, demanding continuous manual intervention.
3. 🧱 **The Trust Wall** — Copy-trading platforms are built on trust-based, easily manipulated, or unverifiable historical records.

### How HELIX Breaks the Walls:
* **Express Convictions, Not Constructs**: The user interacts with high-level views; the AI compiles the underlying legs.
* **Living & Self-Adapting**: Strategies are independent on-chain agents that monitor themselves and react to regime changes.
* **On-Chain Verifiable Lineage**: Every strategy is backed by a cryptographic TEE attestation and has verifiable on-chain DNA.

---

## ⚙️ How It Works

```text
┌─────────────────┐       ┌─────────────┐       ┌─────────────────┐
│ YOUR CONVICTION │ ────> │ AI COMPILER │ ────> │ LIVING STRATEGY │
└─────────────────┘       └─────────────┘       └────────┬────────┘
  "Bullish BTC,             Reads SVI surface,           │ A Sui object with
   choppy, ~1 hour"         picks optimal structure,     │ DNA, a heartbeat,
                            builds the PTB               │ and a lifecycle.
                                                          ▼
                                        ┌─────────────────┴─────────────────┐
                                        │  WHAT IT CAN DO ONCE DEPLOYED:    │
                                        ├───────────────────────────────────┤
                                        │ 🔗 CHAINED to other convictions    │
                                        │ 🧬 BRED with winning DNA          │
                                        │ 👥 COPIED by followers for fees   │
                                        │ 📈 NETTED into one portfolio view │
                                        └───────────────────────────────────┘
```

Five layers, each solving a problem no existing platform solves:

1. **🔮 Conviction Canvas** — Express beliefs (direction, confidence, volatility, time), not individual legs. The AI compiles them.
2. **🌳 Cascading Conviction Trees** — Chain your strategy to other users' outcomes cross-user with undercollateralized credit.
3. **🧬 Strategy DNA & Evolutionary Marketplace** — Strategies breed, lineages emerge, and winning genes propagate.
4. **📊 Greeks Netting Engine** — Institutional portfolio-level risk management in retail DeFi for the first time.
5. **🛡️ Regime-Adaptive Risk Guardian** — Composes with Predict's native PLP liquidity vault and surfaces portfolio risk in plain language before signing.

---

## 🔬 Built on Research, Not Vibes

The HELIX protocol relies on academic rigor rather than marketing claims. Three published papers anchor the live engine, and we are transparent about what is in our core MVP vs. what is on the roadmap:

| # | Academic Paper Reference | Core Application in HELIX | Implementation Status |
| :---: | :--- | :--- | :--- |
| **7** | *Intent-based DeFi* (CoW Protocol / Anoma 2025) | The conviction-as-intent paradigm: the core spine of the product. | 🟢 **Core MVP** |
| **3** | *Deep Learning for Options Trading End-to-End* (Tan/Roberts/Zohren, ICAIF 2024) | Mapping user conviction (directional + volatility bias) to the optimal structure. | 🟢 **Core MVP** |
| **4** | *Gamma/Vega Hedging via Distributional RL* (Cao/Hull et al. 2022) | Risk Guardian auto-hedging logic (rule-based in MVP, RL-guided in V2). | 🟡 **Core (MVP-lite)** |
| **1** | *Neural Network Correction of IV Surface* (Duan, J. Futures Markets 2026) | Modifying Implied Volatility surface logic (superseded by Predict's native SVI). | 🔵 **Roadmap** |
| **2** | *Bidirectional LSTM Option Pricing* (Springer 2026) | Long short-term memory option pricing (requires historical data not yet on Sui). | 🔵 **Roadmap** |

> [!NOTE]
> **Why Papers 1 & 2 are deferred to the roadmap:** DeepBook Predict's oracle (developed with Block Scholes) publishes a live SVI volatility surface natively via `oracle::OracleSVIUpdated`. HELIX reads this surface directly rather than recomputing it via an off-chain neural net. This avoids redundant ML processing and ensures we don't include unused imports or hollow code, respecting the Overflow judging guidelines.

---

## 🛠️ Sui Stack Integration

HELIX is built natively for the Sui blockchain, leveraging its unique features to enable experiences impossible on legacy chains:

* **Move Object Model**: Strategies live as first-class, owned objects on-chain. This enables parallelized transactions and native lineage tracking ([decisions.md](file:///home/hash/helix/docs/decisions.md) ADR-001).
* **DeepBook Predict & Margin**: Composes with `predict::mint` for position minting, `predict::supply` for PLP liquidity provision, and `predict::redeem_permissionless` via a dedicated user `PredictManager`.
* **Block Scholes / OracleSVI**: Integrates with Sui's native volatility surface feed to price and hedge positions.
* **dUSDC**: Utilized as the default quote asset on Predict's testnet.
* **Nautilus TEEs**: Verifiable compute environments for the AI compiler, risk hedger, regime classifier, and backtester ([architecture.md](file:///home/hash/helix/docs/architecture.md) §4).
* **Walrus**: Low-cost decentralized storage for strategy lineage logs, historical backtests, and TEE attestation verifications.
* **Seal**: Used to encrypt private strategy DNA configurations and govern access control for premium copy-trading.
* **Pyth Network**: Oracle price feeds for secondary spot pricing verification.
* **zkLogin**: Seamless Web2-style onboarding for retail users.
* **Programmable Transaction Blocks (PTBs)**: Atomic, single-transaction deployments of complex multi-leg positions and strategy breeding.
* **dApp Kit & Sui SDK**: Seamless client-side integration and transaction signing.

---

## 🎯 Track Fit & Hackathon Alignment

### 🥇 Primary Focus: Agentic Web → Sub-track 3: Intent Engine (Core)
The sub-track requirements align perfectly with HELIX's design:
> *"Parse a plain-English financial goal, compile it into a Sui PTB, and before signing, run a guardian check that surfaces risks in plain language. The user must explicitly confirm before execution."*

| Intent Engine Deliverable | HELIX Implementation | Status |
| :--- | :--- | :---: |
| **Natural Conviction Parsing** | Conviction Canvas gathers beliefs and compiles them. | ✅ Yes |
| **Human-Readable PTB Preview** | Payoff curves and clear, jargon-free summary before signing. | ✅ Yes |
| **Dual Risk Class Guardian** | Risk Compass checks: stale SVI, thin liquidity, over-concentration, high slippage. | ✅ Yes |
| **Explicit Consent Gate** | "Bring to Life" confirmation modal displaying risk metrics. | ✅ Yes |

> [!TIP]
> HELIX is a true intent engine. It does not just wrapper a basic swap; it manages complex, multi-leg derivative positions with an active, automated risk-guardian layer.

### 🥈 Specialized Track: DeepBook Predict (Secondary)
Integrates the DeepBook Predict contract on testnet end-to-end. HELIX utilizes `predict::mint`, `predict::supply` (PLP), and `PredictManager` accounts, executing trades directly against the live `OracleSVI` volatility surface in `dUSDC`.

### 🥉 DeFi & Payments (Tertiary)
Applies portfolio Greeks netting, intent-compiled structured positions, and asset allocation concepts matching the DeFi track's idea bank.

---

## ⚖️ Meeting the Judges' Actual Bar

To satisfy the strict 2026 Overflow judging criteria (*demo-first verification, genuine stack usage, verifiable activity, and no hollow UIs*), HELIX is built to the following standards:

* **Demo-First Progression**: Our [plan.md](file:///home/hash/helix/docs/plan.md) is structured backend-first. By Phase 5, we have a fully testable CLI and end-to-end integration ([test.md](file:///home/hash/helix/docs/test.md) checkpoint 5.28) before the UI is completed.
* **No Hollow Code**: Every Sui primitive listed in our stack usage has a critical, functional role in the protocol's execution path.
* **On-Chain Footprint**: Deployed strategies are actual objects that execute verifiable orders on DeepBook Predict.
* **Production-Grade Frontends**: Our design dictates a beautiful interface, and all components are backed by real APIs and indexers — not client-side mocks.

---

## 📂 Repository Directory Layout

```text
helix/
├── README.md                  ← You are here
├── .gitignore                 ← Git exclusion rules
├── vercel.json                ← Vercel deployment spec
├── render.yaml                ← Render blueprint spec
├── contracts/                 ← Sui Move Smart Contracts
│   ├── sources/
│   │   ├── strategy.move
│   │   ├── dna.move
│   │   ├── breeding.move
│   │   └── ...
│   └── tests/
├── docs/                      ← Project Planning & Technical Specs
│   ├── SUBMISSION.md          ← Honest submission proof & Q&A
│   ├── architecture.md        ← Technical architecture specs
│   ├── decisions.md           ← Architectural Decision Records (ADRs)
│   ├── idea.md                ← High-level conceptual overview
│   ├── plan.md                ← 8-week build schedule
│   └── test.md                ← 278 binary verification checkpoints
├── tee/                       ← Nautilus TEE Agent Services
│   ├── src/
│   │   ├── compiler/          ← AI Conviction Compiler
│   │   ├── hedger/            ← Auto-hedging loop
│   │   ├── regime/            ← Volatility regime classifier
│   │   └── backtest/          ← Historical performance testing
│   └── test/                  ← TEE Agent tests (20/20 green)
├── services/                  ← Off-chain indexers and APIs
│   └── indexer/               ← Sui Event Indexer & WS hub
└── tistu/                     ← Deployed Vercel Web Frontend
    ├── app.html               ← App shell Entrypoint
    ├── index.html             ← Landing Page Entrypoint
    ├── DESIGN.md              ← UI visual design spec
    ├── css/
    └── js/
```

---

## 🚦 Project Status

This repository has completed **Phase 5 (Backend Integration)**.
* Move smart contracts are published to testnet.
* Nautilus TEE Agent Services are deployed and running on Render.
* Frontend Web App is deployed and running on Vercel, querying the live compiler and wallet Standard.

Next Steps: Record the final submission demo video and finalize the pitch deck.

---

### 🧬 One-Sentence Summary
*HELIX makes sophisticated finance conversational — you express what you believe, an AI brings it to life as a living on-chain organism, and a public marketplace of conviction lineages emerges from the bottom up.*

> **The first platform where finance becomes biology.**
