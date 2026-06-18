# HELIX — Build Plan

> An 8-week build plan optimized for backend-first development with independent testability before frontend wiring.

---

## Guiding Principles

**1. Backend before frontend.** On-chain modules and TEE workloads are built first, with comprehensive unit + integration tests, before any frontend work begins. This means the frontend is built against a *working, testable* backend — not a moving target.

**2. Mockable interfaces.** Every off-chain service exposes a typed API that can be mocked. The frontend can develop against fixtures while real backend evolves. When you flip the mock flag, the frontend connects to the real thing.

**3. Vertical slices over horizontal layers.** Each week ships a complete end-to-end feature (however small), not a half-built layer. By Week 3 you have *something* working end-to-end. By Week 8 you have everything working end-to-end.

**4. Checkpoint discipline.** Every phase has explicit verification criteria in test.md. You do not advance until checkpoints pass. This prevents the "almost done" trap that kills hackathon submissions.

**5. Demo-driven development.** The final demo flow is designed in Week 1. Every feature built is justified by "does this make the demo better?" — kills scope creep.

---

## THE ONE THING (read this before anything else)

If you build only one thing and ship nothing else, build this loop, end-to-end, on testnet:

> **Conviction Canvas → AI compiles to a DeepBook Predict structure → human-readable preview + Risk Guardian flags ≥2 risks in plain language → explicit confirm → `predict::mint` executes → position visible in the user's `PredictManager` → on-chain activity log.**

That loop, and nothing else, satisfies every must-have of the primary track (Agentic Web → Intent Engine) AND the DeepBook Predict minimum requirement ("integrate Predict on testnet; work end to end"). It is the entire score floor.

Everything below — cascading conviction trees, behavioral-gene breeding, lineage visualization, copy marketplace, Walrus agent-memory — is **upside that must never delay or endanger the loop above.** If a week is slipping, you cut from the bottom of that list, never from the loop. The #1 way this project loses is by spreading across all five layers and shipping none of them to a demoable finish. Protect the loop.

| Layer | Status | Cut order if behind |
|---|---|---|
| Conviction Canvas → compile → guardian → confirm → mint loop | **CORE — never cut** | — |
| Risk Compass (Greeks netting, ≥2 guardian classes) | **CORE — never cut** | — |
| zkLogin onboarding | High value | keep if possible |
| Copy marketplace | Upside | cut 4th |
| Cascading conviction trees | Upside | cut 3rd |
| Behavioral-gene breeding + lineage | Upside | cut 2nd |
| Walrus agent-memory | Upside | cut 1st |

---

## Phase 0 — Pre-Build Foundation (Days 1-3)

**Goal:** Set up infrastructure, decide architecture finals, lock the demo script.

### Tasks
- Create Sui testnet wallet, get testnet SUI from faucet
- Set up GitHub repo with proper structure (contracts/, tee/, services/, web/, docs/)
- Configure Move toolchain (sui CLI, move analyzer)
- Set up Node.js workspace for TEE agents (TypeScript + Nautilus SDK)
- Set up Next.js scaffold for frontend
- Set up PostgreSQL for indexer (Docker compose locally)
- Lock the demo script (5-minute video): exact flow that will be shown to judges
- Create initial idea.md, architecture.md, plan.md, test.md, frontend.md
- Set up project tracking (Linear or GitHub Projects)

### Deliverables
- Empty but properly configured monorepo
- Running local dev environment (everything `make dev` away from booting)
- Demo script locked
- All five planning docs created

### Why This Matters
Most hackathon teams skip this and pay for it in week 4 when their tooling breaks. Three days of upfront discipline saves seven days of chaos later.

---

## Phase 1 — On-Chain Core (Week 1)

**Goal:** Implement the foundational Move modules with full test coverage. By end of Week 1, the chain can hold strategies, but they don't trade yet.

### Modules to Build

**`dna.move`**
- StrategyDNA struct definition (all genes)
- Serialization / deserialization
- DNA validation helpers
- DNA equality and similarity functions
- Tests: round-trip serialize, validate boundaries

**`strategy.move`**
- StrategyObject struct
- `create_strategy(dna, capital, attestation, ctx)` entry function
- `close_strategy(strategy, ctx)` entry function
- `update_pnl(strategy, new_pnl)` internal function
- `mark_dead(strategy)` internal function
- Events: StrategyCreated, StrategyClosed, StrategyDied
- Tests: create, close, lifecycle transitions, access control

