# HELIX — Test Checkpoints

> Binary checkpoints for each phase. You do not advance until your phase's checkpoints all pass. Tracks progress, builds confidence, kills wishful thinking.

---

## How To Use This Document

**Mark a checkpoint complete only when:**
1. The test passes consistently (run it 3 times — all 3 pass)
2. A person other than the implementer has verified it (or you slept, then re-verified the next day)
3. The result is documented (screenshot, log, test output saved somewhere)

**Format for each checkpoint:**
- `[ ]` = Not started or in progress
- `[~]` = Done but not yet verified
- `[x]` = Verified and locked

**If a checkpoint fails:** Do not skip it. Do not paper over it. Stop, diagnose, fix. The cost of an unverified checkpoint compounds.

---

## Phase 0 Checkpoints — Foundation (Days 1-3)

### Environment

- [ ] **0.1** Sui CLI installed, version verified (`sui --version` returns 1.x.x or higher)
- [ ] **0.2** Sui testnet wallet created, has at least 10 testnet SUI
- [ ] **0.2b** dUSDC requested via the Predict faucet form (NOT official testnet USDC — Predict uses dUSDC) and received
- [ ] **0.3** Local sui-test-validator boots cleanly (`sui start --with-faucet`)
- [ ] **0.4** Move toolchain works (`sui move build` succeeds on empty project)
- [ ] **0.5** Node.js >= 20 installed
- [ ] **0.6** Next.js 15 scaffold boots (`pnpm dev` shows default page)
- [ ] **0.7** PostgreSQL running locally via Docker
- [ ] **0.8** GitHub repo created with proper directory structure
- [ ] **0.9** README.md placeholder exists
- [ ] **0.10** All five planning docs (idea, architecture, plan, test, frontend) exist

### Demo Lock

- [ ] **0.11** Demo script written: 5-minute walkthrough document specifying exact user flow shown to judges
- [ ] **0.12** Demo script reviewed: ask "if we ONLY built what's in this script, would it win?" — answer is yes

---

## Phase 1 Checkpoints — On-Chain Core (Week 1)

### dna.move

- [ ] **1.1** StrategyDNA struct compiles with all genes
- [ ] **1.2** Serialization roundtrip test passes: serialize(d) → bytes → deserialize → equals d
- [ ] **1.3** Validation function rejects out-of-range genes (e.g., direction_bias > 100)
- [ ] **1.4** Similarity function returns sensible values (identical DNAs = 1.0, opposite DNAs = 0.0)

### strategy.move

- [ ] **1.5** `create_strategy` creates a StrategyObject with correct fields
- [ ] **1.6** `close_strategy` only succeeds when called by owner
- [ ] **1.7** `close_strategy` fails when called by non-owner
- [ ] **1.8** Status transitions correct: pending → active → closed (or → dead)
- [ ] **1.9** `mark_dead` triggers when drawdown_kill_switch hit
- [ ] **1.10** Events emitted on every state change
- [ ] **1.11** Events parseable by external listener (use sui CLI to subscribe and verify)

### portfolio_risk.move

- [ ] **1.12** `init_portfolio` creates a PortfolioRiskObject for the caller
- [ ] **1.13** `add_strategy_to_portfolio` only allows owner of both objects
- [ ] **1.14** `update_greeks` requires HedgerCap (rejects without it)
- [ ] **1.15** Greeks update with attestation succeeds
- [ ] **1.16** Greeks update with invalid attestation fails

### access_control.move

- [ ] **1.17** Capabilities can be created and transferred
- [ ] **1.18** Functions requiring caps reject calls without proper cap
- [ ] **1.19** Caps are non-copyable (verify with deliberate copy attempt)

### Phase 1 End State

- [ ] **1.20** Full test suite runs: `sui move test` returns "All tests passed"
- [ ] **1.21** Coverage report shows > 80% on all modules
- [ ] **1.22** No compiler warnings
- [ ] **1.23** Can publish modules to local testnet successfully

---

## Phase 2 Checkpoints — On-Chain Advanced (Week 2)

### breeding.move

