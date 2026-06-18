# HELIX — Technical Architecture

> System architecture for a conviction-native financial platform on Sui

---

## 1. System Overview

HELIX is organized into six concentric layers, each with clear responsibilities and well-defined interfaces. Lower layers are foundational and changes there cascade upward; upper layers are user-facing and iterate fast.

```
   ┌────────────────────────────────────────────────────────────────┐
   │                                                                │
   │              LAYER 6:  USER INTERFACE                          │
   │           (Conviction Canvas, Lineage Tree, Compass)           │
   │                                                                │
   ├────────────────────────────────────────────────────────────────┤
   │                                                                │
   │              LAYER 5:  APPLICATION SERVICES                    │
   │         (Indexer, WebSocket Hub, Notification Engine)          │
   │                                                                │
   ├────────────────────────────────────────────────────────────────┤
   │                                                                │
   │              LAYER 4:  VERIFIABLE COMPUTE                      │
   │       (Nautilus TEE: Compiler, Hedger, Regime Classifier)      │
   │                                                                │
   ├────────────────────────────────────────────────────────────────┤
   │                                                                │
   │              LAYER 3:  ON-CHAIN PROTOCOL                       │
   │          (Move Modules: Strategy, Breeding, Tree, Risk)        │
   │                                                                │
   ├────────────────────────────────────────────────────────────────┤
   │                                                                │
   │              LAYER 2:  EXECUTION & LIQUIDITY                   │
   │       (DeepBook Predict + PLP, Spot, Margin, iron_bank)        │
   │                                                                │
   ├────────────────────────────────────────────────────────────────┤
   │                                                                │
   │              LAYER 1:  DATA & STORAGE                          │
   │        (Walrus, Seal, Block Scholes Oracle, Pyth Oracle)       │
   │                                                                │
   └────────────────────────────────────────────────────────────────┘
```

---

## 2. The Core Object Model

Every entity in HELIX is a Sui object. This is fundamental — strategies, conviction trees, risk pictures, breeding events all exist as composable on-chain objects with ownership semantics.

### 2.1 StrategyObject

The atomic unit of HELIX. Represents a deployed strategy.

```move
struct StrategyObject has key, store {
    id: UID,
    owner: address,
    creator: address,                    // for royalty routing
    
    // Identity
    dna: StrategyDNA,
    generation: u64,
    parents: vector<ID>,                 // empty for primordial, 1 for asexual, 2 for bred
    
    // Lifecycle
    status: u8,                          // 0=pending, 1=active, 2=closed, 3=dead
    birth_epoch: u64,
    death_epoch: Option<u64>,
    
    // Positions (child objects via dynamic fields)
    legs: vector<ID>,                    // references to leg position objects
    
    // Performance
    initial_capital: u64,
    current_capital: u64,
    realized_pnl: i64,
    unrealized_pnl: i64,
    fitness_score: u64,                  // for selection/breeding
    
    // Social
    is_breedable: bool,
    is_copyable: bool,
    copy_fee_bps: u16,                   // basis points (0-2000 = 0-20%)
    breed_fee: u64,
    copies_count: u64,
    offspring_count: u64,
    
    // TEE attestation
    compiler_attestation: vector<u8>,    // proof of Nautilus TEE compilation
    
    // Walrus storage references
    backtest_blob: Option<vector<u8>>,
    performance_history_blob: vector<u8>,
}

struct StrategyDNA has store, copy, drop {
    // Conviction genes (what the user expressed)
    direction_bias: I64,                 // -100 to +100 (scaled)
    confidence: u8,                      // 0-100
    horizon_days: u16,
    vol_view: u8,                        // 0=calm, 50=neutral, 100=explosive
    
    // Structure genes (how AI compiled it)
    leg_count: u8,
    asset_pair_code: u8,                 // enum of supported pairs
    uses_options: bool,
    uses_spot: bool,
    uses_margin: bool,
    leverage_x100: u16,                  // 100 = 1x, 500 = 5x
    
    // Behavioral genes
    entry_signal_type: u8,               // momentum/mean_reversion/breakout/range
    entry_threshold: u8,
    exit_signal_type: u8,
    exit_threshold: u8,
    regime_sensitivity: u8,              // how much to react to regime changes
    
    // Risk genes
    max_drawdown_bps: u16,               // auto-death threshold
    hedge_threshold_delta: i16,          // when to auto-hedge
    
    // Meta
    mutation_count: u8,
    crossover_points: vector<u8>,        // if bred, where genes were spliced
}
```

