# How HELIX uses Tatum

HELIX reaches Sui **only** through Tatum. One server-side chokepoint (`tee/src/shared/tatum.ts`) holds the API key, queues every request at the free plan's 3 req/s (per key, shared by all interfaces), retries with jittered backoff, and counts everything. The live numbers are on the **Ops panel**: [`ops.html`](https://helix-app-fovn.onrender.com/ops.html) (data: [`/ops/tatum`](https://helix-compiler.onrender.com/ops/tatum)).

| Tatum interface | Host | What HELIX does with it |
|---|---|---|
| Sui testnet · GraphQL | `sui-testnet.gateway.tatum.io` | Every read the app makes (Predict markets and pricer, wallets' coins and objects, `ConvictionCommitted` events, Pyth's SUI updates, payment verification), every transaction executed (`/tx/execute`), the browser's allow-listed `/graphql` proxy, and the continuous chain audit (20 transactions per request) |
| Sui testnet · gRPC | `sui-testnet-grpc.gateway.tatum.io` | The second interface behind every Passport **Verify**: the commit transaction read via `sui.rpc.v2.LedgerService/GetTransaction` (BCS event decoded), so a row turns ✓✓ only when GraphQL and gRPC both match the remembered text's sha256 |
| Sui mainnet · GraphQL | `sui-mainnet.gateway.tatum.io` | Memory proofs: the Walrus Memory account object (owner, delegate keys) next to the blob from the Walrus mainnet aggregator |
| Sui mainnet · gRPC | `sui-mainnet-grpc.gateway.tatum.io` | The same account object via `LedgerService/GetObject`; the proof reports `via: [tatum-graphql-mainnet, tatum-grpc-mainnet]` and whether they agree |
| Exchange-rate Data API | `api.tatum.io/v3/tatum/rate/{SYM}` | The price witness: BTC, ETH and SUI checked against the oracle at compile time and stamped on every OUTCOME memory (`witness_usd`, `witness_bps`) |

**Measured, not promised.** Every outbound fetch is counted by host, so "direct fullnode calls by HELIX: 0" on the Ops panel is a counter. One exception is shown there too: the Walrus Memory SDK opens its Seal session against the mainnet Sui endpoint its relayer advertises (`mysten-rpc.mainnet.sui.io`) and has no option to inject a client, so those calls belong to the memory layer, not to HELIX's Sui access.

**Credit runway.** `/health` → `tatum.usage` reports calls per hour by interface and operation, p50/p95 latency, error and cache-hit rates, and `projected_exhaustion_iso`, projected from the dashboard figure (`TATUM_CREDITS_USED`, set by hand at deploy) plus every call counted since. To stay inside the free plan through judging, the settlement watcher is expiry-driven (no fixed polling), the Council and every passport share one incremental log of commit events, the Council's market reads run only before it commits (or every 4.5 min for the live page), and `COUNCIL_INTERVAL_MIN` stretches the Council's cadence after submission.

**Degrade mode.** If Tatum refuses the key (HTTP 401/402/403: quota or auth), HELIX serves the last cached answer for reads, pauses writes (commits, Council agents), and shows a banner: *"Live chain reads paused — showing cached data."* It never falls back to a public fullnode silently.

**Not used.** Tatum's malicious-address screening documents Ethereum, Bitcoin, Litecoin, Solana and Tron, not Sui, so the gas sponsor can't screen Sui addresses with it; it relies on per-address and global sponsorship caps instead. **AI Builder** was not used (HELIX is an indie build that predates the event).