- [ ] **2.1** `breed` requires both parents to be marked as breedable
- [ ] **2.2** `breed` requires correct fee amount
- [ ] **2.3** Crossover produces valid child DNA (no genes out of range)
- [ ] **2.4** Crossover splits genes roughly 50/50 from each parent (statistical test over 100 breedings)
- [ ] **2.5** Mutation rate is reasonable (< 5% of genes mutated per breed)
- [ ] **2.6** BreedingEvent emitted with correct parent references
- [ ] **2.7** Royalty configuration stored correctly
- [ ] **2.8** Child strategy has correct generation number (parent_max + 1)

### conviction_tree.move

- [ ] **2.9** `link_to_parent` creates a ConvictionTreeNode
- [ ] **2.10** Linking requires pledging collateral
- [ ] **2.11** `evaluate_condition` returns correct boolean for outcome conditions
- [ ] **2.12** `evaluate_condition` returns correct boolean for state conditions (price-based)
- [ ] **2.13** Composite conditions (AND/OR/NOT) evaluate correctly
- [ ] **2.14** `activate_node` succeeds when condition met
- [ ] **2.15** `activate_node` fails when condition not met
- [ ] **2.16** `cascade_failure` returns collateral when parent fails
- [ ] **2.17** Deep tree test: 3-level tree activates correctly when root resolves

### marketplace.move

- [ ] **2.18** `list_as_copyable` only callable by strategy owner
- [ ] **2.19** `copy_strategy` creates derived strategy with copier's capital
- [ ] **2.20** `copy_strategy` deducts copy fee correctly
- [ ] **2.21** Copy fee routes to original creator
- [ ] **2.22** Performance fees from derived strategy route to original creator (over time)
- [ ] **2.23** Listing fee structure tests pass

### predict_adapter.move

- [ ] **2.24** Adapter compiles against DeepBook Predict branch `predict-testnet-4-16`
- [ ] **2.25** Can `predict::mint` a binary/range position via adapter (testnet, dUSDC)
- [ ] **2.26** Can `predict::supply` into the PLP vault via adapter
- [ ] **2.27** Can `predict::redeem_permissionless` a settled position
- [ ] **2.28** `PredictManager` created on first use; positions attributed correctly
- [ ] **2.29** Position objects from Predict are correctly referenced in StrategyObject

### leg_factory.move

- [ ] **2.30** Factory creates correct leg type for each call
- [ ] **2.31** Bundling: `create_strategy_legs` creates all legs atomically (PTB)
- [ ] **2.32** If any leg fails, entire transaction reverts (atomic)

### Phase 2 End State

- [ ] **2.33** Full integration test: create strategy → place 3 DeepBook orders → close strategy → verify P&L calculated
- [ ] **2.34** Full integration test: build 3-level conviction tree → parent resolves → child activates with leverage
- [ ] **2.35** Full integration test: breed two strategies → child deploys → both parents earn royalty
- [ ] **2.36** All Phase 2 module tests pass
- [ ] **2.37** Total Move LoC reviewed for clarity and bug surface area

---

## Phase 3 Checkpoints — Off-Chain Compute (Week 3)

### Compiler Agent

- [ ] **3.1** Compiler runs locally (not in TEE yet) and produces valid output for sample convictions
- [ ] **3.2** Compiler reads from mock Block Scholes oracle correctly
- [ ] **3.3** Compiler reads from Pyth oracle correctly (testnet)
- [ ] **3.4** Compiler reads DeepBook orderbook state correctly
- [ ] **3.5** Compiler enumerates at least 5 candidate structures per conviction
- [ ] **3.6** Compiler's Pareto selection consistently picks reasonable structure (manually verified for 20 sample convictions)
- [ ] **3.7** Generated DNA passes on-chain validation
- [ ] **3.8** Generated PTB executes successfully on testnet
- [ ] **3.9** Compiler deployed inside Nautilus TEE
- [ ] **3.10** TEE attestation generated and verifiable on-chain
- [ ] **3.11** Compiler API responds in < 5 seconds (p95)

### Hedging Agent