### 2.2 ConvictionTreeNode

A strategy's position in the cascading dependency graph.

```move
struct ConvictionTreeNode has key, store {
    id: UID,
    strategy_id: ID,
    
    parent_node: Option<ID>,
    children: vector<ID>,
    
    condition: ActivationCondition,
    activated: bool,
    pledged_collateral: u64,
    borrowed_amount: u64,                // undercollateralized credit from parent
}

struct ActivationCondition has store, copy, drop {
    condition_type: u8,                  // 0=outcome, 1=state, 2=composite
    
    // For outcome conditions
    parent_strategy_id: Option<ID>,
    required_outcome: Option<u8>,        // succeeded/failed
    
    // For state conditions
    metric_type: Option<u8>,             // price/IV/volume/regime
    operator: Option<u8>,                // gt/lt/eq/between
    threshold: Option<u64>,
    
    // For composite conditions (boolean tree)
    operator_compose: Option<u8>,        // AND/OR/NOT
    sub_conditions: vector<ActivationCondition>,
}
```

### 2.3 PortfolioRiskObject

A user's unified portfolio risk picture.

```move
struct PortfolioRiskObject has key {
    id: UID,
    owner: address,
    
    active_strategies: vector<ID>,
    
    // Cached Greeks (updated on each strategy change or oracle update)
    net_delta_x100: i64,
    net_gamma_x100: i64,
    net_theta_x100: i64,
    net_vega_x100: i64,
    net_rho_x100: i64,
    
    // Risk metrics
    portfolio_var_95: u64,               // value at risk, 95% confidence
    portfolio_var_99: u64,
    max_drawdown_observed: u64,
    
    // User tolerances
    delta_tolerance: u64,
    vega_tolerance: u64,
    auto_hedge_enabled: bool,
    
    // Hedge history
    hedge_actions_count: u64,
    last_hedge_attestation: vector<u8>,  // TEE attestation of last auto-hedge
}
```

### 2.4 BreedingEvent

Records a successful breeding operation.

```move
struct BreedingEvent has key, store {
    id: UID,
    parent_a: ID,
    parent_b: ID,
    child: ID,
    breeder: address,                    // user who initiated
    fee_paid: u64,
    
    // Royalty configuration (parent creators earn from child's performance)
    parent_a_creator: address,
    parent_b_creator: address,
    royalty_split_bps: u16,              // how much of child's perf fees go to parents
    
    timestamp: u64,
}
```

### 2.5 CopyRelationship

Records a user copying a strategy.

```move
struct CopyRelationship has key, store {
    id: UID,
    copier: address,
    original_strategy_id: ID,
    derived_strategy_id: ID,             // the cloned instance with copier's capital
    fee_bps: u16,                        // fee at time of copy
    capital_committed: u64,
    fees_paid_to_original: u64,          // cumulative
    started_epoch: u64,
}
```

---

## 3. Move Module Structure

```
helix/
├── sources/
│   ├── strategy.move              # StrategyObject CRUD + lifecycle
│   ├── dna.move                   # StrategyDNA helpers + serialization
│   ├── breeding.move              # Crossover + mutation logic
│   ├── conviction_tree.move       # Cascading dependency graph
│   ├── portfolio_risk.move        # Greeks netting + risk calc
│   ├── marketplace.move           # Copy + breed marketplace
│   ├── compiler_bridge.move       # Interface for Nautilus TEE compiler
│   ├── hedger_bridge.move         # Interface for Nautilus hedging agent
│   ├── predict_adapter.move       # Wraps predict::mint/supply/redeem + PredictManager
│   ├── compose_adapter.move       # Wraps deepbook_margin + iron_bank + spot legs
│   ├── walrus_adapter.move        # Wrapper for Walrus blob storage
│   ├── leg_factory.move           # Creates individual position legs
│   ├── events.move                # All event emissions
│   └── access_control.move        # Capability-based permissions
└── tests/
    └── ...
```

---

## 4. The Off-Chain Compute Layer (Nautilus TEEs)

Nautilus provides Trusted Execution Environments (AWS Nitro Enclaves) where private computation produces cryptographic attestations verifiable on-chain. HELIX deploys four distinct TEE workloads.

