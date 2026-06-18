# CLAUDE.md — HELIX Operating Context for Claude Code (Opus 4.8)

> Drop this file at the repo root. Claude Code reads it automatically. It tells you who I am, what we're shipping, what's mock, what's real, and what NOT to touch.

---

## 0. Mission

HELIX is a hackathon submission for **Sui Overflow 2026**, primary track **Agentic Web → Sub-track 3 (Intent Engine)**, secondary **DeepBook Predict**.

The product is an Intent Engine for structured options positions on DeepBook Predict: user expresses a plain-English conviction → AI compiler emits a PTB → Risk Guardian flags ≥2 risk classes in plain language → explicit confirm → `predict::mint` executes on Sui testnet → strategy object visible in the user's `PredictManager`.

**That loop is the demo.** Everything else is upside that must never delay it.

Phases 0–3 are done (56 Move tests / 20 TEE tests / 7 indexer tests passing locally). We are now in the **flip phase**: swap mocks for real Sui testnet integration and wire the frontend to the backend.

---

## 1. First-run setup (do this immediately, once)

Install the official Mysten Labs agent skills — they give you Sui-authored patterns for wallet connect, PTB composition, Move, publishing, and data access. Without these you'll reinvent and waste tokens.

```bash
npx skills add mystenlabs/skills --all
```

The skills you will lean on most for this 2-hour window:
- `frontend-apps` — dApp Kit wallet connect + transaction execution patterns
- `ptbs` — PTB composition, gas, sponsorship
- `accessing-data` — querying on-chain state, subscribing to events
- `sui-publish` — publishing the Move package to testnet
- `sui-client` — faucets, switching networks, balances

If a task is in your skill set, **call the skill** before generating from priors.

---

## 2. The repository

```
helix/
├── contracts/                      Move package (56 tests passing)
│   ├── Move.toml
│   └── sources/
│       ├── dna.move                strategy DNA (structure + behavioral genes)
│       ├── strategy.move           StrategyObject lifecycle
│       ├── breeding.move           behavioral-gene crossover (Phase 6, optional)
│       ├── conviction_tree.move    cascading conditions (Phase 6, optional)
│       ├── marketplace.move        copy + breed marketplace (Phase 6, optional)
│       ├── portfolio_risk.move     Greeks netting object
│       ├── leg_factory.move        leg construction
│       ├── predict_adapter.move    >>> currently imports mock_predict, MUST FLIP <<<
│       ├── mock_predict.move       >>> delete after flip <<<
│       ├── bridges.move            TEE attestation verification (stubbed)
│       ├── walrus_adapter.move
│       ├── compose_adapter.move    deepbook_margin / iron_bank / spot stubs
│       ├── access_control.move
│       └── events.move
├── tee/                            Off-chain agents (20 tests passing)
│   ├── src/
│   │   ├── compiler/               conviction → DeepBook Predict structure (Pareto select)
│   │   ├── hedger/                 Greeks netting + delta hedge
│   │   ├── regime/                 4-state regime classifier
│   │   ├── backtest/               deterministic PRNG-based simulator
│   │   └── shared/
│   │       ├── mockOracle.ts       >>> MUST FLIP to real SVI fetch <<<
│   │       ├── mockWalrus.ts       optional upgrade
│   │       └── attestation.ts      HMAC mock — keep, label clearly
├── services/indexer/               read-models + WS (7 tests passing)
│   └── src/
│       ├── store.ts                in-memory; keep for demo
│       └── eventSource.ts          SuiEventSource is written, just not active
└── tistu/                          frontend
    ├── index.html                  landing (design source of truth, DO NOT TOUCH)
    ├── app.html                    SPA entry
    ├── css/
    │   ├── helix.css               design tokens (DO NOT TOUCH)
    │   └── app.css                 SPA shell styles
    └── js/
        └── app.js                  >>> mocked, MUST WIRE TO REAL BACKEND <<<
```

---

## 3. DeepBook Predict — verified testnet addresses (use these literally)

