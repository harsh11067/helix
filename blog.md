# I Built a Lie Detector for Forecasters

## How HELIX uses Sui, Walrus Memory and Tatum to make a track record you can't fake, and that learns from itself

*By Kumar Harsh · Built for the Total Recall hackathon (Tatum × Walrus), November 2026*

---

Every prediction market forgets you the moment it settles.

Your best calls, your worst ones, the evidence of whether your judgment is any good: gone. Copy-trading apps rank people by profit, which over small samples is mostly luck. And a track record is the easiest thing in the world to fake. Delete the losers, screenshot the winners, post the thread.

So I built **HELIX**, a system where every call becomes evidence, and the evidence can't be edited after the fact. I call the idea **Proof-of-Forecast**: a credit score for judgment.

This is how it works, what the data says after two days of live use, and what I learned building it on Sui, Walrus Memory and Tatum.

> **Watch it in 20 seconds:** [the launch video](https://github.com/harsh11067/helix/blob/main/docs/media/helix-launch.mp4), made from the live app.
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

To have real data from day one, I ran a demo trader: an operator script that commits a BTC call every 15–20 minutes through the exact same server path as the browser. It has made **57 commits on Sui**, and **51 have settled. It won 20.**

Its stated confidence averages **81%**. Its realized win rate is **38%**. That gap of more than 40 points is the whole story, and memory caught it.

Brier score per voice over its settled calls (lower is better):

- The trader's own confidence: **0.45**
- DeepBook Predict market: **0.24**
- HELIX regime model: **0.24**
- Polymarket crowd (6 comparable calls): **0.20**
- The Council (22 calls): **0.28**

Here is the latest lesson HELIX wrote to its memory, word for word:

> *"up/high/choppy: Won 11/29 here; stated confidence runs ~48 points hot. Size down. The Predict market has been closer than you (Brier 0.23 vs 0.49)."*

Had the trader sized every call the way memory suggested, over its last 53 settled calls it would have lost **13.11 instead of 60.43**. That's a **memory dividend of +47.32**. It's a counterfactual: it ignores fills and slippage, and the app labels it as one.

*[Image: the Memory page, with a timeline of Walrus blob ids, Brier per voice and the reliability diagram]*

---

## Why a track record you can't fake is hard, and how HELIX does it

"Can't be faked" is a strong claim, so every part of it is checkable by someone who doesn't trust me.

**Can't be backdated.** The commit happens before settlement, and the contract rejects a past expiry. On top of that, HELIX runs a **continuous chain audit**. Every 30 minutes, every `ConvictionCommitted` event ever emitted is re-fetched as its own transaction through Tatum's Sui gateway and checked independently of the event index:

- the transaction exists and succeeded;
- its sender is the committer (sponsored commits included);
- its own event carries the same hash, market and expiry;
- its **checkpoint time**, which is consensus time rather than the contract's clock, is before the market's expiry.

At the time of writing: **141 of 141 commits pass. The closest one landed 17 seconds before its market expired.** You can [read the audit yourself](https://helix-compiler.onrender.com/proof/audit).

**Can't hide losers.** HELIX counts calls from chain events, not from its own database. A commit with no matching memory is shown as **hidden** on the forecaster's passport, and it counts as a loss once its window passes.

Our own demo trader honestly shows **hidden 2**, and both have a story. In the first, a server restart during a deploy landed between a commit and its memory write, so that conviction's text was never saved. In the second, the memory was written successfully but Walrus Memory's search no longer returns it, so HELIX can't verify it. I fixed the first cause (the writer retries, and the browser records the memory itself if needed). I left both counts visible. That's the point.

**Can't edit the text.** Every row on a passport has a **Verify** button. Your browser fetches the commit from Sui itself, re-hashes the remembered call with WebCrypto, and turns the row green only if they match. HELIX's server isn't in that loop.

*[Image: a Forecaster Passport with "Verify all", every row green]*

---

## The Council: agents with memory, weighted by memory

Four rule-based agents (no LLM) commit on BTC windows twice an hour. Each has its own Sui key, its own gas and its own Walrus Memory:

- **Momentum** follows the last 15 minutes of Predict settlement prices.
- **Reversion** fades outsized moves.
- **Surface** follows Predict's own probability that BTC finishes above the window's open.
- **Crowd** follows Polymarket on the same window.

Memory decides how much each one is trusted: weight ∝ 1/Brier, equal until an agent has five settled calls. After a night of live trading the weights have moved:

- **Surface: 33%** (Brier 0.16 over 20 calls)
- **Crowd: 25%**
- **Momentum: 22%**
- **Reversion: 19%**

Every weight change is itself a Walrus memory, 21 snapshots so far. The Council's blended view becomes a fifth voice in every compile, and memory scores it like any other.

---

## A record worth paying for: agents paying agents

The passport summary is free. The per-setup detail sits behind **HTTP 402**, using the Machine Payments Protocol on Sui (`@suimpp/mpp` and `mppx`):

1. Pay on Sui.
2. Sign a proof that binds the payment to your address.
3. Retry and receive the record with a receipt.

HELIX re-verifies every payment through Tatum, and a payment can't be replayed.

The Council has an **allocator**, an agent that pays to read a human forecaster's record before deciding whether to listen to them. It paid, read our demo trader's record, and rejected it:

> *"Brier 0.447 > 0.22 over 44 settled calls — not calibrated enough to trust."*

Memory buying memory. There have been 7 paid calls so far.

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

- **Batching:** the chain audit checks 20 transactions per GraphQL request using aliases, so 141 commits take 11 requests.
- **Stale-while-revalidate:** a compile never waits on the gateway for market data a few seconds old.

**Walrus Memory was the fastest part of the stack to get a first result from.** The relayer handles embeddings, Seal encryption and the Walrus upload, so I spent my time on the learning logic instead of storage plumbing. The real work came from memory being semantic while my data is structured:

- **Versioned records.** I store one fact per memory as a versioned `key=value` line, so each record is both searchable and parseable.
- **Searching a big namespace.** Recall is top-k similarity search, so past about 200 records some memories never rank in any query's top results. HELIX pages through `listMemories` and recalls in chunks. Before calling any commit hidden, it looks the record up by its exact transaction digest, which recall reliably ranks first.

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

**Try it:** [the app](https://helix-app-fovn.onrender.com/app.html) · [the demo trader's passport](https://helix-app-fovn.onrender.com/passport.html?id=helix-v1-4d922636976d) · [the Council](https://helix-app-fovn.onrender.com/app.html#/council) · [the chain audit](https://helix-compiler.onrender.com/proof/audit) · [GitHub](https://github.com/harsh11067/helix)

Built with [@Tatum_io](https://x.com/Tatum_io) and [@WalrusFoundation](https://x.com/WalrusFoundation) on Sui.

*Tags: Sui, Walrus, Prediction Markets, AI Agents, Web3*
