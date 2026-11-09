# HELIX: Proof-of-Forecast on Sui, Walrus Memory and Tatum

*Draft written Tue 10 Nov 2026, ~02:30 IST. Every number below is live data from that time; refresh them from the links before publishing.*

Every prediction market forgets you the moment it settles. Your best calls, your worst ones, the evidence of whether your judgment is any good: gone. Copy-trading apps rank people by PnL, which over small samples is mostly luck, and a track record is easy to fake. Delete the losers, screenshot the winners.

HELIX keeps the evidence, and makes it impossible to fake.

## The loop

1. **You state a conviction about BTC.** Direction, confidence, horizon, how choppy you think it'll be. HELIX prices it against **DeepBook Predict's** on-chain volatility surface and shows you four other voices on the same outcome: the Predict market, HELIX's regime model, the Polymarket crowd when the windows match, and a Council of agents.
2. **Before the market settles, a hash of your call goes onto Sui.** `helix::journal::commit` stores sha256(conviction), the market and its expiry, and refuses an expiry in the past. A call can't be backdated, and every commit by an address is a public event, so a losing call can't be hidden.
3. **The full record goes to Walrus Memory on Mainnet.** It's a CONVICTION memory that carries the hash and the commit digest.
4. **At settlement, HELIX reveals.** The watcher reads the settlement price through **Tatum**, re-hashes the remembered text against the on-chain hash (`reveal_ok`), and scores every voice. It then writes OUTCOME, CALIBRATION and, once a setup has three settled calls, a LESSON.
5. **The next compile reads that memory.** "You set 5 · memory suggests 1.5." A one-click accept, never a silent override.

No money moves in commit mode. You only need gas, and if your new wallet has none, HELIX sponsors that one call.

## Tatum is the only path to Sui

Sui retired public JSON-RPC this year, so HELIX talks to Sui through Tatum's GraphQL gateway. That covers every read, every event query, every transaction we execute, and the mainnet reads that prove a memory exists. The free plan allows 3 requests a second, so one serialized queue with jittered backoff serves the whole service. The browser never sees the key. Tatum's exchange-rate API is a second price witness, and the risk guardian flags it when the two sources disagree.

## What memory learned about our demo trader

The demo trader is an operator script that has been committing every 15 to 20 minutes since Monday afternoon. **41 calls have settled; it won 15.** Its stated confidence averages about 43 points above its actual win rate. Brier score per voice, lower is better:

| Voice | Brier |
|---|---|
| The trader's own confidence | 0.46 |
| DeepBook Predict market | 0.24 |
| HELIX regime model | 0.24 |
| Polymarket crowd (when comparable) | 0.22 |
| The Council | 0.29 |

So HELIX now tells it: *"up/high/choppy: Won 7/21 here; stated confidence runs ~52 points hot. Size down. HELIX's regime model has been closer than you."* Had it followed memory's suggested sizes over its last 19 settled calls, it would have lost **13.66 instead of 50.70**, a memory dividend of **+37.04**. That's a counterfactual: it ignores fills and slippage, and the app labels it so.

## The Council: agents with memory, weighted by memory

Four rule-based agents (no LLM) commit on every 15-minute window twice an hour. Each has its own Sui key, its own gas and its own Walrus Memory:

- **Momentum** follows the last 15 minutes of Predict settlement prices.
- **Reversion** fades outsized moves.
- **Surface** follows Predict's own probability that BTC finishes above the window's open.
- **Crowd** follows Polymarket on the same window.

Memory decides how much each is trusted (1/Brier, equal until an agent has 5 settled calls). Overnight the weights moved: **Surface ~38%** (won 8 of 10), Crowd ~23%, Reversion ~21%, **Momentum ~19%** (won 3 of 10). Every weight snapshot is itself a Walrus memory. The Council is also a voice in every compile: the market's own surface, re-centred on the agents' edge.

## Forecaster Passport: one click from proof

Every forecaster, human or agent, gets a public passport. Committed and hidden calls are counted from Sui events, not from our database. Every row has a **Verify** button: your browser fetches the commit from Sui, re-hashes the remembered call with WebCrypto, and turns green if they match. The summary is Ed25519-signed by HELIX, with the key published at `/.well-known/helix-attestation.json`.

The same record is a **soulbound object on Sui** (`helix_passport`). HELIX signs a BCS attestation and the contract checks it with `ed25519_verify`. The object has no `store`, so it can't be transferred, and any protocol can gate on it: `gate_example::assert_calibrated(passport, max_brier, min_n)`.

Our demo trader's passport honestly says **hidden 1**. During a deploy, the server restarted between one commit landing on Sui and its memory being written, and that conviction's text was lost. HELIX can't show what it didn't remember, but it can't pretend the commit didn't happen either, so the passport counts it. We fixed the cause (the writer now retries recording the same commit, and the browser records it itself if needed), and we left the 1 visible. That's the point.

## A record worth paying for: agents pay agents

The passport summary is free. The per-setup detail sits behind **HTTP 402** using the Machine Payments Protocol on Sui (`@suimpp/mpp` and `mppx`):

1. Pay on Sui.
2. Sign a proof binding the payment to your address.
3. Retry and get the record with a receipt.

HELIX re-verifies every payment through Tatum, and a payment can't be replayed. The Council's **allocator** is an agent that pays to read a human forecaster's record before deciding whether to listen to them. It paid, read the demo trader's record, and rejected it: *"Brier 0.444 > 0.22 over 36 settled calls — not calibrated enough to trust."* Memory buying memory.

## Ask your memory

"When am I most overconfident?" Walrus Memory's own `ask` answers from your records and cites the memories it used. HELIX then checks every number in the answer against those memories and falls back to its own stats if any number doesn't match.

## Where this goes

Proof-of-Forecast: a credit score for judgment.

- Venues and copy-trading apps can rank people by skill instead of luck.
- Agents can check whether a signal source is calibrated before they act, and pay per call to find out.
- Tournaments can publish results nobody can dispute.

Next: real Predict positions when DeepBook Predict reaches mainnet, history import from Polymarket and Predict, more assets, user-owned memory spaces, and TEE-signed scoring.

## Honest limits

- Trading is on Sui testnet; memory is on Walrus Mainnet.
- DeepBook Predict v4's test USDC is distributed by hand, so most calls are commit-mode (paper) calls with real on-chain commits.
- The hosted memory relayer sees plaintext.
- The paid API charges testnet SUI until we hold Circle testnet USDC.
- Small samples are noisy. HELIX always shows n and gates lessons at n ≥ 3.

**Try it:** the [app](https://helix-app-fovn.onrender.com/app.html), the [demo trader's passport](https://helix-app-fovn.onrender.com/passport.html?id=helix-v1-4d922636976d), [the Council](https://helix-app-fovn.onrender.com/app.html#/council), the [code](https://github.com/harsh11067/helix). Built with @Tatum_io and @WalrusFoundation on Sui.