These are pinned to the `predict-testnet-4-16` branch and verified against the official Sui docs.

```
Network             Testnet
Public server       https://predict-server.testnet.mystenlabs.com
Predict package     0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138
Predict registry    0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64
Predict object      0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a
Quote asset (DUSDC) 0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC
PLP coin type       0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::plp::PLP
Source branch       https://github.com/MystenLabs/deepbookv3/tree/predict-testnet-4-16/packages/predict
DUSDC faucet form   https://tally.so/r/Xx102L
```

**Source modules to consult before writing the adapter:**
- `packages/predict/sources/predict.move` — core shared object, mint/redeem/supply entry points
- `packages/predict/sources/predict_manager.move` — `PredictManager` account model
- `packages/predict/sources/oracle.move` — `OracleSVI` lifecycle and read functions
- `packages/predict/sources/vault/vault.move` — PLP vault accounting
- `packages/predict/sources/registry.move` — registry + admin entry points

**Public server endpoints we use:**
```
GET /predicts/:predict_id/state              market state
GET /predicts/:predict_id/oracles            oracle list
GET /oracles/:oracle_id/state                current oracle
GET /oracles/:oracle_id/svi/latest           latest SVI surface  <<< replaces mockOracle.ts
GET /predicts/:predict_id/vault/summary      vault summary
GET /managers/:manager_id/summary            user's PredictManager summary
GET /managers/:manager_id/positions/summary  user's positions
GET /managers/:manager_id/pnl?range=ALL      PnL
GET /oracles/:oracle_id/prices/latest        latest oracle price
```

**Live Sui events to subscribe to** (filter by Predict package id):
- `oracle::OraclePricesUpdated`
- `oracle::OracleSVIUpdated`
- `oracle::OracleSettled`
- `oracle::OracleActivated`

---

## 4. The 2-hour mission (ordered, do not deviate)

The goal of this window is a single working end-to-end transaction on testnet, demonstrable to a judge. Do the tasks in order. Do not start a task before the previous one passes its acceptance test.

### Task 1 — Real SVI feed (15 min)

**File:** `tee/src/shared/oracle.ts` (new) and update imports in `tee/src/compiler/compiler.ts`

Replace `mockOracle.ts` usage with a real fetch against the public Predict server. Keep `mockOracle.ts` exported under an `OFFLINE=1` env flag for tests.

```typescript
// tee/src/shared/oracle.ts
const BASE = process.env.PREDICT_SERVER ?? "https://predict-server.testnet.mystenlabs.com";

export async function fetchLatestSVI(oracleId: string) {
  const r = await fetch(`${BASE}/oracles/${oracleId}/svi/latest`);
  if (!r.ok) throw new Error(`SVI fetch failed ${r.status}`);
  return r.json(); // includes SVI params: a, b, rho, m, sigma + spot, forward, timestamp
}

export async function fetchOracleState(oracleId: string) {
  const r = await fetch(`${BASE}/oracles/${oracleId}/state`);
  if (!r.ok) throw new Error(`oracle state fetch failed ${r.status}`);
  return r.json();
}

// staleness guard for the Risk Guardian (one of the ≥2 required risk classes)
export function isSVIStale(svi: { timestamp: number }, maxAgeSec = 60): boolean {
  return (Date.now() / 1000 - svi.timestamp) > maxAgeSec;
}
```

**Acceptance:** `node --test tee/test/compiler.test.ts` still passes; with `OFFLINE=0` and network, compiler now returns a structure priced against real testnet SVI; staleness check returns true for SVI older than 60s.

### Task 2 — Real `predict_adapter.move` (30 min)

**File:** `contracts/sources/predict_adapter.move`

