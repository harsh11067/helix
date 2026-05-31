# HELIX — Decisions, Tradeoffs & Edge Cases

> The reasoning behind every load-bearing choice. Each decision is defended against the alternatives we rejected, with edge cases and scalability consequences. This document exists so that when a judge asks "why did you do it this way?", there is a real answer — not a shrug.

Cross-references: see `architecture.md` for the systems these decisions shape, `plan.md` for when each is built, `test.md` for how each is verified, `frontend.md` for the UX consequences.

---

## How To Read This Document

Each decision follows the same structure:

- **Context** — the forcing question
- **Decision** — what we chose
- **Alternatives rejected** — what we didn't choose and why
- **Tradeoff** — what we gave up
- **Edge cases** — where this decision strains
- **Scalability** — how it behaves under load
- **Judging angle** — why this choice strengthens the submission

A decision without a named alternative is not a decision — it's a default. Every entry here had a real fork.

---

## ADR-001: Strategies as First-Class Sui Objects (not records in a registry)

### Context
A strategy needs to be deployed, owned, transferred, composed, and traded. How do we represent it on-chain?

### Decision
Each strategy is a standalone Sui object (`StrategyObject`, see architecture.md §2.1) owned by the user, holding its legs as child objects via dynamic fields.

### Alternatives rejected

**A registry-mapping model** (one global contract holding a `Table<ID, StrategyData>`, à la most EVM protocols). Rejected because: a global table is a single contended hot object. Every strategy mutation would touch the same shared object, serializing all writes through one consensus path. On Sui, this throws away the entire advantage of the object model — owned-object transactions skip consensus and finalize via fast-path. A registry would force every strategy write into the slow path.

