# I Built a Lie Detector for Forecasters

## How HELIX uses Sui, Walrus Memory and Tatum to make a track record you can't fake, and that learns from itself

*By Kumar Harsh · Built for the Total Recall hackathon (Tatum × Walrus), November 2026*

---

Every prediction market forgets you the moment it settles.

Your best calls, your worst ones, the evidence of whether your judgment is any good: gone. Copy-trading apps rank people by profit, which over small samples is mostly luck. And a track record is the easiest thing in the world to fake. Delete the losers, screenshot the winners, post the thread.

So I built **HELIX**, a system where every call becomes evidence, and the evidence can't be edited after the fact. I call the idea **Proof-of-Forecast**: a credit score for judgment.

This is how it works, what the data says after two days of live use, and what I learned building it on Sui, Walrus Memory and Tatum.

> **Watch the 3-minute demo:** [the walkthrough](https://github.com/harsh11067/helix/blob/main/docs/media/helix-demo.mp4), recorded from the live app with every number pulled from production at recording time (or the [20-second teaser](https://github.com/harsh11067/helix/blob/main/docs/media/helix-launch.mp4)).
>
> **Try it, no wallet needed:** [the app](https://helix-app-fovn.onrender.com/app.html?demo=1#/memory) · [a real forecaster's passport](https://helix-app-fovn.onrender.com/passport.html?id=helix-v1-4d922636976d) · [the live chain audit](https://helix-compiler.onrender.com/proof/audit) · [the code](https://github.com/harsh11067/helix)

---

## The loop in one minute

**1. You state a conviction.** On the Conviction Canvas you drag four sliders: direction, confidence, time horizon, and how choppy you think the market will be. HELIX compiles that into a real order on **DeepBook Predict**, Sui's on-chain options market, priced against its live volatility surface. You also see four other opinions on the same outcome: the market's own probability, HELIX's regime model, the Polymarket crowd when the windows line up, and a Council of AI agents.

*[Image: the Conviction Canvas, with sliders on the left and the compiled call, five voices and the risk guardian on the right]*

**2. Before the market settles, a hash of your call goes onto Sui.** One Move call, `helix::journal::commit`, stores the SHA-256 of your conviction, the market and its expiry. The contract refuses an expiry in the past, so a call can't be backdated. Every commit an address makes is a public event, so a losing call can't quietly disappear either.

**3. The full call is remembered on Walrus Memory (mainnet).** The text of your conviction, with the hash and the commit's transaction digest, becomes a `CONVICTION` memory in your own namespace.

**4. At settlement, HELIX reveals.** A watcher reads the settlement price, re-hashes the remembered text and checks it against the on-chain hash. Then it scores every voice and writes three more memories: an `OUTCOME`, a `CALIBRATION`, and, once a setup has three settled calls, a `LESSON` in plain English.

**5. The next compile reads that memory.** If you've been overconfident in this kind of setup, HELIX says so before you commit again: *"You set 5 · memory suggests 1.5."* It's a one-click suggestion, never a silent override.

You don't need any money to play. Committing costs only gas, and if your new wallet has no SUI, HELIX sponsors that one transaction.

---

## What memory learned about our demo trader

To have real data from day one, I ran a demo trader: an operator script that commits a BTC call every 15–20 minutes through the exact same server path as the browser. As of 10 Nov, 16:50 IST it has made **86 commits on Sui**, and memory has scored **76 settled calls. It won 28.**

Its stated confidence averages **82%**. Its realized win rate is **37%**. That gap of 45 points is the whole story, and memory caught it.

Brier score per voice over its settled calls (lower is better):

- The trader's own confidence: **0.46**
- DeepBook Predict market: **0.23**
- HELIX regime model: **0.24**
- Polymarket crowd (11 comparable calls): **0.30**
- The Council (41 calls): **0.24**

In its favourite setup (bullish, high confidence, choppy market) memory's suggestion is now 1.5 dUSDC instead of the 5 it wants to commit, because there its confidence runs about 55 points hot over 38 settled calls.

Had the trader sized every call the way memory suggested, over its last 52 settled calls it would have lost **31.56 instead of 136.08**. That's a **memory dividend of +104.52**. It's a counterfactual: it ignores fills and slippage, and the app labels it as one.

*[Image: the Memory page, with a timeline of Walrus blob ids, Brier per voice and the reliability diagram]*

### Watch it learn

The Memory page has a **time machine**. Drag the scrubber back, or press Replay, and the whole page re-renders from only the memories that existed at that moment. You watch the over-confidence gap open as losses accumulate, Brier per voice settle, and memory's suggestion for the same setup tighten from "take it at face value" to "size down". The browser runs the same calibration module as the server; it's bundled from the same source file, and a test checks that the replay at "now" equals the live page exactly.

The Council page has one too. Scrub it and you watch the agents' weights drift apart as memory learns who to trust.

*[Image: the time machine scrubbed back to the first day, next to the same page today]*

---

## Promises to your future self

Advice is easy to ignore, so HELIX also lets you make promises. I call them **Ulysses Rules**, after the sailor who had himself tied to the mast.

You pick from four templates:

- cap my commit when my gap in a setup is over N points;
- block high-confidence calls in choppy markets for a day after three straight losses;
- ask me to justify any call against the market's lean;
- a daily limit.

Each rule is a signed `RULE v1` memory on Walrus. When a rule matches a conviction, the guardian's warning becomes a **gate**: the Commit button stays disabled until you type an override, a sentence about why this time is different.

The override is remembered too (`OVERRIDE v1`), and memory scores it like any other call. Over time HELIX can tell you something no trading app does: how often you broke your own rules, and how those calls turned out.

Our demo trader holds two rules, *"Cap my commit at 2 dUSDC when my over-confidence gap in this setup is over 30 points"* and a losing-streak cool-down. It's a script, so when a rule binds, it commits anyway with an override sentence that says exactly that. Within a few hours, memory wrote this lesson, word for word:

> *"You broke your own rules 9 times and lost 5. Calls that kept your rules won 28/74; overrides won 4/9. Your exceptions have paid so far; watch that this holds."*

*[Image: the Canvas with the rule gate: "Your rule binds this call"]*

---

## Why a track record you can't fake is hard, and how HELIX does it

"Can't be faked" is a strong claim, so every part of it is checkable by someone who doesn't trust me.

**Can't be backdated.** The commit happens before settlement, and the contract rejects a past expiry. On top of that, HELIX runs a **continuous chain audit**. Every 30 minutes, every `ConvictionCommitted` event ever emitted is re-fetched as its own transaction through Tatum's Sui gateway and checked independently of the event index:

- the transaction exists and succeeded;
- its sender is the committer (sponsored commits included);
- its own event carries the same hash, market and expiry;
- its **checkpoint time**, which is consensus time rather than the contract's clock, is before the market's expiry.

As of 10 Nov, 16:50 IST: **249 of 249 commits pass**, re-verified in 13 Tatum requests. **The closest one landed 17 seconds before its market expired.** You can [read the audit yourself](https://helix-compiler.onrender.com/proof/audit).

**Can't hide losers.** HELIX counts calls from chain events, not from its own database. A commit with no matching memory is shown as **hidden** on the forecaster's passport, and it counts as a loss once its window passes.

Our own demo trader honestly shows **hidden 4**, and each has a story. One commit's memory was never written: a server restart landed between the commit and the write (fixed: deploys now drain in-flight writes before exiting). For the others, the memories were written (the blob ids are in our logs) but Walrus Memory's search no longer returns them, so nobody can re-check the text today.

Where the settlement watcher wrote an OUTCOME with `reveal_ok=true`, it had already re-hashed that call against the chain when it settled, so HELIX counts it as *verified at settlement* rather than hidden, and says so on the row. Where even that memory is unreachable, the call stays hidden. I left every count visible. That's the point.

**Can't edit the text.** Every row on a passport has a **Verify** button. Your browser fetches the commit from Sui itself (through Tatum's GraphQL gateway) and re-hashes the remembered call with WebCrypto. The server separately re-reads the same transaction through **Tatum's gRPC interface**, decoding the event from raw BCS. A row turns ✓✓, *verified via 2 Tatum interfaces*, only when both match. If gRPC is down, the row honestly says "1 interface".

**Can't fudge the settlement.** Every BTC outcome records three independent prices for the same moment: the DeepBook Predict oracle's settlement, Pyth's first published price, and Tatum's exchange rate. Passport rows show *3 price sources agree ✓ · ≤ 2 bps*, or turn red when they don't.

*[Image: a Forecaster Passport with "Verify all", every row green]*

**Can't be rewritten later, even by us.** A live passport keeps changing, so any passport can be frozen: HELIX signs a snapshot with its published attestor key and stores it as a Walrus blob, plus a `REPORT` memory pointing at it. The [report page](https://helix-app-fovn.onrender.com/passport.html?report=aJ9wNCpB6XUvGDkkYd261wpr9JUggd3cMW1ghPDpqi8) reads the blob straight from a Walrus aggregator and checks the signature in your browser. If HELIX disappeared tomorrow, that record would still be there, and still verifiable.

---

## The Council: agents with memory, weighted by memory

Four rule-based agents (no LLM) commit on BTC windows twice an hour. Each has its own Sui key, its own gas and its own Walrus Memory:

- **Momentum** follows the last 15 minutes of Predict settlement prices.
- **Reversion** fades outsized moves.
- **Surface** follows Predict's own probability that BTC finishes above the window's open.
- **Crowd** follows Polymarket on the same window.

Memory decides how much each one is trusted: weight ∝ 1/Brier, equal until an agent has five settled calls. After a night of live trading the weights have moved:

- **Surface: 34%** (Brier 0.16 over 39 calls)
- **Crowd: 24%**
- **Momentum: 23%**
- **Reversion: 19%** (Brier 0.29, the least trusted)

Every weight change is itself a Walrus memory, 41 snapshots so far. The Council's blended view becomes a fifth voice in every compile, and memory scores it like any other.

---

## A record worth paying for: agents paying agents

The passport summary is free. The per-setup detail sits behind **HTTP 402**, using the Machine Payments Protocol on Sui (`@suimpp/mpp` and `mppx`):

1. Pay on Sui.
2. Sign a proof that binds the payment to your address.
3. Retry and receive the record with a receipt.

HELIX re-verifies every payment through Tatum, and a payment can't be replayed.

The Council has an **allocator**, an agent that pays to read a human forecaster's record before deciding whether to listen to them. It paid, read our demo trader's record, and rejected it:

> *"Brier 0.453 > 0.22 over 82 settled calls — not calibrated enough to trust."*

Memory buying memory. It has re-checked, paid and rejected the trader 10 times so far.

---

## Your reputation, on-chain and soulbound

The same record also exists as a **soulbound object on Sui** (`helix_passport`). HELIX signs a BCS attestation, and the contract checks it with `ed25519_verify` before minting. The object has no `store` ability, so it can't be transferred or sold, and any protocol can gate on it:

```move
gate_example::assert_calibrated(passport, max_brier, min_n);
```

A brand-new wallet with zero SUI can commit a call and mint its passport, with both transactions sponsored. Every Council agent holds one too.

---

## Beyond BTC

DeepBook Predict lists only BTC today, which I checked on-chain, so ETH and SUI calls run in commit mode and settle against **Pyth**. ETH uses Pyth's Hermes API: the first price published at or after expiry, with the lag recorded. SUI uses Pyth's signed price updates on Sui, read through Tatum. Every settlement also gets an **independent price witness** from Tatum's exchange-rate API, stamped on the outcome with its gap to the oracle in basis points.

My first ETH call settled at $2,122.96 against a strike of $2,126.18, with the Pyth price published exactly at expiry. It was a loss, and it's recorded as one.

---

## What I learned building it

**Tatum is the only path to Sui, and that's a feature.** Sui retired public JSON-RPC this year, so every read, event query and transaction in HELIX goes through Tatum's GraphQL gateway on testnet, and memory proofs go through its mainnet gateway. One server-side queue respects the free plan's 3 requests per second, with jittered backoff, so the browser never sees the key. Two things made it fast in practice:

- **Batching:** the chain audit checks 20 transactions per GraphQL request using aliases, so a full re-verification of every commit takes about a dozen requests.
- **Stale-while-revalidate:** a compile never waits on the gateway for market data a few seconds old.
- **Two interfaces.** Tatum also serves Sui gRPC (`sui-testnet-grpc.gateway.tatum.io`). It's plain gRPC, not grpc-web, so the server speaks it directly with a small HTTP/2 client and protobuf codec. That gives every proof a second, independent read.
- **A credit runway, measured.** Every call is counted at the chokepoint by interface and operation. A public [Ops panel](https://helix-app-fovn.onrender.com/ops.html) shows calls per hour, latency, cache hits, and when the free plan's credits would run out at the current rate. It also counts direct fullnode calls by HELIX: zero. Measuring paid off immediately. It found a Council warm-up loop re-reading every agent's commits every 45 seconds; that loop now shares one incremental event log, and the settlement watcher sleeps until each market's expiry instead of polling.
- **Degrade mode.** If Tatum ever refuses the key, HELIX serves cached reads, pauses writes and shows a banner. It never falls back to a public fullnode silently.

**Walrus Memory was the fastest part of the stack to get a first result from.** The relayer handles embeddings, Seal encryption and the Walrus upload, so I spent my time on the learning logic instead of storage plumbing. The real work came from memory being semantic while my data is structured:

- **Versioned records.** I store one fact per memory as a versioned `key=value` line, so each record is both searchable and parseable.
- **Searching a big namespace.** Recall is top-k similarity search, so past about 200 records some memories never rank in any query's top results. Which ones drift between calls: on the last day, 35 of the demo trader's 307 listed blobs weren't returned by any query, and the index-rebuild call only saw 36 candidates because of a per-owner cap. HELIX pages through `listMemories`, recalls in chunks, looks records up by exact digest, and keeps a **mirror** of every record it has ever recalled. A mirrored record counts only while its blob is still listed on the account, so a remembered call can't flip to "hidden" just because search was unlucky.

**The browser deserves the same care as the chain.** My first user test was blunt: connecting a wallet was slow, page changes glitched, and the graph lagged. I measured it in a headless browser instead of guessing:

- **Loading:** the app pulled about 236 separate SDK modules before it could run. Vendoring the exact same SDK versions as six bundles brought the page to interactive in under half a second.
- **Wallet:** the wallet chip now appears the moment you approve.
- **Canvas:** the payoff curve follows the commit slider in 4 milliseconds.

---

## Where this goes

Proof-of-Forecast is a credit score for judgment, and three groups need one:

- **Prediction venues and copy-trading apps** can rank people by skill instead of luck, with a passport badge any user can verify.
- **AI agents** can check whether a signal source is calibrated before they act on it, and pay per call to find out.
- **Tournaments** can publish results nobody can dispute.

Next on the list:

- mint real positions when DeepBook Predict reaches mainnet;
- import history from Polymarket and Predict;
- open the Council to third-party agents;
- give users their own memory spaces;
- move scoring into a TEE.

---

## Honest limits

- Trading is on Sui testnet; memory is on Walrus Mainnet.
- DeepBook Predict v4's test USDC is distributed by hand, so most calls are commit-mode calls: real on-chain commits and real settlements, with no money at stake.
- The hosted memory relayer sees plaintext. User-owned memory spaces are on the roadmap.
- Small samples are noisy. HELIX always shows n, uses a Beta(2,2) prior and only writes lessons at n ≥ 3.
- The demo trader is a script, and every one of its memories is tagged `origin=cli`.

---

**Don't trust me, check:** `git clone https://github.com/harsh11067/helix && cd helix/tee && npm ci && node scripts/verify-all.mjs` re-hashes random calls on your machine and compares them with Sui over two Tatum interfaces, checks the passport's signature, fetches the latest frozen report straight from Walrus, and verifies a memory on Walrus mainnet.

**Try it:** [the app](https://helix-app-fovn.onrender.com/app.html) · [the demo trader's passport](https://helix-app-fovn.onrender.com/passport.html?id=helix-v1-4d922636976d) · [the Council](https://helix-app-fovn.onrender.com/app.html#/council) · [the chain audit](https://helix-compiler.onrender.com/proof/audit) · [GitHub](https://github.com/harsh11067/helix)

Built with [@Tatum_io](https://x.com/Tatum_io) and [@WalrusFoundation](https://x.com/WalrusFoundation) on Sui.

*Tags: Sui, Walrus, Prediction Markets, AI Agents, Web3*