**`portfolio_risk.move`**
- PortfolioRiskObject struct
- `init_portfolio(owner, ctx)` entry function
- `add_strategy_to_portfolio(portfolio, strategy_id)` entry function
- `remove_strategy_from_portfolio(portfolio, strategy_id)` entry function
- `update_greeks(portfolio, greeks_vector, attestation)` entry function (called by Hedger TEE)
- Tests: portfolio creation, strategy addition, Greeks update

**`access_control.move`**
- Capability definitions (StrategyOwnerCap, BreederCap, HedgerCap)
- Authorization helpers
- Tests: cap creation, cap transfer, unauthorized rejection

### Verification at End of Week 1
All Phase 1 checkpoints in test.md pass. Local sui-test-validator can create strategies, close them, manage portfolios. No DeepBook integration yet.

### Demo State
Not demoable yet. Internal milestone only.

---

## Phase 2 — On-Chain Advanced (Week 2)

**Goal:** Add breeding, cascading conviction trees, marketplace, and DeepBook integration. By end of Week 2, strategies can be created with real DeepBook orders.

### Modules to Build

**`breeding.move`**
- `breed(parent_a, parent_b, fee, ctx)` entry function
- Crossover logic (random gene splice points)
- Mutation logic (small random perturbations)
- BreedingEvent emission
- Royalty configuration storage
- Tests: breed two strategies, verify child DNA is valid mix, verify royalties registered

**`conviction_tree.move`**
- ConvictionTreeNode struct
- `link_to_parent(child_strategy, parent_strategy, condition, collateral)` entry function
- `evaluate_condition(node, current_state) -> bool` helper
- `activate_node(node, ctx)` entry function (called when condition met)
- `cascade_failure(parent_node)` helper (returns collateral when parent fails)
- Tests: build a 3-level tree, simulate parent resolution, verify cascade

**`marketplace.move`**
- `list_as_breedable(strategy, breed_fee, ctx)` entry function
- `list_as_copyable(strategy, copy_fee_bps, ctx)` entry function
- `copy_strategy(original, capital, ctx) -> derived_strategy` entry function
- CopyRelationship tracking
- Fee distribution logic
- Tests: list, copy, verify fees flow correctly

**`predict_adapter.move`**
- Wrappers around `predict::mint` (open binary/range/option positions)
- Wrappers around `predict::supply` (PLP deposit) and `predict::redeem_permissionless` (settle)
- `PredictManager` creation + per-user account handling
- Optional composition wrappers for `deepbook_margin` and `iron_bank` (mainnet)
- `place_leg(leg_spec, ctx) -> leg_object` helper
- Tests: mint a position on testnet via wrapper, verify `PredictManager` updated, redeem after settlement

**`leg_factory.move`**
- `create_call_leg(params)`, `create_put_leg(params)`, `create_spot_leg(params)`, etc.
- Bundling: `create_strategy_legs(structure_spec) -> vector<leg_id>`
- Tests: factory creates correct leg objects

### Verification at End of Week 2
A test script can create a strategy with real DeepBook orders, link it to a parent, observe cascade behavior, breed two strategies, copy a strategy. All on-chain. No off-chain components yet.

### Demo State
Not demoable to judges yet, but full backend works in CLI. Internal milestone.

---

## Phase 3 — Off-Chain Verifiable Compute (Week 3)

**Goal:** Build the four Nautilus TEE agents. By end of Week 3, full strategy lifecycle works: user conviction → AI compile → on-chain deploy → live trading → auto-hedge.

### TEE Workloads to Build