- [ ] **3.12** Hedger subscribes to Sui events (strategy creation, oracle updates)
- [ ] **3.13** Hedger computes Greeks for a portfolio with multiple strategies
- [ ] **3.14** Computed Greeks match manual calculation (within 1% tolerance)
- [ ] **3.15** When Delta tolerance breached, hedge PTB generated
- [ ] **3.16** Hedge PTB executes successfully and brings Delta back within tolerance
- [ ] **3.17** Hedger deployed inside Nautilus TEE with attestation

### Regime Classifier

- [ ] **3.18** Classifier produces a regime classification given known market features
- [ ] **3.19** Classifications match expectation for clear-cut historical periods (trending bull = clear bull market, etc.)
- [ ] **3.20** Regime change events emitted when classification flips
- [ ] **3.21** Strategies with regime_sensitivity > 0 receive notifications on regime change

### Backtest Engine

- [ ] **3.22** Backtest accepts a DNA + date range
- [ ] **3.23** Backtest pulls historical data from Walrus (or mock Walrus during dev)
- [ ] **3.24** Backtest returns Sharpe ratio, max drawdown, win rate, profit factor
- [ ] **3.25** Backtest result determinism: same DNA + same period = same result (within numerical noise)
- [ ] **3.26** Equity curve generated and uploaded to Walrus

### Indexer

- [ ] **3.27** Indexer connects to Sui RPC and tails events
- [ ] **3.28** All StrategyCreated events captured in `strategies` table
- [ ] **3.29** All BreedingEvent captured in `breeding_events` table with parent links
- [ ] **3.30** Leaderboard query (top 10 by fitness) returns correct order
- [ ] **3.31** Lineage query (ancestors of a strategy) returns correct tree
- [ ] **3.32** WebSocket connection broadcasts live updates to test client

### Phase 3 End State

- [ ] **3.33** End-to-end CLI test: POST conviction → receive compiled plan → submit PTB → strategy on chain → indexer sees it → leaderboard updates
- [ ] **3.34** End-to-end CLI test: simulate oracle price move → hedger triggers → hedge executes
- [ ] **3.35** All TEE attestations verifiable on-chain
- [ ] **3.36** Mock TEE flag works (can run system without real TEE for dev)

---

## Phase 4 Checkpoints — Frontend Foundation (Week 4)

### Design System

- [ ] **4.1** All design tokens from frontend.md implemented (colors, typography, spacing)
- [ ] **4.2** Base components built: Button, Card, Input, Slider, Modal, Toast
- [ ] **4.3** Custom cursor follow system works (tested across browsers)
- [ ] **4.4** Preloader animation plays smoothly on initial load
- [ ] **4.5** Page transitions feel smooth (no flash of white, no janky animations)
- [ ] **4.6** Dark mode + light mode both render correctly (if light mode included)

### Layout Shell

- [ ] **4.7** Top nav renders, wallet connect button visible
- [ ] **4.8** Mobile responsive (test on 375px, 768px, 1280px, 1920px viewports)
- [ ] **4.9** Side rail navigation works
- [ ] **4.10** Footer renders correctly

### Conviction Canvas

- [ ] **4.11** All four conviction inputs render (Direction, Confidence, Time, Volatility)
- [ ] **4.12** Drag-and-drop interactions work smoothly
- [ ] **4.13** Probability cone visualization renders based on inputs
- [ ] **4.14** "Compile" button triggers mock API call
- [ ] **4.15** Loading state animation plays during mock compile
- [ ] **4.16** Payoff curve renders with mocked data
- [ ] **4.17** Greeks display with mocked data

### My Strategies List

- [ ] **4.18** Renders list of mocked strategies
- [ ] **4.19** Strategy cards show: DNA summary, status, current PnL, fitness
- [ ] **4.20** Status indicators have correct visual treatment (active = pulsing green, dying = red, dead = grey)
- [ ] **4.21** Click strategy → routes to detail page

### Strategy Detail

- [ ] **4.22** Renders full DNA in human-readable form
- [ ] **4.23** Payoff curve renders correctly
- [ ] **4.24** Equity curve renders (mocked time series)
- [ ] **4.25** Lineage section shows parent links
- [ ] **4.26** Copy/Breed buttons render and route correctly

### Lineage Tree