Swap the `use helix::mock_predict` import for the real package address. Update `Move.toml` to declare the real Predict package as a dependency (or, since Predict is a published package, reference it by address in the adapter's function bodies using fully-qualified addresses).

**Approach:** keep your wrapper interface stable (so the rest of the contracts compile unchanged). Inside each function, call the real `predict::mint`, `predict::supply`, `predict::redeem_permissionless` with the verified addresses. Use the `Predict` shared object id, the `PredictRegistry` id, and the appropriate `OracleSVI` id (read from `/predicts/:predict_id/oracles`).

Move.toml additions:
```toml
[dependencies]
DeepBookPredict = { git = "https://github.com/MystenLabs/deepbookv3.git", subdir = "packages/predict", rev = "predict-testnet-4-16" }
```

Then in `predict_adapter.move`:
```move
use deepbook_predict::predict;
use deepbook_predict::predict_manager::{Self, PredictManager};
use deepbook_predict::oracle::{Self, OracleSVI};
```

**Delete** `mock_predict.move` once the adapter compiles against the real package and tests pass with a real-Predict integration target.

**Acceptance:** `sui move build` succeeds with the real Predict dependency; existing Move tests that exercised the mock now run against a testnet-target build (some tests may need to be guarded with `#[test_only]` if they depended on `mock_predict` constructors — gate those, do not delete).

### Task 3 — Publish to testnet (15 min)

Use the `sui-publish` skill. Get testnet SUI from `sui client faucet`, get DUSDC from the form (https://tally.so/r/Xx102L — fill in advance if you haven't), then publish.

```bash
cd contracts
sui client switch --env testnet
sui client publish --gas-budget 500000000
```

Record the published package ID. Put it in a top-level `.env` file the frontend and TEE both read:

```
HELIX_PACKAGE=0x...                           # from publish output
PREDICT_PACKAGE=0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138
PREDICT_REGISTRY=0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64
PREDICT_OBJECT=0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a
DUSDC_TYPE=0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC
SUI_NETWORK=testnet
PREDICT_SERVER=https://predict-server.testnet.mystenlabs.com
```

**Acceptance:** the package is verifiable on Sui Explorer at `https://suiexplorer.com/object/<HELIX_PACKAGE>?network=testnet` with the expected module list.

### Task 4 — Frontend wallet + real /compile + real PTB submit (60 min)

**Files:** `tistu/js/app.js` and a new `tistu/js/sui.js` for SDK plumbing.

This is the biggest task. Use the `frontend-apps` Sui skill — it has the exact dApp Kit patterns you need. Stay in vanilla JS (do not migrate to React/Next; you don't have time). Load Sui SDK from CDN.

```html
<!-- in tistu/app.html, before closing </body> -->
<script type="module">
  import { SuiClient, getFullnodeUrl } from "https://esm.sh/@mysten/sui/client";
  import { Transaction } from "https://esm.sh/@mysten/sui/transactions";
  import { WalletStandard } from "https://esm.sh/@mysten/wallet-standard";
  window.SuiClient = SuiClient;
  window.SuiTransaction = Transaction;
  window.getFullnodeUrl = getFullnodeUrl;
</script>
```

Then in `tistu/js/sui.js` (new):

```javascript
// Wallet connect via Wallet Standard. Sui Wallet, Suiet, Slush all expose this.
export function getInstalledWallets() {
  return window.navigator.wallets?.get?.() ?? [];
}

// Submit a PTB built from compiler output.
export async function deployStrategy(walletAccount, suiClient, compilerOutput) {
  const tx = new window.SuiTransaction();
  // 1) get or create PredictManager
  tx.moveCall({
    target: `${PREDICT_PACKAGE}::predict_manager::new`,
    arguments: [],
  });
  // 2) mint binary/range position per compilerOutput.legs
  for (const leg of compilerOutput.legs) {
    tx.moveCall({
      target: `${PREDICT_PACKAGE}::predict::mint`,
      arguments: [
        tx.object(PREDICT_OBJECT),
        tx.object(leg.oracle_id),
        tx.pure.u64(leg.strike),
        tx.pure.u8(leg.direction),
        tx.pure.u64(leg.amount),
        // ... per source pointer signatures
      ],
      typeArguments: [DUSDC_TYPE],
    });
  }
  // wrap with HELIX strategy creation
  tx.moveCall({
    target: `${HELIX_PACKAGE}::strategy::create_from_compile`,
    arguments: [tx.pure(compilerOutput.dna_bytes), tx.pure(compilerOutput.attestation)],
  });
  return wallet.features['sui:signAndExecuteTransaction'].signAndExecuteTransaction({
    transaction: tx, account: walletAccount,
  });
}
```

In `app.js`:

1. **Delete the localStorage mock store** — those "Aurora Drift" fake strategies must die. Replace with a `MyStrategies` view that reads from the Predict server's `/managers/:id/positions/summary` for the connected wallet's `PredictManager`.

2. **Delete the offline compile fallback (line 304).** The Conviction Canvas posts to the real `/compile` endpoint on the running TEE service. If it fails, show an error — do not silently fall back to mocks.

3. **Wallet connect flow:** top-right button → opens wallet picker → on connect, store the account → enables the "Bring to life" button on the Conviction Canvas.

4. **The deploy flow:**
   - Conviction Canvas submits → `POST /compile` → returns `{ structure, dna_bytes, attestation, payoff_curve, greeks }`
   - Render the human-readable preview + payoff curve + Risk Guardian flags (≥2 classes: SVI staleness from Task 1 + PLP utilization / position concentration / oracle expiry proximity)
   - On "Bring to life" click → `deployStrategy()` → wallet signs → transaction lands → show explorer link

**Acceptance:** a real testnet transaction from a real wallet, visible on Sui Explorer, creating a real `PredictManager` and minting a real binary or range position. Take a screenshot of the explorer link — this is your demo's smoking gun.

---

## 5. What NOT to touch

These are the floor of your project. Don't refactor them under time pressure.

- `tistu/index.html` — the landing page; design source of truth
- `tistu/css/helix.css` — design tokens; everything else inherits from this
- `contracts/sources/dna.move`, `strategy.move`, `portfolio_risk.move`, `access_control.move`, `events.move` — these have full test coverage; do not edit
- The 56 Move tests, 20 TEE tests, 7 indexer tests — preserve all passing tests; if a test breaks during the flip, fix the test, do not delete it

If you find yourself "improving" a passing module to save the demo, stop. You are off-mission.

---

## 6. What stays mocked (and how to label it)

These are intentional mocks. Document them clearly so a judge sees discipline, not laziness.

| File | Why it stays mocked | How to label |
|---|---|---|
| `tee/src/shared/attestation.ts` | Real Nautilus Nitro enclave deploy is 1–2 weeks; out of hackathon scope | Add header comment: `// MOCK_TEE: HMAC-SHA256 with published mock key. Structurally-correct attestation pattern; swap for AWS Nitro attestation doc + KMS-signed quote when enclave key is issued. Production-blocking, not demo-blocking.` |
| `contracts/sources/bridges.move` verify functions | Same reasoning as above | Add doc comment above each verify fn: `/// Stub: checks signature non-emptiness + expiry. Replace with ed25519::verify against published enclave key once Nautilus integration lands. See attestation.ts.` |
| `tee/src/backtest/backtest.ts` PRNG paths | Sui options markets are weeks old; insufficient real history to backtest against | Banner in backtest result UI: "Simulated backtest (deterministic PRNG seeded by DNA hash). Real historical backtests pending sufficient Predict market history." |
| `tee/src/shared/mockWalrus.ts` | Walrus uploads are nice for lineage archives; not on the demo critical path | Optional Task 5 below upgrades to real Walrus in ~30 min |
| `services/indexer/src/store.ts` in-memory | Public Predict server covers most data needs; in-memory survives a demo | Mention in README that indexer is a thin layer over the public Predict server for HELIX-specific events; PostgreSQL is a deployment concern, not a hackathon concern |

The judging methodology explicitly distinguishes "unused imports and hollow UIs" (bad) from "honest scope-bounded mocks" (acceptable when labeled). Be in the second category.

---

## 7. Optional Task 5 — Real Walrus uploads (30 min, if time permits)

If Tasks 1–4 finish with >20 min remaining, swap `mockWalrus.ts` for the real publisher API. It's trivial.

```typescript
// tee/src/shared/walrus.ts
const PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

export async function uploadBlob(data: Uint8Array, epochs = 1): Promise<string> {
  const r = await fetch(`${PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    body: data,
  });
  if (!r.ok) throw new Error(`walrus upload failed ${r.status}`);
  const j = await r.json();
  return j.newlyCreated?.blobObject?.blobId ?? j.alreadyCertified?.blobId;
}

export async function fetchBlob(blobId: string): Promise<Uint8Array> {
  const r = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!r.ok) throw new Error(`walrus fetch failed ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
```

Use it to upload backtest equity curves + TEE attestation archives. Store the returned blob ID in the on-chain `StrategyObject` via the existing `walrus_adapter.move` field.

---

## 8. Demo script — the actual flow you record

This is what gets shown to judges. 5 minutes max. Practice it.

1. **(0:00–0:30) Hook.** Show the landing page `tistu/index.html`. One sentence: *"HELIX is an Intent Engine for structured options on DeepBook Predict. You express what you believe — we compile, guard, and execute."*

2. **(0:30–1:30) The conviction.** Connect wallet (zkLogin or Sui Wallet). Open the Conviction Canvas. Drag sliders: "Bullish BTC, moderate confidence, ~1hr horizon, choppy vol." Show the probability cone visualization responding live.

3. **(1:30–2:30) The compile.** Click "Compile conviction." Show the loading state. Real `/compile` call returns a structure: e.g. a vertical range minted via `predict::mint` on the live BTC oracle. Show the payoff curve, the Greeks, the structure breakdown.

4. **(2:30–3:30) The guardian.** Show the Risk Compass surfacing ≥2 risk classes in plain English: *"SVI surface is 14 seconds old — fresh. PLP utilization at 62% — fine. Your position resolves in 47 minutes; exit liquidity thins near resolution."* This is the sub-track's "guardian catching ≥2 risk classes" must-have, visibly satisfied.

5. **(3:30–4:00) The signature.** Click "Bring to life." Wallet popup. Sign. Show the testnet transaction landing. Open Sui Explorer in a new tab; show the `PredictManager` and the minted position objects, both verifiable on-chain.

6. **(4:00–5:00) The depth.** Show My Strategies view with the new position. Briefly show the Marketplace + Lineage views (even if they're partly mocked) and explain that breeding/copy are Phase 6 upside. Close with the package ID and the GitHub link on screen.

The demo's strongest beat is the moment Sui Explorer shows the real transaction. Make sure that screenshot is also in your submission deck as a static slide — if the live demo network hiccups, the screenshot still proves authenticity.

---

## 9. How to use me (Opus 4.8) efficiently in this window

You have ~2 hours and 35% weekly quota left. Burning tokens on confirmation, ceremony, or over-engineering is the failure mode.

**Do:**
- Hand me one concrete task at a time from the ordered list above
- Tell me "implement Task N per CLAUDE.md, run the acceptance test, stop"
- Use the Sui agent skills — they replace pages of explanation with one tool call
- Let me edit files in-place via the str_replace pattern; don't ask for whole-file rewrites unless necessary

**Don't:**
- Ask me to "improve" passing modules — they're done
- Ask for design discussions during the flip — the design is locked in `decisions.md`
- Ask me to write more documentation — this file is the documentation
- Ask me to migrate frameworks (e.g., vanilla JS → React) — out of scope today

**Token-saving phrasing pattern:**
> "Execute Task 1 from CLAUDE.md. Use the accessing-data skill if needed. Run the acceptance test at the end. Do not modify any file outside the Task 1 scope."

---

## 10. The single sentence to remember

> **The demo's authenticity is proven by a single Sui Explorer link showing a real `predict::mint` transaction signed by a real wallet against the real Predict package.** Everything in this file orbits that sentence. If a proposed change does not bring that link closer, defer it.
