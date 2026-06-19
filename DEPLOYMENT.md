# 🚀 HELIX — Deployment & On-Chain Proof

> Single source of truth for every deployed artifact: package IDs, upgrade lineage,
> transaction digests, live URLs, third-party service IDs, licenses, and the
> verification commands that prove each claim. All addresses are **Sui testnet**
> (chain-id `4c78adac`).

---

## 📝 Description

**HELIX is an Intent Engine for structured options positions on DeepBook Predict.**
A user expresses a plain-English conviction about an asset (e.g. *"bullish BTC,
moderate confidence, ~1h horizon, choppy vol"*); an off-chain AI compiler turns it
into a concrete Predict structure and a Programmable Transaction Block (PTB); a Risk
Guardian surfaces ≥2 risk classes in plain language; the user confirms; and
`predict::mint` executes on Sui testnet, producing a real `PredictManager` position
and a HELIX `StrategyObject` that lives on-chain.

On top of that core loop, HELIX ships two production Sui-stack features:

- **zkLogin (Sign in with Google)** — self-custodial onboarding with no seed phrase,
  powered by **Enoki** (hosted prover + per-user salt). The user authenticates with
  Google and trades on-chain immediately.
- **Seal-encrypted private thesis** — a strategy's *structure and performance are
  public*, but the owner's *reasoning* is encrypted client-side with **Seal**, stored
  on **Walrus**, and gated by an on-chain access policy (`helix::seal_policy`). Only
  the owner — and any address that **pays to copy** the strategy (holds a
  `CopyRelationship`) — can decrypt it.

**Stack:** Move (Sui), DeepBook Predict, Seal, Walrus, zkLogin/Enoki, Wallet
Standard, vanilla-JS frontend, TypeScript TEE compiler service.

**Submission:** Sui Overflow 2026 · Agentic Web → Intent Engine (sub-track 3),
secondary DeepBook Predict.

---

## 🔗 Quick links

| Resource | URL |
| :--- | :--- |
| **Source (GitHub)** | https://github.com/harsh11067/helix |
| **App (frontend)** | https://helix-app-fovn.onrender.com · [/app.html](https://helix-app-fovn.onrender.com/app.html) |
| **Compiler (TEE) health** | https://helix-compiler.onrender.com/health |
| **Latest package on explorer** | https://suiscan.xyz/testnet/object/0xbcd36b706472927ab7865a2ba31e343bfdc3c24312f39a9cb79cde88faaa45e0 |
| **Original package on explorer** | https://suiscan.xyz/testnet/object/0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3 |
| **DeepBook Predict (source)** | https://github.com/MystenLabs/deepbookv3/tree/predict-testnet-4-16/packages/predict |

---

## 📦 PACKAGE ID (use this)

```
LATEST (published-at, v4) : 0xbcd36b706472927ab7865a2ba31e343bfdc3c24312f39a9cb79cde88faaa45e0
ORIGINAL (original-id, v1): 0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3
```

> **Rule:** use `published-at` (v4) as the target for every `moveCall`; use
> `original-id` (v1) for type / object / event **identity** (e.g. querying
> `StrategyObject`, `CopyRelationship`, `StrategyCreated`). A type added in a later
> upgrade keeps the **version that defined it** as its identity — see the Seal note.

---

## 🧬 HELIX Move package — upgrade lineage

Published once, upgraded three times (every upgrade is **compatible** — additive
only — so the original ID and all prior proofs remain valid).

| Ver | `published-at` (package ID) | Change | Upgrade / publish tx digest |
| :-- | :-- | :-- | :-- |
| v1 | `0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3` | Initial publish (16 modules, real Predict linkage) | `Ch1pgaKi8Cy3tTwmzCUGsn2mGeLdvKond7Xx522Ws9oG` |
| v2 | `0x96b36ef86f445b525eccaa5410a2c6cebe6c6dff85c86fbfee9914581b0ad391` | Add `helix::seal_policy` (Seal access policy + `attach_thesis`) | `9H4PxNX2SNYH1LpV86uXw1ygSyDk5FbLoTcNG7sGWxcY` |
| v3 | `0x360d7b40481dee15e97209e8bbd2e82884a94582059ea230c00eb5ea745f581d` | Add `marketplace::copy_for_thesis` (cross-wallet pay-to-unlock) | `BMmj4MRZRWQwewcrbxbtSZxDk3xmxQMxCPLTU55meZ7b` |
| **v4** | **`0xbcd36b706472927ab7865a2ba31e343bfdc3c24312f39a9cb79cde88faaa45e0`** | Fix `seal_approve_copier` (drop owner's owned object so a copier can decrypt) | `BfLv838F5Ru64DnHcY4rvYWQrPt5FXMyeoEVtBMbYDBC` |

**Supporting objects**

| Object | ID | Note |
| :-- | :-- | :-- |
| `UpgradeCap` | `0x1b7f5f6776905e738032601dd1cc016ff083b4fcbec03e879686a26415e1d7eb` | controls future upgrades |
| `AdminCap` | `0xf523ce5c7d14d1dc222e75fa3ddaa13c46db53847206ff45b0b718b8a2542238` | init-minted to deployer |
| Deployer address | `0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884` | publisher / upgrader |

**16 modules:** `access_control, breeding, compiler_bridge, compose_adapter,
conviction_tree, dna, events, hedger_bridge, leg_factory, marketplace,
portfolio_risk, predict_adapter, seal_policy, signed, strategy, walrus_adapter`.

---

## 🔐 Seal (encrypted private thesis)

| Item | Value |
| :-- | :-- |
| Encryption identity namespace (`packageId` for `encrypt` + `SessionKey`) | `original-id` v1 `0xdc4b…add2b3` |
| `seal_approve*` / `attach_thesis` `moveCall` target | `published-at` v4 `0xbcd3…45e0` |
| `ThesisAttached` event type (defining version) | **v2** `0x96b3…ad391` |
| Threshold | `1` (1-of-2 Mysten testnet key servers) |
| Key server #1 | `0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75` |
| Key server #2 | `0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8` |

> **Why three different IDs:** Seal normalizes any later package version back to the
> original for the identity check, so `encrypt` must use v1. The `seal_policy` module
> (and its `ThesisAttached` event) was first defined in **v2**, so its type identity
> is v2 even though v4 also contains it (verified on-chain: existing events are
> recorded under `0x96b3`). Function calls always route to the latest, v4.

---

## 🪙 Walrus (decentralized storage)

| Item | Value |
| :-- | :-- |
| Publisher | `https://publisher.walrus-testnet.walrus.space` |
| Aggregator | `https://aggregator.walrus-testnet.walrus.space` |
| Proven blob (backtest equity curve) | `QE8njhhplCR8s6UHqjS8SBsQ6SO7AxyNZqI6CoBvmX4` |

Encrypted thesis ciphertexts are stored as Walrus blobs; the blob ID is recorded
on-chain via `seal_policy::attach_thesis` (`ThesisAttached` event).

---

## 🔑 zkLogin (Sign in with Google, via Enoki)

| Item | Value |
| :-- | :-- |
| Prover + salt service | Enoki — `https://api.enoki.mystenlabs.com/v1` |
| Google OAuth Web client ID | `336366260371-t44qbp4r54kls5fk98nhi439tq9681ou.apps.googleusercontent.com` |
| Enoki **public** API key | `enoki_public_e357a56724a84818d4470a37d189372c` (domain-restricted; safe in frontend) |
| Network | `testnet` |

> The public Mysten prover allow-lists OAuth audiences, so a custom Google client ID
> must be proved through Enoki. **One-time setup** (already done): in the Enoki portal
> add Google as an auth provider with the same client ID and allow-list the app
> origins (`https://helix-app-fovn.onrender.com` + localhost). The same redirect URIs
> (`…/app.html`) must be registered on the Google OAuth client.

---

## 🌊 DeepBook Predict (testnet, pinned `predict-testnet-4-16`)

| Item | Value |
| :-- | :-- |
| Predict package | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` |
| Predict shared object | `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a` |
| Predict registry | `0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64` |
| Quote asset (DUSDC) type | `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC` |
| Public server | `https://predict-server.testnet.mystenlabs.com` |

**Proven `predict::mint` (the demo's smoking gun)**

| Item | Value |
| :-- | :-- |
| Mint tx digest | `5KNFJevSdLkazHg1yz2eFBkHpDmhEt6nm4KjixkrjcBj` |
| `PredictManager` | `0xb8ab3792030fdb2aa695eb1644c30423de98e9d30973c44337d7cf5c09efcd05` |
| HELIX `StrategyObject` minted | `0xa61e97e937d2d8f65262ad4aff1d5470f0e2075961a99f135ca9fbc42c26e6d5` |
| Live BTC oracle (`OracleSVI`) | `0x42538cd0c36e485cfea4ddf3d410ceebb0f7614b7cf82145b8b234c3c02c54f3` |

---

## 🌐 Live deployment (Render)

| Service | URL | Config |
| :-- | :-- | :-- |
| Frontend (static, `tistu/`) | https://helix-app-fovn.onrender.com | autoDeploy on push to `main` |
| Compiler (TEE, `tee/`) | https://helix-compiler.onrender.com | `OFFLINE=0` (live SVI), Node 24, `node src/compiler/server.ts` |

Render redeploys both services automatically on every push to `main`
(`render.yaml` blueprint). Free-tier web services sleep after ~15 min idle; the
first compile after idle cold-starts (~50 s) — the frontend compile timeout
tolerates this. Warm the compiler before a demo.

---

## ✅ Test status

| Suite | Count | Command |
| :-- | :-- | :-- |
| Move (contracts) | **64 pass** | `cd contracts && sui move test` |
| TEE (compiler/hedger/regime/backtest) | **20 pass** | `cd tee && OFFLINE=1 node --test "test/*.test.ts"` |
| Indexer | **7 pass** | `cd services/indexer && node --test "test/*.test.ts"` |

---

## 📜 Licenses

| Component | License |
| :-- | :-- |
| **HELIX** (this repository — Move contracts, TEE, indexer, frontend) | **MIT** — see [LICENSE](./LICENSE) |
| Sui framework / Move stdlib | Apache-2.0 (Mysten Labs) |
| DeepBook Predict (`deepbookv3`) | Apache-2.0 (Mysten Labs) |
| `@mysten/sui`, `@mysten/seal`, `@mysten/enoki`, `@mysten/wallet-standard` | Apache-2.0 (Mysten Labs) |

---

## 🔎 How to verify (copy-paste)

```bash
# Latest package modules (proves v4 is live with the fixed copier signature)
sui client object 0xbcd36b706472927ab7865a2ba31e343bfdc3c24312f39a9cb79cde88faaa45e0

# The proven predict::mint transaction
sui client tx-block 5KNFJevSdLkazHg1yz2eFBkHpDmhEt6nm4KjixkrjcBj

# Explorer (browser)
# https://suiscan.xyz/testnet/object/0xbcd36b706472927ab7865a2ba31e343bfdc3c24312f39a9cb79cde88faaa45e0
# https://suiscan.xyz/testnet/tx/5KNFJevSdLkazHg1yz2eFBkHpDmhEt6nm4KjixkrjcBj
```

> Note: the local `sui` CLI 1.73.0 panics on testnet protocol 126; the upgrades in
> this repo were executed with the `@mysten/sui` TypeScript SDK. The commands above
> work from any explorer or an up-to-date CLI.
