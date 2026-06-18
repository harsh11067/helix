# HELIX — Build Progress (Phases 0–3)

Verification status against `test.md`. Run from repo root:

```bash
# Move contracts (Phase 1 + 2)
cd contracts && PATH="$HOME/.local/bin:$PATH" sui move test            # 56 pass
PATH="$HOME/.local/bin:$PATH" sui move test --coverage && sui move coverage summary  # 87.4%

# TEE agents (Phase 3)
cd tee && node --test test/*.test.ts                                   # 20 pass

# Indexer (Phase 3)
cd services/indexer && pnpm install && node --test test/*.test.ts      # 7 pass
```

Toolchain: `sui 1.73.0` (testnet) installed to `~/.local/bin`; Node 24 runs TypeScript via native type-stripping (no build step).

---

## Phase 0 — Foundation
- [x] 0.1 Sui CLI installed (`sui 1.73.0`)
- [x] 0.4 `sui move build` succeeds
- [x] 0.5 Node ≥ 20 (v24)
- [x] 0.8 Monorepo structure: `contracts/`, `tee/`, `services/`, `tistu/` (frontend)
- [x] 0.10 Planning docs present
- [~] 0.2 / 0.2b / 0.3 / 0.7 — testnet wallet auto-created on build; **dUSDC faucet, local validator, Docker Postgres** not provisioned in this environment (external infra)

## Phase 1 — On-chain Core ✅ (56 Move tests, 87.4% coverage)
All checkpoints 1.1–1.23 pass. Modules: `dna`, `strategy`, `portfolio_risk`,
`access_control`, `events`, `signed`. 1.11 (CLI event subscribe) and 1.19/1.18
(cap non-copyability) are verified by design + emitted-event assertions; the
runtime suite proves emission counts and capability gating.

## Phase 2 — On-chain Advanced ✅ (included in the 56 Move tests)
Checkpoints 2.1–2.23, 2.30–2.37 pass locally. Modules: `breeding`,
`conviction_tree`, `marketplace`, `leg_factory`, `predict_adapter`,
`mock_predict`, plus `compiler_bridge`/`hedger_bridge`/`walrus_adapter`/`compose_adapter`.

- **2.24–2.29 (live testnet Predict):** the DeepBook Predict integration is built
  behind `predict_adapter` against a faithful local `mock_predict` stand-in
  (ADR-003). The wrapper logic — mint, supply, redeem, PredictManager, position
  binding — is fully exercised. The real `predict-testnet-4-16` package + dUSDC
  faucet are a switchover that needs a published package id and testnet funds
  (external infra), so those four checkpoints are **green locally / pending on testnet**.

## Phase 3 — Off-chain Compute ✅ (20 TEE + 7 Indexer tests)
- **Compiler Agent** (3.1–3.11): reads mock SVI surface, enumerates ≥5 structures,
  alignment-driven Pareto selection, generates DNA + PTB spec + MOCK_TEE
  attestation, `POST /compile` p95 ≪ 5 s.
- **Hedging Agent** (3.12–3.17): net Greeks, breach detection, delta hedge PTB.
- **Regime Classifier** (3.18–3.21): 4-regime classification + change/notify.
- **Backtest Engine** (3.22–3.26): deterministic sim, Sharpe/maxDD/winRate/PF,
  equity curve to mock Walrus.
- **Indexer** (3.27–3.32): read-models, leaderboard, lineage, live WebSocket.
- 3.36 mock-TEE flag honored; `verify()` mirrors `compiler_bridge::verify`.

**Pending on external infra (documented, not blocking local verification):**
3.3/3.27 real Pyth/Sui RPC reads, 3.8/3.10/3.35 on-chain PTB execution + on-chain
attestation verification, 3.9/3.17 real Nautilus Nitro enclave, 3.23/3.26 real
Walrus. These follow the plan's explicit mock-first strategy and switch over with
a published package id + testnet credentials.

---

## Frontend — dApp in `tistu/` (design source = tistu, not frontend.md)

Landing `tistu/index.html` is **untouched** (design source of truth). The product
is a new vanilla SPA reusing `tistu/css/helix.css` tokens + tistu's cursor /
reveal / boot / theme patterns:

- `tistu/app.html` — entry; `tistu/css/app.css` — shell styles; `tistu/js/app.js` — SPA.
- Views (hash-routed): **Conviction Canvas** (live payoff + greeks, mirrors the
  TEE compiler output shape and pings :8081 for a live agent), **My Strategies**,
  **Strategy Detail** (DNA grid, payoff, equity curve, lineage, copy/breed),
  **Risk Compass** (Greeks radar + guardian), **Marketplace** (fitness
  leaderboard), **Lineage** (generational family tree).
- Verified: all six routes render with zero JS errors (jsdom smoke) and
  `node --check` passes. Open `tistu/app.html`; to serve: `npx serve tistu`.
- To link the landing's "Open App" button, point its href at `app.html`
  (left unchanged to honor the "keep tistu as-is" constraint).