- [ ] **4.27** Force-directed graph renders without errors
- [ ] **4.28** 200 mock nodes render at 60fps
- [ ] **4.29** Hover on node shows tooltip with key stats
- [ ] **4.30** Click on node opens detail panel
- [ ] **4.31** Zoom and pan work smoothly

### Risk Compass

- [ ] **4.32** Radar chart renders with 5 axes (Delta, Gamma, Vega, Theta, Rho)
- [ ] **4.33** Mock data updates animate smoothly (transitions, not jumps)
- [ ] **4.34** Tolerance breach state has distinct visual treatment

### Marketplace

- [ ] **4.35** Browse view renders mocked breedable/copyable strategies
- [ ] **4.36** Filters work (by fitness, by traits, by generation)
- [ ] **4.37** Leaderboard tab shows top performers

### Phase 4 End State

- [ ] **4.38** Lighthouse Performance score > 85 on production build
- [ ] **4.39** Lighthouse Accessibility score > 90
- [ ] **4.40** No console errors in any flow
- [ ] **4.41** A non-technical reviewer can navigate the entire app via mock data
- [ ] **4.42** Visual quality comparable to overflow.sui.io (qualitative comparison)

---

## Phase 5 Checkpoints — Backend Wiring (Week 5)

### Wallet Integration

- [ ] **5.1** zkLogin flow completes: Google sign-in → Sui address derived
- [ ] **5.2** zkLogin address persists across sessions
- [ ] **5.3** Standard wallet connect also works (Sui Wallet, Suiet)
- [ ] **5.4** PTB construction helpers tested with at least 3 different transaction types

### Conviction → Real Compile

- [ ] **5.5** Real /compile endpoint called with conviction data
- [ ] **5.6** Loading state shows during real compile (averaging 2-4 seconds)
- [ ] **5.7** Error states handled: TEE down, oracle stale, invalid conviction
- [ ] **5.8** Returned payoff curve matches the compiler's output
- [ ] **5.9** TEE attestation visible in UI (verification badge)

### Deploy → Chain

- [ ] **5.10** Deploy button constructs correct PTB
- [ ] **5.11** Wallet signing flow completes
- [ ] **5.12** Transaction submitted to testnet
- [ ] **5.13** Transaction confirmation polled until finalized
- [ ] **5.14** On success: redirect to strategy detail page
- [ ] **5.15** On failure: clear error message, can retry without losing data

### Indexer Integration

- [ ] **5.16** My Strategies page queries indexer, shows real data
- [ ] **5.17** Strategy Detail page fetches from indexer
- [ ] **5.18** Leaderboard reflects real on-chain data
- [ ] **5.19** WebSocket connection established on app load
- [ ] **5.20** Live updates appear without page refresh

### Walrus Integration

- [ ] **5.21** Backtest blobs uploaded successfully
- [ ] **5.22** Equity curve blobs uploaded and retrievable
- [ ] **5.23** Blob fetch latency < 2 seconds for typical sizes

### Risk Compass Live

- [ ] **5.24** Risk Compass subscribes to Greeks updates via WebSocket
- [ ] **5.25** Visual updates as Hedger pushes new Greeks (within 2 seconds of update)
- [ ] **5.26** Tolerance breach triggers notification + visual alert
- [ ] **5.27** Manual hedge button works (constructs hedge PTB)

### Phase 5 End State

- [ ] **5.28** End-to-end live demo: connect wallet, express conviction, deploy strategy, see it live, watch Greeks update
- [ ] **5.29** Demo runs without any errors visible to user
- [ ] **5.30** All mocked endpoints replaced with real services
- [ ] **5.31** Mock flag still works for development (toggle for offline dev)

---

## Phase 6 Checkpoints — Advanced Features (Week 6)

### Cascading Conviction Trees

- [ ] **6.1** "Chain this strategy" UI flow works end-to-end
- [ ] **6.2** Can browse other users' active strategies as potential parents
- [ ] **6.3** Condition builder supports outcome, state, and composite conditions
- [ ] **6.4** Composite conditions (AND/OR/NOT) UI is comprehensible
- [ ] **6.5** Pledged collateral correctly locked when linking
- [ ] **6.6** Parent resolution triggers visible cascade in lineage view
- [ ] **6.7** Child auto-activates with leverage when condition met
- [ ] **6.8** Failed parent returns collateral correctly