**Compiler Agent** (Highest Priority)
- TypeScript / Node.js running in AWS Nitro Enclave
- Reads conviction input
- Reads the live SVI surface from `oracle::OracleSVIUpdated` (mock during dev, real testnet before final) — does NOT recompute pricing
- Pulls spot prices from Pyth (auxiliary)
- Pulls PLP utilization + Predict market state
- Applies Paper 3's conviction→structure mapping (momentum / mean-reversion features) to pick the structure shape
- Enumerates candidate structures (binary, range, call, put, spread) minted via `predict::mint`
- Pareto-selects optimal structure against the SVI surface
- Generates StrategyDNA (structure genes from this compile; behavioral genes default or user-set)
- NOTE: Paper 1 (neural IV correction) and Paper 2 (LSTM pricing) are roadmap-only — the protocol's SVI oracle supersedes them and the training data does not yet exist (see decisions.md ADR-010)
- Generates PTB specification
- Signs attestation with TEE key
- Exposes HTTP API: `POST /compile`
- Tests: compile against known convictions, verify outputs are sensible

**Hedging Agent**
- Subscribes to Sui events (strategy creation, oracle updates)
- Computes Greeks for all active strategies in monitored portfolios
- Compares to tolerances
- When breached: generates hedge PTB
- Implements Paper 4's D4PG distributional RL (start with simple delta-hedge logic Week 3, full RL Week 5 if time)
- Tests: simulate Greek breach, verify hedge generated

**Regime Classifier**
- Periodic batch job (every 5 minutes)
- Reads IV surface, spot prices, volume data
- Computes regime features
- Classifies into 4 regimes
- Emits regime change events
- Tests: feed known regimes, verify classification

**Backtest Engine**
- HTTP API: `POST /backtest` with DNA + date range
- Pulls historical data from Walrus
- Simulates strategy
- Returns performance report
- Tests: backtest a known DNA, verify results stable

### Indexer Service (Also Week 3)
- Listens to Sui events from HELIX modules
- Maintains PostgreSQL read-models:
  - `strategies` table (denormalized strategy data)
  - `lineage_edges` table (parent-child relationships)
  - `copy_relationships`, `breeding_events`
  - `performance_snapshots` (time-series)
- HTTP API for querying read-models
- Tests: emit events, verify indexer captures them

### Verification at End of Week 3
End-to-end flow works in CLI:
1. POST conviction → receive compiled strategy plan + attestation
2. Submit PTB → strategy deployed on-chain
3. Mock market move → hedger detects + generates hedge
4. Query indexer → see strategy in leaderboard
5. Backtest some DNA → receive performance report

### Demo State
You have a working backend. The demo at this point is a Postman / curl demonstration. Not impressive yet to judges, but the engine runs.

---

## Phase 4 — Frontend Foundation (Week 4)

**Goal:** Build the frontend skeleton with mocked backend. By end of Week 4, the UI looks beautiful and all major screens are navigable, but data is mocked.

### Frontend Components to Build

**Design System Setup**
- Implement design tokens from frontend.md (colors, typography, spacing, motion)
- Set up Tailwind config with custom theme
- Create base components: Button, Card, Input, Slider, Modal, Toast
- Set up animation primitives with Motion library
- Build the custom cursor follow system
- Build the preloader animation (the "initializing..." sequence)

**Layout Shell**
- Top nav with wallet connect (zkLogin support)
- Side rail for primary navigation
- Footer
- Page transition orchestration

**Five Core Screens (mocked data)**

1. **Landing Page** — hero with the HELIX visual identity, narrative scroll-through explaining the platform
2. **Conviction Canvas** — the drag-and-drop conviction expression interface (mocked compile responses)
3. **My Strategies** — list of user's deployed strategies with status indicators
4. **Strategy Detail** — full view of a single strategy: DNA, payoff curve, equity curve, lineage, copy/breed options
5. **Lineage Tree** — force-directed graph visualization of strategy ancestry
6. **Risk Compass** — radar chart + portfolio risk view
7. **Marketplace** — browse copyable / breedable strategies, leaderboard

### Verification at End of Week 4
- Frontend builds cleanly
- All screens render with mocked data
- All animations work smoothly (60fps target)
- The visual quality is comparable to overflow.sui.io
- A non-technical viewer can navigate the entire flow with placeholders

### Demo State
You have a beautiful "click-through" demo. Not connected to chain yet, but visually 95% of the final product.

---

## Phase 5 — Backend Wiring (Week 5)

**Goal:** Connect the frontend to real backend services. Real strategies, real on-chain transactions.

### Integration Work

**Wallet Integration**
- Wire zkLogin flow (Google/Apple sign-in → Sui address)
- Wire @mysten/dapp-kit for transaction signing
- Wire PTB construction helpers