**An account-abstraction model** (all of a user's strategies live inside one "account" object). Rejected because: it couples unrelated strategies. Transferring or copying a single strategy would require touching the whole account. Breeding across users becomes impossible without shared mutable access to two accounts.

### Tradeoff
We give up easy global enumeration. "List all strategies" can't be a single on-chain read — it requires the indexer (architecture.md §10.2). We accept off-chain indexing as the price of on-chain parallelism.

### Edge cases
- **Orphaned legs:** If a strategy object is deleted but its leg children aren't unwrapped first, legs leak. Mitigation: `close_strategy` must unwrap and settle all legs in the same PTB; Move's `key`-only abilities on legs prevent accidental drop.
- **Cross-object invariants:** A strategy's `current_capital` must equal the sum of its legs' values. This invariant spans objects and can't be enforced by the type system alone. Mitigation: recompute on every mutation inside the PTB; never trust a cached value across transactions.

### Scalability
Owned-object model scales horizontally — 10,000 users each mutating their own strategies generate zero write contention with each other. This is the single biggest scalability win in the design. Contrast: an EVM registry would bottleneck at the table's write throughput.

### Judging angle
This is the decision that proves the team understands *why Sui*, not just *that it's Sui*. Most hackathon teams port EVM patterns (global registries) onto Sui and get none of the benefit. Demonstrating object-native design is a technical-credibility differentiator. (See architecture.md §11.1 trust boundaries for how ownership maps to capabilities.)

---

## ADR-002: TEE (Nautilus) for the AI Compiler, not ZK proofs

### Context
The conviction compiler runs proprietary ML (neural-corrected IV pricing, LSTM forecasting — see architecture.md §4.1). We must prove it ran correctly without revealing the model. TEE or ZK?

### Decision
Nautilus TEE (AWS Nitro Enclaves) with on-chain attestation verification.

### Alternatives rejected

**ZK proofs of inference (zkML).** Rejected because: proving a multi-layer neural network forward pass in zero-knowledge is, as of 2026, prohibitively expensive in proving time for the model sizes we need (an LSTM with realistic hidden dimensions). A compile must return in under 5 seconds (test.md 3.11). zkML proving for a network this size is minutes-to-hours. The latency budget kills it.

**Fully on-chain computation.** Rejected because: Move is not built for floating-point ML inference, and putting the model weights on-chain reveals the proprietary alpha — the entire point of keeping it private dies.

**Trusted off-chain server with a signature.** Rejected because: a plain signature proves *who* signed, not *what code ran*. A compromised or malicious server could sign garbage. TEE attestation proves the *specific enclave image* ran — a categorical difference in trust.

### Tradeoff
We accept a hardware trust assumption (AWS Nitro's security model, Intel/AMD enclave integrity). This is weaker than ZK's pure-cryptographic guarantee. We are honest about this in the security model (architecture.md §11) and in the demo narrative — we don't oversell it as trustless.

### Edge cases
- **Enclave image drift:** If the deployed enclave doesn't match the published attestation hash, the chain must reject its output (test.md 3.10, architecture.md §12.2). The published hash is the contract; any mismatch is a hard reject, not a warning.
- **Attestation replay:** A valid old attestation could be replayed for a stale compilation. Mitigation: attestations embed a `valid_until` timestamp and a nonce bound to the request (architecture.md §11.3); the chain rejects expired or reused attestations.
- **Oracle staleness inside the enclave:** The enclave reads oracles at compile time; if the oracle is stale, the compile is wrong even if attested. Mitigation: the enclave includes the oracle timestamp in the attestation; the chain rejects compiles built on data older than N blocks.

### Scalability
TEEs scale by horizontal replication — spin up more enclaves behind a load balancer. Each compile is independent (stateless), so there's no coordination cost. The bottleneck becomes oracle read rate, not compute. ZK would have scaled worse: proving cost is per-request and doesn't amortize.

### Judging angle
This decision shows mature engineering judgment: choosing the *right* trust mechanism for the latency budget rather than reaching for the most fashionable one (zkML). When a judge asks "why not ZK?", the answer — "we measured the latency budget and zkML inference for our model size doesn't fit a 5-second compile" — signals a team that thinks in tradeoffs, not buzzwords. It also aligns directly with the Agentic Web track's emphasis on verifiable autonomous compute (see README track-fit section).

---

## ADR-003: Compose with Predict's native PLP vault, do NOT build a pm-AMM

> **Reversal note:** An earlier draft of this ADR proposed building Paradigm's pm-AMM as a parallel liquidity layer. Reading the DeepBook Predict problem statement reversed it: Predict already ships a liquidity vault. Building our own was redundant and was our single highest-risk scope item. This is the corrected decision.

### Context
HELIX needs liquidity for the binary/range/option positions a compiled conviction opens. Build our own market-making layer, or compose with what Predict provides?

### Decision
Compose with Predict's native **PLP** (Predict Liquidity Provider) vault. `predict::supply` deposits quote (dUSDC) into the PLP, which takes the other side of every trade; `predict::mint` opens positions against it; `predict::redeem_permissionless` settles. HELIX builds zero market-making infrastructure of its own.

### Alternatives rejected

**Build Paradigm's pm-AMM as a parallel liquidity layer.** Rejected because: Predict's PLP already solves the adverse-selection problem the pm-AMM was meant to solve — the vault is the counterparty, with on-chain LP economics anyone can audit. Re-implementing LMSR-with-time-decay in Move would have been a whole project on its own, duplicating infrastructure the protocol gives us for free. The judging bar explicitly punishes reinventing what the stack provides.

**Route binaries through DeepBook's CLOB only.** Rejected because: Predict positions are vol-surface-priced instruments minted against the PLP, not limit orders on a spot book. The PLP is the correct counterparty primitive; the CLOB is for spot/margin legs, which HELIX also composes when a structure needs them.

### Tradeoff
We inherit the PLP's design constraints (its utilization limits, its withdrawal-limiter token-bucket, its risk parameters) rather than controlling them. We accept dependence on a testnet primitive whose economics may change before mainnet — mitigated by the fact that projects are expected to redeploy on mainnet day one, so tracking PLP changes is expected work, not surprise risk.

### Edge cases
- **Resolution-time liquidity thinning:** Near a sub-hour expiry the PLP's effective depth for a given strike thins. The Risk Guardian surfaces this as a plain-language risk ("this position's market resolves in 11 minutes; exit liquidity is thin") — directly satisfying the Intent Engine "guardian catching ≥2 risk classes" requirement (ADR-009).
- **Stale SVI feed:** If `oracle::OracleSVIUpdated` lags, minted positions could be mispriced. Mitigation: the guardian checks SVI freshness and blocks/​warns on stale feeds (a second guardian risk class).
- **PLP utilization cap hit:** `predict::supply`/`mint` can fail if the vault is at capacity. Mitigation: the compiler checks PLP utilization before proposing a structure and falls back to a smaller size or a margin/spot-composed alternative.

### Scalability
We inherit Predict's scalability for liquidity — not our problem to solve. Per-user `PredictManager` accounts are independent objects (ADR-001 logic applies), so user activity doesn't contend. This removes the one genuinely hard scalability item the old pm-AMM design carried.

### Judging angle
"Genuine Sui Stack usage in the demo" is the explicit bar. Composing real `predict::mint`/`supply`/`redeem` calls against the live testnet PLP is exactly that — and it satisfies the DeepBook Predict minimum requirement ("integrate the Predict contract; work end to end"). Reinventing a pm-AMM would have read as not understanding the stack. Composing correctly reads as fluency.

---

## ADR-004: Cross-user cascading via undercollateralized credit, not pre-funded escrow

### Context
A child strategy in a conviction tree activates only if its parent resolves favorably (architecture.md §2.2, §5.2). How is the child's capital provisioned at activation?

### Decision
The child draws undercollateralized credit at activation time, backed by the parent's pledged collateral and the incentive-compatible model from Tim Dong's SFA 2024 paper. The parent pledges a *fraction*; the child activates with *leverage*.

### Alternatives rejected

**Pre-funded escrow** (child's full capital locked from creation). Rejected because: it's capital-inefficient. If you build a 5-level conviction tree, you'd lock the full capital for all 5 levels upfront, even though most branches may never activate. Capital sits idle. This kills the whole appeal of cascading — the point is *conditional* capital deployment.

**Flash-loan-at-activation** (borrow full capital, deploy, repay in same tx). Rejected because: a conviction-tree child holds a *position over time*, not a within-transaction arbitrage. Flash loans must repay atomically; a multi-day options position can't. Wrong tool.

### Tradeoff
Undercollateralized credit introduces default risk — if the child's position loses more than the pledged collateral, someone eats the loss. We bound this with the child's genetic `drawdown_kill_switch` (architecture.md §2.1 DNA) which force-liquidates before the loss exceeds collateral. We accept tail risk in exchange for capital efficiency.

### Edge cases
- **Cascade-of-cascades default:** A child that is itself a parent to grandchildren defaults — does it cascade down? Mitigation: each level's collateral is independent; a default at level 2 returns level-3 children's pledges (they never activate) but doesn't claw back from level-1. Losses are contained to the defaulting node.
- **Simultaneous activation race:** Two children of the same parent both try to draw credit against the same pledged collateral at the same block. Mitigation: collateral is partitioned per-child at link time, not pooled; no race because each child has its own reserved slice.
- **Parent resolves favorably but credit pool is dry:** The condition is met but undercollateralized credit isn't available. Mitigation: the child enters a "pending-activation" state and retries; if credit stays unavailable past a timeout, the pledge returns and the user is notified. The conviction was right but uncapitalized — an honest failure mode, surfaced clearly in the UI.

### Scalability
Each conviction tree is a set of independent objects; trees don't contend with each other. The shared resource is the credit pool, which is the one genuinely contended object. Mitigation at scale: shard credit pools by asset, and cap per-tree leverage so no single tree can drain a pool. This is the one place where ADR-001's "everything parallel" story has a real exception, and we name it honestly.

### Judging angle
This directly grounds the DeFi & Payments track in published research (Dong 2024) while extending the user's prior cascading-prediction concept into something cross-user and novel. The honesty about the credit-pool contention exception (rather than claiming infinite scalability) is itself a credibility signal — judges trust teams that name their own bottlenecks.

---

## ADR-005: Greeks netting on-chain object, computation off-chain in TEE

### Context
Portfolio-wide Greeks netting (architecture.md §2.3, §5.3) requires re-pricing every leg on every oracle tick. Where does the heavy math run, and where does the result live?

### Decision
Computation in the Hedging Agent TEE (architecture.md §4.2); the netted result lives in an on-chain `PortfolioRiskObject` updated via attested transaction.

### Alternatives rejected

**Compute Greeks on-chain in Move.** Rejected because: Greeks require the SVI surface and Black-Scholes partial derivatives — floating-point math Move isn't suited for, at a frequency (every oracle tick) that would be ruinously expensive in gas.

**Compute and store entirely off-chain (frontend or server).** Rejected because: then auto-hedging can't be trustlessly triggered. If the Greeks live only in a server, the hedge transaction has no on-chain basis to justify itself. Putting the netted result on-chain (with attestation) means the auto-hedge PTB can reference a verifiable risk state.

### Tradeoff
On-chain risk state lags the true state by one update cycle (the gap between oracle tick and the attested update transaction landing). During fast markets this lag matters. We accept bounded staleness in exchange for trustless hedge justification, and we bound the lag with the < 2s refresh target (test.md 5.25, architecture.md §13).

### Edge cases
- **Oracle tick faster than update can land:** In extreme volatility, oracle updates outpace the hedger's ability to recompute-and-submit. Mitigation: the hedger debounces — it always computes from the *latest* oracle state and discards stale in-flight computations, so it never submits a hedge based on outdated Greeks.
- **Partial portfolio view:** If one strategy's legs are mid-settlement (a DeepBook order half-filled), the netted Greeks are momentarily inconsistent. Mitigation: legs in a transitional state are marked `pending` and excluded from netting with a visible "computing…" state on the Risk Compass (frontend.md §7.4) rather than showing a wrong number.
- **User adds a strategy between ticks:** Net Greeks are stale until next compute. Mitigation: adding a strategy triggers an immediate out-of-band recompute rather than waiting for the next scheduled tick.

### Scalability
Per-portfolio computation is independent and parallelizable across enclaves (ADR-002 logic). The cost scales with total active legs across all portfolios. At scale, partition portfolios across a fleet of hedger enclaves by owner-address hash. The on-chain write is per-portfolio (owned object) — no contention.

### Judging angle
Portfolio-level Greeks netting is institutional-grade risk tooling that *no retail DeFi platform offers* (frontend.md positioning). Showing it work live on the Risk Compass during the demo is a memorable moment (plan.md Phase 5, demo script). The clean split — heavy math in verifiable compute, authoritative result on-chain — is a textbook example of using each layer for what it's good at.

---

## ADR-006: Genetic representation (DNA vector) over free-form strategy code

### Context
A strategy's behavior must be (a) compiled from a conviction, (b) breedable via crossover, (c) inspectable by other users, (d) stored on-chain. How do we represent strategy logic?

### Decision
A fixed-schema gene vector (`StrategyDNA`, architecture.md §2.1) where each gene maps to a concrete, bounded trading parameter. **Crossover operates only on the *behavioral/management* gene group — never on structure genes.**

### The coherence rule (decided design)
The DNA splits into two groups:
- **Structure genes** (which legs, which strikes, which expiries) — these are *always re-derived from a live conviction by the compiler*, never inherited.
- **Behavioral genes** (entry/exit signal types and thresholds, regime-sensitivity, hedge-trigger thresholds, position-sizing rule, kill-switch level) — these are what breeding mixes.

This closes a hole an earlier draft left open. Breeding a bull-call-spread (built for "bullish, calm") with an iron-condor (built for "range-bound") cannot produce a coherent payoff — the two structures express opposite beliefs. But breeding their *management styles* is fully coherent: a child inherits, say, one parent's patient mean-reversion entry and the other's aggressive kill-switch, then applies that management style to whatever structure the *user's own conviction* compiles. You evolve **how a strategy is managed**, not a Frankenstein payoff with no thesis behind it.

### Alternatives rejected

**Breed the whole DNA including structure genes.** Rejected because (above): crossing structure genes produces strategies optimal for no one's belief. The originality of "breeding" is preserved by confining it to management style, where crossover is meaningful.

**Arbitrary user-supplied strategy code** (upload a script). Rejected because: arbitrary code can't be safely crossed-over, can't be cheaply inspected, can't be deterministically stored/compared on-chain, and opens a malicious-code attack surface in copied strategies.

**A DSL for strategies.** Rejected because: more expressive but breeding becomes ill-defined and on-chain validation is heavy. The fixed vector makes breeding, comparison, and validation trivial and safe.

### Tradeoff
Expressiveness, and a narrower breeding surface. Confining crossover to behavioral genes means breeding can't discover novel *structures* — only novel *management*. We accept this happily: it's the price of every bred child being coherent. Structural novelty comes from the compiler responding to conviction, which is the right place for it.

### Edge cases
- **Behavioral contradiction after crossover:** e.g., a child inherits a tight kill-switch (5%) but an entry threshold that normally needs room to breathe. Mitigation: a post-crossover normalization pass (breeding.move, test.md 2.3) clamps mutually inconsistent behavioral genes into a viable envelope deterministically.
- **Gene-space gaming:** Users might breed toward degenerate behavioral genes that game fitness without real performance. Mitigation: fitness is risk-adjusted (Sharpe, drawdown — architecture.md §2.1) and measured on *live* P&L, so gaming requires actually making money.
- **Schema migration:** v2 adds a gene; v1 strategies lack it. Mitigation: genes have defaults; v1 DNAs deserialize with defaults; generation/version tracking prevents silent corruption.
- **Breeding is Phase-6 optional:** the Intent Engine loop must work without breeding ever being touched. Breeding/lineage is upside that never gates the core demo (plan.md scope note).

### Scalability
Fixed-size DNA is cheap to store, compare, and transmit. A million strategies' DNA is a manageable dataset. Crossover is O(gene-count) — constant time. This representation scales effortlessly; the bottleneck is never the DNA itself.

### Judging angle
The DNA metaphor is the project's *memorable conceptual hook* (idea.md, frontend.md visual signature). But it's not just a metaphor — it's a genuinely sound engineering choice (safe breeding, cheap inspection). When the concept and the engineering reinforce each other, the project reads as coherent rather than gimmicky. That coherence is what separates a winning demo from a clever-but-shallow one.

---

## ADR-007: zkLogin as the default identity, wallets as the power-user option

### Context
Onboarding. The target user (idea.md's Riya — a student who has never traded options) won't have a Sui wallet. How do they get in?

### Decision
zkLogin (Google/Apple sign-in → Sui address) as the default path; standard wallet connect (Sui Wallet, Suiet) for power users. (frontend.md §10.4, test.md 5.1–5.3.)

### Alternatives rejected

**Wallet-only.** Rejected because: requiring a seed-phrase wallet before a user can even *try* the Conviction Canvas loses 90% of the target audience at the door. The whole thesis is breaking the access walls (idea.md); a wallet requirement rebuilds one.

**Custodial accounts.** Rejected because: custody is a legal and trust liability, and it contradicts the self-sovereign premise. zkLogin gives wallet-less onboarding *without* custody — the user controls the address derived from their OAuth identity.

### Tradeoff
zkLogin adds a dependency on the OAuth provider and the zkLogin prover infrastructure. If Google auth is down, that login path is down. We accept this for the onboarding win, and we keep wallet-connect as an always-available fallback.

### Edge cases
- **OAuth account loss:** A user who loses their Google account loses that derived address. Mitigation: surface this clearly at onboarding and offer (optional) linking of a recovery wallet for users holding meaningful capital.
- **Sybil via throwaway OAuth accounts:** Free Google accounts are easy to mint, enabling wash-breeding to game offspring counts (architecture.md §11.4). Mitigation: breeding-marketplace listing requires a reputation threshold accrued through real activity, not just an identity — making Sybil farming uneconomic.

### Scalability
zkLogin scales as Sui's prover infrastructure scales (inherited). No per-user state we manage. Clean.

### Judging angle
Demonstrating zkLogin onboarding live — "watch me go from never-having-a-wallet to a deployed strategy in 30 seconds" — is a powerful UX-differentiation moment (presentation quality, plan.md Phase 8 demo). It also visibly uses a flagship Sui primitive in service of the product thesis, not as box-ticking.

---

## ADR-008: Indexer-backed reads, never trusting it for writes

### Context
ADR-001 means global queries (leaderboards, lineage trees) require off-chain indexing. How much do we trust the indexer?

### Decision
The indexer (architecture.md §10.2) is a *read-only convenience* rebuilt from on-chain events. It is never authoritative for any state-changing decision. Every write re-derives truth from on-chain objects inside the PTB.

### Alternatives rejected

**Trust indexer-reported state for writes** (e.g., read a strategy's capital from the indexer, use it in a transaction). Rejected because: the indexer can lag or be wrong, and an attacker who compromises the indexer could feed false state into transactions. Treating it as untrusted (architecture.md §11.1) closes this entirely.

### Tradeoff
Some logic is computed twice — once for the fast indexed read, once authoritatively on-chain. Mild redundancy in exchange for a clean trust boundary.

### Edge cases
- **Indexer lag during demo:** A freshly deployed strategy might not appear in the leaderboard for a moment. Mitigation: optimistic UI — the frontend shows the user's own just-created strategy immediately from the transaction result, reconciling with the indexer when it catches up (frontend.md optimistic patterns).
- **Indexer rebuild from genesis:** If the indexer DB is lost, it must replay all events. Mitigation: periodic snapshots so rebuild is bounded, not from-genesis.

### Scalability
Read-models scale with standard database techniques (read replicas, caching, materialized views). Because it's rebuildable and non-authoritative, we can shard or rebuild it freely without consensus implications.

### Judging angle
Articulating a clean trust boundary — "the indexer is untrusted, here's why that's safe" — is exactly the kind of security-mindedness that separates credible blockchain engineering from naive full-stack work. (Maps to architecture.md §11.1.)

---

## ADR-009: Lead with Agentic Web / Intent Engine, not DeFi & Payments

### Context
HELIX could plausibly submit to four tracks. A project submits with one primary framing. Which?

### Decision
Primary: **Agentic Web → Sub-track 3 (Intent Engine)**. Secondary: **DeepBook Predict**. Tertiary fallback: DeFi & Payments. Optional: Walrus (agent memory).

### Alternatives rejected

**DeFi & Payments as primary** (the earlier choice). Rejected because: it's the broadest, most crowded framing, and HELIX's strongest, most specific match is elsewhere. "Conviction-native financial primitive" is a fine pitch but generic against that track's field.

**DeepBook Predict as primary.** Strong fit and less crowded, but the track's idea bank centers on vaults/bots/analytics; HELIX is fundamentally an *intent* product that happens to execute on Predict. Better as the proven-integration substrate than the headline.

### Why Intent Engine is the sharpest fit
The sub-track's four must-haves (text→PTB, human-readable preview, guardian catching ≥2 risk classes, explicit confirm) are HELIX's exact spine. The sub-track explicitly rejects "swap chatbots with no guardian layer" — HELIX is an intent engine for *structured options positions* with a *real* guardian (the Risk Compass), which is the precise gap the track describes. This is the rare case where the project matches the prompt almost verbatim.

### Tradeoff
Leading with a Core track means a larger, stronger field than a specialized track. We accept tougher competition for a near-perfect prompt match, and we hedge by ensuring genuine Predict integration so the project is also a legitimate Specialized-track entry if routed there.

### Edge cases
- **"Is it really agentic?"** The compiler, guardian, and (optional) auto-hedge are autonomous agents that act and transact. The owner-revocation + capped-budget design (echoing Sub-track 2) reinforces the agentic claim beyond "LLM that emits a transaction."
- **Multi-track dilution:** Trying to win all four would dilute the demo. Mitigation: the demo proves *one* loop perfectly (Intent Engine) and *mentions* the others as composability depth.

### Judging angle
Matching a sub-track's must-have list line-for-line is the strongest possible "fit" signal. It also lets us cut breeding/lineage/Walrus from the critical path without weakening the primary pitch — they become depth, not dependencies.

---

## ADR-010: Read the SVI surface; do not compute neural-corrected pricing in the MVP

### Context
How does the compiler price candidate structures and pick the optimal one?

### Decision
Read Predict's live **SVI** volatility surface from `oracle::OracleSVIUpdated` (built with Block Scholes) and price structures against it. Neural-corrected IV (Paper 1) and LSTM option pricing (Paper 2) are explicitly **roadmap, not MVP**.

### Alternatives rejected

**Run neural-corrected Black-Scholes in a TEE for the MVP** (the earlier plan). Rejected for two reasons: (1) the protocol *already publishes* an institutional-grade SVI surface — recomputing it is redundant and would read as not understanding the stack; (2) Papers 1–2 require multi-year option histories pooled across underlyings, and Sui/Predict markets are weeks old, so the training data does not exist. Overclaiming this would fail the "no hollow sophistication" bar.

### Tradeoff
We give up a headline "we built novel ML pricing" claim. We gain honesty, less risk, and a faster path to a working demo. The genuine intelligence lives where it's defensible: mapping a conviction to the right structure (Paper 3) and the risk guardian's hedge logic (Paper 4, rule-based in MVP).

### Edge cases
- **Stale SVI:** guardian blocks/warns (also serves as a required guardian risk class — ADR-003).
- **Surface gaps for illiquid strikes:** compiler restricts proposals to strikes the surface actually covers; no extrapolation into untraded regions.

### Judging angle
"We read the protocol's SVI surface and structure positions against it" is a *stronger* technical-credibility statement than a dubious ML claim, because a DeepBook judge can verify the integration is real. Restraint reads as fluency.

---

## Cross-Cutting: System-Wide Edge Cases

Beyond per-decision edge cases, these span the whole system:

**Total oracle failure (Block Scholes + Pyth both down).** Compiler enters degraded mode (parametric BS only, architecture.md §12.1); auto-hedging pauses (can't compute Greeks without IV); existing positions are untouched; users are notified. The system degrades gracefully rather than failing closed.

**DeepBook Predict version break mid-hackathon.** Isolated behind `predict_adapter.move` (architecture.md §6, plan.md risk register). Only the adapter changes; the rest of the protocol is insulated.

**Demo-day testnet outage.** Pre-recorded demo segments + a local validator that boots in < 2 minutes (test.md 8.16) + a pre-funded backup wallet (test.md 8.14). The demo cannot be killed by infrastructure.

**Cascading liquidation contagion.** Structurally prevented: each conviction-tree node's risk is isolated (ADR-004 edge cases); sibling strategies don't share fate; the genetic kill-switch bounds each node's loss.

**A strategy that never resolves (stuck position).** Time-based exit genes (architecture.md DNA `exit_signal_type` including time-decay) ensure no strategy lives forever; the kill-switch and expiry provide hard backstops.

---

## Cross-Cutting: Scalability Summary

| Dimension | Scaling story | Bottleneck | Mitigation at scale |
|---|---|---|---|
| Strategy writes | Owned objects, fully parallel (ADR-001) | None inter-user | Inherent |
| Compilation | Stateless TEE replicas (ADR-002) | Oracle read rate | Cache oracle reads per block |
| Greeks netting | Parallel per-portfolio (ADR-005) | Total active legs | Shard enclaves by owner hash |
| Binary liquidity | Inherited from Predict PLP (ADR-003) | Predict's concern | Inherited |
| Cascading credit | Independent trees (ADR-004) | Shared credit pool | Shard pools by asset, cap leverage |
| Global reads | Rebuildable indexer (ADR-008) | DB throughput | Read replicas, materialized views |
| DNA storage/compare | Fixed-size vectors (ADR-006) | Negligible | Inherent |

The architecture has exactly one genuinely contended shared resource (the cascading credit pool, ADR-004) and we name it rather than pretending it away. Everything else is embarrassingly parallel by virtue of Sui's object model. This is the scalability thesis: **HELIX scales because it is object-native, not registry-native.**

---

## Cross-Cutting: Why This Wins (Synthesis Across Decisions)

Mapping the decisions to the five performance dimensions the project must dominate:

**Originality** — the conviction-compiler as an Intent Engine for *structured* positions (ADR-009), cross-user cascading credit (ADR-004), and behavioral-gene strategy evolution (ADR-006). No existing platform combines these, and none turn an intent engine toward options structuring with a real risk guardian.

**Visual sophistication** — frontend.md's editorial-bioluminescent fusion, made coherent by ADR-006 (the DNA metaphor is structurally real, not skin-deep).

**Technical credibility** — this entire document. Every choice defended against alternatives, every bottleneck named, six papers grounding the engine (README research section).

**Presentation quality** — ADR-007 (live zkLogin onboarding), ADR-005 (live Risk Compass during demo), the strategy-birth cinematic moment (frontend.md §6.2). The demo has memorable beats designed in.

**Execution feasibility** — plan.md's backend-first sequencing, test.md's 278 checkpoints, the mock-everything strategy (ADR-002 mock TEE, ADR-003 mock oracle) that guarantees a demoable system even if a hard dependency slips.

The through-line: every decision was made twice — once for what's correct, once for what's defensible to a judge. Where those diverged, we chose correct and documented the defense here.

---

*This document is living. As implementation reveals new forks, add ADRs. A decision made implicitly is a decision not understood. Write it down.*