### Breeding Marketplace

- [ ] **6.9** "Mark as Breedable" toggle works
- [ ] **6.10** Browse view filters work (performance, lineage, DNA traits)
- [ ] **6.11** Breed dialog selects two parents correctly
- [ ] **6.12** Preview shows likely child DNA distribution
- [ ] **6.13** Breeding fee payment goes through
- [ ] **6.14** Child strategy spawns with mixed DNA on chain
- [ ] **6.15** Both parent creators see royalty earnings in their dashboard
- [ ] **6.16** Royalties accrue over time as child performs

### AI Advisor Mode

- [ ] **6.17** Toggle for AI Advisor mode
- [ ] **6.18** AI suggests 3-5 conviction templates based on current regime
- [ ] **6.19** Each suggestion is contextualized ("High vol detected, here are vol-selling templates")
- [ ] **6.20** Click template → pre-fills Conviction Canvas
- [ ] **6.21** AI suggestions update when regime changes

### Advanced Lineage Visualization

- [ ] **6.22** Time machine mode scrubs through generations smoothly
- [ ] **6.23** Filter by generation works
- [ ] **6.24** Filter by fitness threshold works
- [ ] **6.25** Filter by regime works
- [ ] **6.26** Selected node shows full ancestry + descendants
- [ ] **6.27** Visual: live strategies pulse, dying strategies fade

### Phase 6 End State