**Conviction Canvas → Compiler**
- Replace mock with real POST /compile
- Add loading states ("AI is thinking..." with the helix animation)
- Add error handling (TEE down, oracle stale)
- Real payoff curve renders from compiler output

**Deploy → Chain**
- Construct deployment PTB on frontend
- Submit via wallet
- Show transaction status (pending, confirmed, failed)
- Redirect to strategy detail page

**Indexer Integration**
- Replace mocked strategy lists with real indexer queries
- Implement WebSocket subscription for live updates
- Wire leaderboards to indexer

**Walrus Storage**
- Upload backtest blobs
- Upload performance history blobs
- Wire blob fetch on strategy detail page

### Risk Compass Implementation
- Real-time WebSocket subscription to Hedger's Greeks updates
- Radar chart updates live
- Tolerance breach notifications

### Verification at End of Week 5
A user can:
- Connect wallet via zkLogin
- Express a conviction
- See real AI-compiled strategy
- Deploy it (real transaction on testnet)
- See it appear in their strategies list
- Watch the Risk Compass update as oracle moves
- Receive a notification if tolerance is breached

### Demo State
First fully working end-to-end demo. Could submit at this point in a pinch. But 3 more weeks of polish ahead.

---

## Phase 6 — Advanced Features (Week 6)

**Goal:** Bring the wow factors online: cascading trees, breeding mechanics, AI advisor mode.

### Features to Build

**Cascading Conviction Trees**
- UI for "Chain this strategy to another"
- Browse other users' strategies as potential parents
- Condition builder (price thresholds, outcome dependencies, composite logic)
- Lineage tree shows cross-user dependencies
- Real-time visualization of cascade activations

**Breeding Marketplace**
- "Mark as Breedable" toggle on strategy detail
- Browse breedable strategies (filter by performance, lineage, DNA traits)
- Breed dialog: select two parents, preview likely child traits
- Pay breeding fee
- Child strategy created with mixed DNA
- Royalty earnings dashboard for parent creators

**AI Advisor Mode**
- Optional toggle for "Let AI suggest convictions for me"
- Reads current market regime
- Suggests 3-5 conviction templates appropriate for the regime
- "High volatility detected, here are 5 vol-selling strategies others have profited from"

**Improved Lineage Visualization**
- Zoom and pan
- Filter by generation, fitness, regime
- "Time machine" mode: scrub through generations to watch ecosystem evolve
- Click any node to inspect its full lineage and offspring

### Verification at End of Week 6
All advanced features work. The visual ecosystem map looks alive — strategies pulsing, dying, breeding in real-time.

### Demo State
Looks like a finished product. Ready for demo day in a pinch.

---

## Phase 7 — Polish & Performance (Week 7)

**Goal:** Sand every rough edge. Optimize performance. Add the details that separate "good" from "remember-this-forever."

### Polish Tasks

**Animation Refinement**
- Audit every transition (page changes, state changes, hover states)
- Add micro-interactions that delight (button hover, slider drags, card flips)
- Orchestrate page-load reveals (staggered animations on first paint)
- Refine the preloader sequence

**Empty States and Edge Cases**
- "No strategies yet" with helpful prompts
- Loading states with helix-themed animations
- Error states that don't break the immersion
- Onboarding tutorial overlay (skippable)

**Performance Optimization**
- Lighthouse audit: target 90+ on all metrics
- Lazy-load heavy components (Three.js scenes, large lineage trees)
- Memo expensive renders
- WebSocket reconnection logic with exponential backoff
- Image optimization (Next.js Image component, WebP)

**Accessibility**
- Keyboard navigation throughout
- ARIA labels on custom components
- Focus management
- Screen reader compatibility for non-visual core flows

**Mobile Responsiveness**
- Conviction Canvas mobile layout (vertical sliders instead of drag)
- Lineage tree mobile view (zoomable)
- Risk Compass mobile (simplified to key metrics)
- All forms touch-friendly

**Copy and Microcopy**
- Every label, button, tooltip reviewed
- Voice and tone consistent
- Empty state copy is helpful, not just placeholder
- Error messages explain what to do, not just what went wrong

### Verification at End of Week 7
The product feels "shipped." Hackathon judges will see something polished, not prototype.

