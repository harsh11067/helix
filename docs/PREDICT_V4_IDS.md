# DeepBook Predict — current testnet deployment (verified on-chain)

> Generated 2026-11-09T09:44:52.425Z by `tee/scripts/r1-ground-truth.ts` — every value below is read from
> `@mysten/deepbook-v3@2.11.1` `getDeployment('testnet')` / `getConfig('testnet')` and cross-checked on-chain through
> Tatum GraphQL (`packageVersions`). Earlier deployments (`predict-testnet-4-16`, `0xf5ea…5138`) are superseded.

| Item | Value |
|---|---|
| Deployment name (SDK `getDeployment`) | `deepbook-predict-testnet` — asserted: yes |
| Source commit | `4d752fb82d909a821c85bcc5d3963725efb546f4` |
| Chain id | `4c78adac` |
| Call target (SDK `packages.predict`) | `0x481215e20e09c01350dd6f7803425566e4f854e44283af026c7304c41eb85f81` — latest on-chain version: no (latest is `0xbb6a1595d6ab45f41658fcb032e0dfb2cd87f2613825a26f5bcbe98d2c8c9ce8`) |
| Original package (types, events) | `0x59d71119e990573a738dd3ff9c4c7d28d6893af69c87c1a7f3a2e90e280ce2f4` |
| RECOVERY.md call target `0x0654…e267` | an earlier version of the same package (superseded by the SDK target) |
| Object `registry` | `0x85cfaa857f9dfca75f6ba624eead063c4a1bc9b701201b8f21e1f9c15833ccc4` |
| Object `protocolConfig` | `0x422a45c31128e69d0310ab3bed28bd14f730acf9f5681f70936d20c60d26bfb0` |
| Object `poolVault` | `0x6fd178a49848387d60ccfd3e53bf06969929970246a3a7983ae5bb2a5ed52ee3` |
| Object `oracleRegistry` | `0xf4ad65184b2e4e9d8e50d44b02a76c64e9607f63e3dbc362e110c99e20a17161` |
| Object `accountRegistry` | `0x511e11f7f5d5c1043d795180657603d59e06e90fbfcafd3f90c67ff0836bbd0c` |
| Object `orderDesk` | `0x160fc026c4143f3dec36acfc6556379d54661d37fe28ad837b6a85e42aeddfea` |
| Object `queueRegistry` | `0xe9d75ed05b089d52a660a94b94963cdc89aeb7f3c75b57f76771454c81faae1f` |
| Package `account` | `0x1e57d6554b99e4ca68330322c3e5c409ba1b681642726b603bf1be92c1840ca9` |
| Package `accountLatest` | `0x4401eae9984271faf178b6a43c0f2f144b6274b6406aab09bf9db0b3c2b441a1` |
| Package `propbook` | `0xa83f9d7651de09672a40cea371c387bf954e0f3092947670d71428d4fbc9edd9` |
| Package `predictOrders` | `0xcd6ff112fbe45f5d0fbf581628dde4cf2ef58ea169a496ad2aa18983cf1e289b` |
| Package `predictOrdersV1` | `0xd723ddef890bff70bd492cd384c913b5e7daeb6e8900cb3a5606546ac4f3907f` |
| Package `predictMath` | `0x2039bac8c1ec51ce3d7cb366ec36b45fdbbafe1aa2aaea0ed9bef52db40e1562` |
| Package `predictDelayedExecution` | `0x0654ecbed7c0f2645d9de7cb6cf08e65c2ee05cdbb39a415f17a6bd1cd92e267` |
| Package `predictCurrentVersion` | `5` |
| Package `predictOrdersCurrentVersion` | `2` |
| Quote coin | `0xc028557a1ed49e42ed091e115aedefd70a442b184c18fbec5c48d5b6c0b8c184::usdc::USDC` (6 decimals) |

## On-chain package versions (original `0x59d71119…`)

| Version | Address |
|---|---|
| 1 | `0x59d71119e990573a738dd3ff9c4c7d28d6893af69c87c1a7f3a2e90e280ce2f4` |
| 2 | `0x30a03c33eab1e79e0f891540dc00d4e213101b1efb6890f2232e77e36ddd25ce` |
| 3 | `0xb5155d4cd83f27ac2fad2c2ef339988b115ffef7830283c9acd68359afeba5b8` |
| 4 | `0x6c2c2d3c2394cf282f4b8462a99c2e814bda0c223796de10b47b36d35fd878f5` |
| 5 | `0x0654ecbed7c0f2645d9de7cb6cf08e65c2ee05cdbb39a415f17a6bd1cd92e267` |
| 6 | `0x340a77ce690e683138790592be6c6d02dc56a7e88e2555dc17f8a4967d003816` |
| 7 | `0x0e6ce5fcfd8f647f2a1ba134d9f3bc919bc3ea767871d24f6c2799e3d7d47fc9` |
| 8 | `0x7fc9677ddefd072c414c6dee981ca04017244087cd45b8386ce7844fb66838ce` |
| 9 | `0x481215e20e09c01350dd6f7803425566e4f854e44283af026c7304c41eb85f81` |
| 10 | `0xbb6a1595d6ab45f41658fcb032e0dfb2cd87f2613825a26f5bcbe98d2c8c9ce8` |

## Liveness at generation time

- Open BTC windows: 4 (next expiry 2026-11-09T09:45:00.000Z); rolling sub-hour: **true**; settling now: **false**.
- Compiler SVI age: **1 s** (pricer read on-chain via Tatum).
- Old 4-16 deployment still emitting events in the last 24 h: **false**.
- Quote-coin package public functions: `usdc`: —.
- DeepBook spot pools quoting the coin (from `PoolCreated` events scanned: 50): 0.
- Order flow used by HELIX: delayed execution: predict.tx.planMint/enqueuePlan (queue::enqueue_mint …) — keeper fills at Pyth price; immediate mint is NOT used (tee/src/predict/predict.ts buildMintTx).