### 4.1 The Compiler Agent

**Job:** Translate a user's conviction into an optimal multi-leg strategy structure.

**Input:** User's conviction vector (direction, confidence, horizon, vol_view, constraints)

**Process:**
1. Read current Block Scholes IV surface from oracle
2. Read current spot prices from Pyth
3. Read DeepBook orderbook depths for relevant instruments
4. Read the live **SVI volatility surface** from `oracle::OracleSVIUpdated` (Predict's Block-Scholes-built oracle) — HELIX reads the surface, it does not recompute it
5. Apply **conviction→structure mapping signals** (Paper 3: momentum / mean-reversion features) to choose which structure shape best expresses the user's direction + volatility view
6. Enumerate candidate structures: long call, short call, call spread, put spread, straddle, strangle, butterfly, condor, custom 3-4 leg combinations
7. For each structure, compute: cost, max profit, max loss, breakeven points, win probability, Sharpe estimate
8. Select Pareto-optimal structure that maximally captures the user's conviction-vs-market divergence at minimum cost
9. Generate execution plan (PTB specification with exact DeepBook orders)
10. Generate StrategyDNA from chosen structure

**Output:** Signed attestation containing:
- Selected strategy structure
- Generated DNA
- Backtest summary (Sharpe, max drawdown, win rate over historical data on Walrus)
- PTB to execute

**Why TEE:** The compiler's logic is proprietary alpha. Running it inside an enclave keeps the algorithm private while attestations prove it ran correctly.

### 4.2 The Hedging Agent

**Job:** Monitor portfolio Greeks and execute auto-hedges when tolerances are breached.

**Algorithm:** Distributional Reinforcement Learning (D4PG with quantile regression, per Paper 4)

**Input:** PortfolioRiskObject state, current market data, user's tolerance thresholds

**Process:**
1. Continuously compute net Greeks across all user's strategies
2. When any Greek exceeds tolerance, compute optimal hedge
3. Distribution-aware: not just point estimate of optimal hedge, but full distribution
4. Choose action minimizing expected shortfall + transaction costs
5. Generate hedge PTB

**Output:** Signed attestation + PTB for the hedge transaction

### 4.3 The Regime Classifier

**Job:** Classify the current market regime so strategies with regime-sensitive DNA can adapt.

**Input:** SVI surface from oracle::OracleSVIUpdated, on-chain volume data, orderbook depth, price history

**Process:**
1. Compute features: IV term structure slope, skew, curvature, realized vol, volume z-score
2. Classify into one of four regimes: Trending Bull / Trending Bear / Range-Bound / High-Volatility
3. Emit regime change event when classification flips

**Output:** Signed attestation of current regime + confidence

### 4.4 The Backtest Engine

**Job:** Verify performance claims of a strategy before deployment.

**Input:** A proposed StrategyDNA + historical Walrus data

**Process:**
1. Pull archived DeepBook tick data from Walrus
2. Simulate the strategy over the historical window
3. Compute Sharpe, max drawdown, win rate, profit factor
4. Generate full equity curve

**Output:** Signed attestation of backtest results + equity curve blob on Walrus

---

## 5. Data Flow — End-to-End Strategy Lifecycle

### 5.1 Strategy Creation Flow

```
   USER                  FRONTEND              TEE COMPILER            CHAIN
    │                       │                       │                    │
    ├─ Express conviction ─►│                       │                    │
    │                       │                       │                    │
    │                       ├─ POST /compile ──────►│                    │
    │                       │                       │                    │
    │                       │                       ├─ Read oracles      │
    │                       │                       ├─ Run NN-corrected  │
    │                       │                       │   IV pricing       │
    │                       │                       ├─ Run LSTM forecast │
    │                       │                       ├─ Enumerate         │
    │                       │                       │   structures       │
    │                       │                       ├─ Pareto select     │
    │                       │                       ├─ Generate DNA      │
    │                       │                       ├─ Sign attestation  │
    │                       │                       │                    │
    │                       │◄─ Return strategy ────┤                    │
    │                       │   plan + attestation  │                    │
    │                       │                       │                    │
    │◄─ Show payoff curve ──┤                       │                    │
    │   + Greeks            │                       │                    │
    │                       │                       │                    │
    ├─ Click "Deploy" ─────►│                       │                    │
    │                       │                       │                    │
    │                       ├─ Build PTB ───────────────────────────────►│
    │                       │   (verify_attestation                      │
    │                       │    + create_strategy                       │
    │                       │    + place_legs                            │
    │                       │    + add_to_portfolio)                     │
    │                       │                                            │
    │                       │                                  ┌─────────┴────────┐
    │                       │                                  │ Verify Nautilus  │
    │                       │                                  │ TEE attestation  │
    │                       │                                  │                  │
    │                       │                                  │ Place orders     │
    │                       │                                  │ on DeepBook      │
    │                       │                                  │                  │
    │                       │                                  │ Create Strategy  │
    │                       │                                  │ Object with DNA  │
    │                       │                                  │                  │
    │                       │                                  │ Update Portfolio │
    │                       │                                  │ Risk Object      │
    │                       │                                  └─────────┬────────┘
    │                       │                                            │
    │                       │◄─ Strategy ID + tx digest ─────────────────┤
    │                       │                                            │
    │◄─ Strategy is live ───┤                                            │
```

### 5.2 Cascading Activation Flow

```
   Parent Strategy resolves → True
                              │
                              ▼
                  ┌──────────────────────┐
                  │  Emit ResolutionEvent│
                  └──────────┬───────────┘
                             │
                             ▼
              Indexer picks up event
                             │
                             ▼
          For each child node with this parent:
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Evaluate condition  │
                  └──────────┬───────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
              Met                      Not Met
                │                         │
                ▼                         ▼
        Activate child           Return parent's
        with leverage            pledged collateral
        from undercollat'd       to its owner
        loan (Paper 6's
        mechanism)
```

### 5.3 Greeks Netting Update Flow

```
   Block Scholes Oracle updates (every block)
                  │
                  ▼
        Hedging Agent TEE wakes
                  │
                  ▼
   For each PortfolioRiskObject:
                  │
                  ├──► For each strategy:
                  │      ├──► Re-price each leg
                  │      └──► Compute leg Greeks
                  │
                  ├──► Sum Greeks across strategies
                  │      (delta-add, gamma-add, vega-add,
                  │       theta-add, rho-add)
                  │
                  ├──► Update PortfolioRiskObject
                  │
                  └──► Check tolerances
                         │
                         ├──► If breached + auto_hedge_enabled:
                         │      Generate hedge PTB
                         │      Sign attestation
                         │      Submit transaction
                         │
                         └──► If breached + manual mode:
                                Push notification to user
```

---

## 6. DeepBook Predict Integration

DeepBook Predict is **live on Sui testnet** (launched May 5, 2026; mainnet planned — projects redeploy day one). Quote asset is **dUSDC** (testnet-only, requested via faucet form, not official USDC). Oracles are **rolling sub-hour BTC** markets priced against a live SVI surface. HELIX composes with the actual on-chain entry points.

### 6.1 Core Predict entry points HELIX calls
- `predict::mint` — open a position (binary, range, or option) against the PLP vault
- `predict::supply` — deposit dUSDC into the **PLP** (Predict Liquidity Provider) vault, earning PLP returns; the PLP is the counterparty to every trade
- `predict::redeem_permissionless` — settle/claim a resolved position (also usable by keepers)
- `PredictManager` — the per-user account object holding positions; HELIX creates one per user on first use and can issue tokenized share tokens on top for composability
- `oracle::OracleSVIUpdated` — the event stream HELIX subscribes to for the live SVI volatility surface

### 6.2 The instruments
Binary markets, options (calls/puts/spreads), leveraged products, and structured instruments — all minted via `predict::mint` and priced against the SVI surface. A compiled conviction maps to a combination of these.

### 6.3 Cross-protocol composition (all live on mainnet)
When a structure needs leverage or yield legs, HELIX composes Predict with:
- `deepbook_margin` — margin trading + liquidation
- `iron_bank` — permissioned USDsui supply (with the Slush user vault on top)
- DeepBook spot CLOB — for the spot legs of a structure (e.g. BTC conversion)

### 6.4 The Composability Advantage
Because Predict composes with Spot, Margin, and iron_bank under shared liquidity, a single PTB can atomically open a Predict position, hedge it with a spot or margin leg, and route funding from a supply position — with one signature. This is what the Greeks Netting Engine relies on: Greeks compose only because positions compose. It is also the "three-protocol composability" demo the Predict track explicitly prizes.

---

## 7. Liquidity: Compose with Predict's PLP Vault

> **Design reversal (see decisions.md ADR-003):** an earlier draft built Paradigm's pm-AMM as a parallel liquidity layer. Predict already ships a liquidity vault, so HELIX composes with it instead of rebuilding it. This removed the project's single highest-risk scope item.

### 7.1 The PLP vault
Predict's **PLP** takes the other side of every trade. `predict::supply` deposits dUSDC into it; mints draw against it; on-chain LP economics are auditable and composable. HELIX builds no market-making infrastructure of its own.

### 7.2 How HELIX uses it
- The compiler checks PLP utilization before proposing a structure (so it never proposes a size the vault can't fill)
- Strategies that include a yield leg can `predict::supply` into the PLP as part of their structure
- The Risk Guardian surfaces PLP-related risks in plain language: thinning depth near a sub-hour expiry, and stale SVI feeds (the two guardian risk classes the Intent Engine track requires)

### 7.3 What we explicitly do NOT build
No custom AMM, no LMSR implementation, no parallel liquidity pools. Composing the existing primitive is both lower-risk and a stronger "genuine Sui Stack usage" signal than reinventing it.

---

## 8. Storage Strategy (Walrus)

### 8.1 What Goes On-Chain (Sui)
- StrategyObject (with DNA, current state, fitness)
- ConvictionTreeNode
- PortfolioRiskObject
- BreedingEvent / CopyRelationship records
- Pointers (blob IDs) to Walrus storage

### 8.2 What Goes On Walrus
- Historical DeepBook tick data (for backtesting)
- Full strategy equity curves
- Backtest reports
- TEE attestation archives
- Lineage records (full family tree data — too large for on-chain)
- Performance history time series

### 8.3 What Goes Into Seal Encryption
- Private strategy code variants (for users who want their DNA hidden but verifiable)
- User notes attached to strategies
- Premium strategy access (paid copy-trades reveal full DNA only after payment)

---

## 9. Oracle Integration

### 9.1 Block Scholes Oracle (Sui's institutional partner)
- IV surface data: implied volatility per strike per expiry
- Used by Compiler Agent for option pricing
- Used by Regime Classifier for term-structure analysis
- Used by Greeks Netting for accurate Vega calculations

### 9.2 Pyth
- Spot price feeds for all supported assets
- Used by every TEE workload
- Used on-chain for liquidation triggers and condition evaluation

### 9.3 DeepBook Internal State
- Live orderbook depth (read directly via Move calls)
- Used by Compiler for liquidity-aware structure selection
- Used by Hedger to gauge execution slippage

---

## 10. Frontend Architecture

### 10.1 Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + custom CSS variables for theme
- **State:** Zustand (lightweight, no Redux complexity)
- **Sui Integration:** @mysten/dapp-kit + @mysten/sui SDK
- **Visualizations:**
  - D3.js for force-directed lineage tree
  - Three.js for the immersive ecosystem map (3D mode)
  - Recharts for payoff curves and equity curves
  - Custom Canvas API for the Conviction Canvas
- **Real-time:** WebSocket connection to indexer for live updates
- **Animations:** Motion (formerly Framer Motion) for orchestrated transitions

### 10.2 Backend Services (Supporting Frontend)

Beyond on-chain and TEE, three classical backend services support the frontend:

**Indexer Service**
- Listens to all HELIX-related Sui events
- Maintains denormalized read-models in PostgreSQL
- Powers leaderboards, lineage queries, search

**WebSocket Hub**
- Streams live updates to frontend
- Strategy heartbeats (each trade)
- Birth/death/breed events
- Greeks updates
- Risk Compass changes

**Notification Engine**
- Push notifications for breached tolerances
- Email/Telegram for major events (strategy death, hedge executed, copy fees received)

### 10.3 API Surface
- `POST /api/conviction/compile` → compile a conviction into a strategy plan
- `POST /api/conviction/preview` → render payoff/Greeks without compiling
- `GET /api/strategies/:id` → full strategy details
- `GET /api/strategies/leaderboard` → top performers
- `GET /api/lineage/:strategy_id` → ancestry tree
- `GET /api/portfolio/:address/risk` → Risk Compass data
- `WSS /api/stream` → live event stream

---

## 11. Security Model

### 11.1 Trust Boundaries

```
   ┌─────────────────────────────────────────────────────────┐
   │  TRUSTED                                                │
   │                                                         │
   │   • Move contracts (audited, deterministic)             │
   │   • Sui consensus                                       │
   │   • DeepBook (audited primitives)                       │
   │                                                         │
   ├─────────────────────────────────────────────────────────┤
   │  VERIFIABLE                                             │
   │                                                         │
   │   • Nautilus TEE outputs (attestations verify)          │
   │   • Walrus blobs (content-addressed, immutable)         │
   │   • Oracle feeds (signed by Block Scholes/Pyth)         │
   │                                                         │
   ├─────────────────────────────────────────────────────────┤
   │  UNTRUSTED                                              │
   │                                                         │
   │   • Frontend (treated as untrusted client)              │
   │   • Indexer service (read-only, can be rebuilt)         │
   │   • User input                                          │
   │                                                         │
   └─────────────────────────────────────────────────────────┘
```

### 11.2 Capability-Based Permissions

Every sensitive action requires a Move capability. The Move type system enforces who can do what.

- `StrategyOwnerCap` — held by strategy owner, required for modifications
- `BreederCap` — granted upon successful breeding fee payment
- `HedgerCap` — held by Nautilus Hedging Agent, allows auto-hedge txns
- `MarketplaceCap` — held by marketplace contract for fee distribution

### 11.3 Front-Running Mitigation

Compiler attestations include a `valid_until` timestamp. The chain rejects compilations submitted too late, preventing MEV bots from front-running compilation results.

### 11.4 Sybil Resistance

Breeding marketplace requires zkLogin (one human, one identity) and reputation score before allowing template listing. Prevents wash-breeding to inflate offspring counts.

---

## 12. Failure Modes & Resilience

### 12.1 Oracle Failure
If the SVI oracle (oracle::OracleSVIUpdated) goes stale, the Risk Guardian blocks new compiles and warns users; existing positions are untouched. The compiler never extrapolates into an unpriced surface region.

### 12.2 TEE Compromise
Each TEE has a published attestation hash. If an enclave's attestation doesn't match the published hash, the chain rejects its output. Multiple TEEs run redundantly; their outputs are compared.

### 12.3 DeepBook Outage
Strategies in HELIX continue holding their positions. New compilations halt. When DeepBook recovers, strategies resume.

### 12.4 Cascading Liquidations
If a parent strategy fails, child strategies don't activate (no capital risk). If an active child strategy hits its drawdown_kill_switch, it auto-liquidates without affecting siblings.

---

## 13. Performance Targets

| Metric | Target |
|---|---|
| Conviction compile latency | < 3 seconds |
| Strategy deployment (compile + chain confirmation) | < 8 seconds |
| Risk Compass refresh after market move | < 2 seconds |
| Auto-hedge execution from trigger | < 5 seconds |
| Lineage tree render (1000 nodes) | < 500ms |
| Frontend Time-to-Interactive | < 2 seconds |

---

## 14. Glossary

**Conviction** — A user's expressed belief about the market direction, confidence, horizon, and volatility expectations.

**Strategy DNA** — The structured parameter vector encoding a strategy's behavior.

**Lineage** — The ancestry tree of a strategy: parents, grandparents, breeding events.

**Conviction Tree** — A directed acyclic graph of dependent strategies, where children activate based on parent outcomes.

**Greeks Netting** — Aggregating Delta, Gamma, Vega, Theta, Rho across all of a user's positions for unified risk view.

**Regime** — Market state classification (Trending Bull / Trending Bear / Range-Bound / High-Volatility).

**PLP** — Predict Liquidity Provider vault; Predict's native counterparty to every trade (via predict::supply). HELIX composes with it rather than building an AMM.

**Nautilus** — Sui's TEE framework using AWS Nitro Enclaves with on-chain attestation verification.

**Walrus** — Sui's decentralized blob storage protocol.

**Seal** — Sui's programmable access control / encryption framework.

**OracleSVI / Block Scholes** — Predict's live SVI (Stochastic-Volatility-Inspired) surface oracle; read via oracle::OracleSVIUpdated.

---

*This architecture is designed to be implemented incrementally. See plan.md for the build sequence and test.md for verification checkpoints.*