### Demo State
Better than most YC startup MVPs. Ready for primetime.

---

## Phase 8 — Demo Prep & Submission (Week 8)

**Goal:** Execute a flawless demo. Submit a winning entry.

### Submission Materials

**Demo Video (5 minutes)**
- Script locked from Week 1, now produce it
- Screen recording in 4K
- Voiceover (or live narration)
- Soundtrack (something ambient but driving)
- Caption everything (judges may watch muted)
- Multiple takes; pick the best

**Pitch Deck (10 slides max)**
- Slide 1: The HELIX one-liner
- Slide 2: The three walls (knowledge, time, trust)
- Slide 3: How HELIX breaks them
- Slide 4: Architecture diagram (from architecture.md)
- Slide 5: The research backing (6 papers cited)
- Slide 6: Live demo screenshots — Conviction Canvas
- Slide 7: Live demo screenshots — Lineage Tree
- Slide 8: Live demo screenshots — Risk Compass
- Slide 9: Real-world impact + market size
- Slide 10: Team + roadmap + ask

**Submission Repository**
- Clean README.md (the public face of the project)
- Code organized, documented
- Architecture diagrams in /docs
- Live demo URL (deployed)
- Video link
- Testnet contract addresses

**Live Demo Practice**
- 5 full rehearsals minimum
- Backup plan if testnet fails (pre-recorded segments ready)
- Backup demo wallet pre-funded
- Multiple network connections tested

### Submission Day Checklist
- All code pushed and tagged
- Video uploaded (multiple mirrors: YouTube, IPFS via Walrus)
- Live demo URL accessible from multiple geographies
- Deepsurge platform submission complete
- Social posts scheduled

---

## Parallel Workstreams

Not everything is sequential. Throughout all 8 weeks, these run in parallel:

**Continuous: Tests**
- Every new feature requires tests
- CI runs on every push
- Test coverage > 80% by end of Phase 6

**Continuous: Documentation**
- README updates with every major feature
- Inline code comments
- API documentation (OpenAPI spec for backend)

**Continuous: Community Building**
- X/Twitter presence from Week 1
- Devlog every Friday
- Discord engagement in Sui dev community

---

## Risk Management

### Risk: Nautilus TEE complexity exceeds available time
**Mitigation:** Start with mocked TEE that just signs outputs. Replace with real TEE in Week 5-6 if on schedule. Demo can run with mocked TEE if necessary; judges care about the *idea* of verifiable compute more than its implementation details.

### Risk: DeepBook Predict API changes during the build
**Mitigation:** Pin to a specific DeepBook Predict version. Build an adapter layer. If breaking changes occur, only the adapter needs updating.

### Risk: Frontend visualization performance (lineage tree with 1000+ nodes)
**Mitigation:** Use D3.js with WebGL renderer (force-graph library). Implement level-of-detail rendering. Cap demo dataset at 200 strategies if needed.

### Risk: Block Scholes oracle not fully available on testnet
**Mitigation:** Implement a mock oracle that mimics Block Scholes outputs. Document this as a "production switchover" item. Judges will accept this.

### Risk: Team member unavailability mid-build
**Mitigation:** Document everything. Use feature branches. Daily standups (even with team of 1).

### Risk: Scope creep
**Mitigation:** Every new idea goes through the question: "Does this make the demo better?" If not, it goes in a Future Roadmap doc. Period.

---

## Definition of Done (Per Feature)

A feature is "done" only when:

- Code is written and pushed to main
- Tests are written and passing
- Documentation reflects the new behavior
- A non-author has reviewed it (peer review, even if team of 1 → review your own work the next day)
- It has been used in a full demo dry-run
- Performance is acceptable (no jank, no errors in console)

---

## Final Word

This plan is opinionated. It will be tempting to deviate. Trust the structure. Backend before frontend prevents the dreaded "beautiful UI hooked to nothing" failure mode. Vertical slices prevent the "everything 80% done, nothing 100% done" failure mode. Checkpoint discipline prevents the "we'll fix it later" failure mode.

The teams that win hackathons are not the ones with the biggest ideas. They are the ones who execute relentlessly against a focused plan.

Stick to the plan. Adjust when reality demands it. But never abandon the structure.

See test.md for the checkpoints that prove each phase is truly complete.