- [ ] **6.28** Full demo dry-run completes without errors
- [ ] **6.29** All advanced features feel polished, not bolted-on
- [ ] **6.30** Demo time still under 5 minutes (don't add features that bloat the demo)

---

## Phase 7 Checkpoints — Polish (Week 7)

### Animation Audit

- [ ] **7.1** Every state change has a transition (no abrupt jumps)
- [ ] **7.2** Hover states feel responsive (< 100ms feedback)
- [ ] **7.3** Loading states never show "blank → content" (always animated reveal)
- [ ] **7.4** Page transitions orchestrated (staggered reveals on first paint)

### Empty / Loading / Error States

- [ ] **7.5** "No strategies yet" empty state with helpful prompt
- [ ] **7.6** Loading skeletons match final content shape
- [ ] **7.7** Error states explain what happened and offer recovery
- [ ] **7.8** Toast notifications styled consistently

### Performance

- [ ] **7.9** Lighthouse Performance > 90 on production build
- [ ] **7.10** Largest Contentful Paint < 2.5s
- [ ] **7.11** Time to Interactive < 3.5s
- [ ] **7.12** Cumulative Layout Shift < 0.1
- [ ] **7.13** No memory leaks observed in 30-minute session

### Accessibility

- [ ] **7.14** All interactive elements keyboard-accessible
- [ ] **7.15** Focus rings visible and styled consistently
- [ ] **7.16** ARIA labels on custom components
- [ ] **7.17** Screen reader can complete the core flow (test with VoiceOver or NVDA)
- [ ] **7.18** Color contrast meets WCAG AA on all text

### Mobile

- [ ] **7.19** Conviction Canvas usable on mobile (touch-friendly inputs)
- [ ] **7.20** Lineage Tree zoomable and pannable on mobile
- [ ] **7.21** Risk Compass simplified mobile view
- [ ] **7.22** All forms usable with touch keyboard

### Microcopy

- [ ] **7.23** Every label, tooltip, button text reviewed
- [ ] **7.24** Voice and tone consistent (editorial, confident, never patronizing)
- [ ] **7.25** Error messages helpful (what to do, not just what went wrong)

### Phase 7 End State

- [ ] **7.26** Stranger usability test: someone who has never seen the product navigates the core flow without help
- [ ] **7.27** Visual quality matches or exceeds top-tier hackathon winners (compare with 2025 winners)

---

## Phase 8 Checkpoints — Demo & Submission (Week 8)

### Demo Video

- [ ] **8.1** Script written and approved
- [ ] **8.2** Recording in 4K resolution
- [ ] **8.3** Audio levels normalized
- [ ] **8.4** Captions added (auto + manual review)
- [ ] **8.5** Background music chosen (not distracting)
- [ ] **8.6** Multiple takes recorded; best one selected
- [ ] **8.7** Video length under 5 minutes
- [ ] **8.8** Uploaded to YouTube (unlisted), Walrus, IPFS

### Pitch Deck

- [ ] **8.9** All 10 slides drafted
- [ ] **8.10** Visual style matches the product (cohesive brand)
- [ ] **8.11** Reviewed by external eye
- [ ] **8.12** PDF exported and accessible

### Live Demo Readiness

- [ ] **8.13** 5+ full rehearsals completed
- [ ] **8.14** Backup wallet pre-funded with testnet SUI
- [ ] **8.15** Pre-recorded demo segments ready as fallback
- [ ] **8.16** Local development environment can boot fully in < 2 minutes (in case testnet is down)
- [ ] **8.17** Multiple internet connections tested (mobile hotspot as backup)

### Repository

- [ ] **8.18** README.md is the public face of the project — beautiful, clear, accurate
- [ ] **8.19** Code organized into clear directories
- [ ] **8.20** Architecture diagrams in /docs visible on GitHub
- [ ] **8.21** Live demo URL works from multiple geographies
- [ ] **8.22** Contract addresses documented
- [ ] **8.23** Setup instructions tested by following them from scratch

### Submission

- [ ] **8.24** Deepsurge platform submission complete
- [ ] **8.25** All required fields filled
- [ ] **8.26** Video uploaded successfully
- [ ] **8.27** Live demo URL submitted
- [ ] **8.28** Team information correct
- [ ] **8.29** Submission confirmed (received confirmation email/notification)

### Post-Submission

- [ ] **8.30** Social posts scheduled (X, LinkedIn, Reddit)
- [ ] **8.31** Sui community Discord notification sent
- [ ] **8.32** Backup of all materials archived (in case of platform issues)

---

## Final Confidence Check (Day Before Submission)

These last checks are not about features. They are about confidence.

- [ ] **F.1** I can describe HELIX in one sentence
- [ ] **F.2** I can describe the three walls it breaks in 30 seconds each
- [ ] **F.3** I can demo the entire flow in 5 minutes without notes
- [ ] **F.4** I can answer any technical question about the architecture
- [ ] **F.5** I have cited the six research papers and can explain how each is used
- [ ] **F.6** I have practiced the live demo failure scenarios (testnet down, wallet issues, etc.)
- [ ] **F.7** I have rested enough that I can think clearly during the demo
- [ ] **F.8** I believe in the product

If all eight pass, you've done everything you can. The rest is up to the judges.

---

## Tracking Your Progress

Use this simple metric:

**Progress Score** = (Phase Checkpoints Verified) / (Total Phase Checkpoints)

| Phase | Total | Target Completion |
|---|---|---|
| Phase 0 | 12 | Day 3 |
| Phase 1 | 23 | End of Week 1 |
| Phase 2 | 37 | End of Week 2 |
| Phase 3 | 36 | End of Week 3 |
| Phase 4 | 42 | End of Week 4 |
| Phase 5 | 31 | End of Week 5 |
| Phase 6 | 30 | End of Week 6 |
| Phase 7 | 27 | End of Week 7 |
| Phase 8 | 32 | End of Week 8 |
| Final | 8 | Day before submission |

**Total checkpoints: 278**

If you're at < 70% of the phase's checkpoints by its target date, you're behind schedule. Don't lie to yourself. Adjust scope or work harder.

If you're at > 90% with time to spare, you have room to polish further. Use it.

---

## A Note on Failure

If a checkpoint stays failed for more than 2 days, consider:

1. Is this checkpoint actually necessary for the demo? If no → cut it.
2. Is there a simpler implementation that satisfies it? If yes → simplify.
3. Is there a mock/stub that works for the demo? If yes → use it, mark the real implementation as Future Work.

You will not ship a perfect product. You will ship the *best version of the product you could ship in 8 weeks*. Those are different things. Make peace with that, and the work becomes easier.
