# TOTAL_RECALL_EVIDENCE

Generated 2026-11-09T15:49:24.611Z by `tee/scripts/evidence.mjs` from live endpoints — nothing in this file is hand-typed.
Service: https://helix-compiler.onrender.com

## 1. Tatum chokepoint + Walrus Memory health (`GET /health`)

```json
{
  "tatum_testnet_checkpoint": 404601963,
  "tatum_mainnet_checkpoint": 343407819,
  "tatum": {
    "plan": "free;ratelimit=3;strategy=shared",
    "testnet": "sui-testnet.gateway.tatum.io",
    "mainnet": "sui-mainnet.gateway.tatum.io",
    "requests": 22,
    "retries": 2,
    "recent_executions": []
  },
  "memwal": "ok",
  "memwal_detail": {
    "status": "ok",
    "mode": "mainnet",
    "agentMatches": true
  },
  "memory_network": "walrus-mainnet",
  "watcher": {
    "pending": 1
  },
  "predict": {
    "network": "testnet",
    "open_windows": [
      10.9
    ],
    "quote_coin": "0xc028557a1ed49e42ed091e115aedefd70a442b184c18fbec5c48d5b6c0b8c184::usdc::USDC"
  }
}
```

## 2. Memories on Walrus Mainnet — 18 trading memories

By type: **CONVICTION** 7 · **OUTCOME** 5 · **CALIBRATION** 5 · **PAYMENT** 1

Every row was written with `rememberAndWait` to the Walrus Memory mainnet relayer; `tx` is the Sui testnet transaction it describes (verify all with `node scripts/verify-ledger.mjs`). Registry bookkeeping memories (`USER`) are excluded from the count.

| # | type | blob id | job id | written | tx | origin |
|---|---|---|---|---|---|---|
| 1 | CONVICTION | `xC3Bh9aP4WUXJAsUqyNm7rW3B3PPD0ggvHKDEqzmHHI` | `bc076fa3-7ed6-4362-9a11-d8310943ef88` | 2026-11-09T09:52:02Z | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | cli |
| 2 | OUTCOME | `obLQWE8KJuoYV2qbbZ_J73s5T33Tl-dpzFrtmF0440s` | `42752172-33bf-4eff-bbf2-6eb132e6f775` | 2026-11-09T10:00:53Z | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | watcher |
| 3 | CALIBRATION | `20o5NXeG4p2QYzB5LFxV6Uup9O-Erd9HNsI99SHYUYY` | `3c66808b-25ae-4998-9ac2-e205c060f19d` | 2026-11-09T10:01:09Z | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | watcher |
| 4 | CONVICTION | `Dkuo8cMPG90ZpKDh20uoIGcHINBxDjN7uCk1KYeFPkk` | — | 2026-11-09T10:03:37Z | [`9fGJzrg3qY…`](https://suiscan.xyz/testnet/tx/9fGJzrg3qYygqhyyd1XVpy5VSGQpDcoBRFyRs8Rwxg38) | — |
| 5 | CONVICTION | `sdW7djXk2m1DMEtdSq7EoNKxL1eefDdYfuPMlgAd7mo` | — | 2026-11-09T10:04:24Z | [`E2E1baCGXb…`](https://suiscan.xyz/testnet/tx/E2E1baCGXbkrxcFLVbLvKRS5sE6Yj9koZToVh1Rifheu) | — |
| 6 | OUTCOME | `dKaDaGURA1PSFiuSMt9MD_YtsxN7Teb2JOydbFI3tMo` | — | 2026-11-09T10:05:44Z | [`9fGJzrg3qY…`](https://suiscan.xyz/testnet/tx/9fGJzrg3qYygqhyyd1XVpy5VSGQpDcoBRFyRs8Rwxg38) | — |
| 7 | CALIBRATION | `e81iMU_ubr-M9KD0Cx51a3eF5kIFv8NIeZddLDlZWc4` | — | 2026-11-09T10:06:04Z | [`9fGJzrg3qY…`](https://suiscan.xyz/testnet/tx/9fGJzrg3qYygqhyyd1XVpy5VSGQpDcoBRFyRs8Rwxg38) | — |
| 8 | OUTCOME | `RyWhIOchrgGp_92jprjOlBXTfkQHuiQiaV-c6MRFqLQ` | — | 2026-11-09T10:06:38Z | [`E2E1baCGXb…`](https://suiscan.xyz/testnet/tx/E2E1baCGXbkrxcFLVbLvKRS5sE6Yj9koZToVh1Rifheu) | — |
| 9 | CALIBRATION | `wMF_zRhQBl74KPN90MBZCwlB7mjf1fVjfF11teM_8wE` | — | 2026-11-09T10:06:56Z | [`9fGJzrg3qY…`](https://suiscan.xyz/testnet/tx/9fGJzrg3qYygqhyyd1XVpy5VSGQpDcoBRFyRs8Rwxg38) | — |
| 10 | CONVICTION | `eSB1aLVsjDLkTWPa2f1g1ZMg8sw7Yv2EqRcg8IfjrJI` | — | 2026-11-09T10:08:43Z | [`Gb9WAaYgca…`](https://suiscan.xyz/testnet/tx/Gb9WAaYgcaZgUChF5hvweMTUtCe7VZPfzAyoEDLNqG5t) | — |
| 11 | CONVICTION | `cX9ZWvQya8FKahD0JLIEiCsRE0lPwPNZs1Kaxe2toVs` | — | 2026-11-09T10:12:55Z | [`EUfceKDuRs…`](https://suiscan.xyz/testnet/tx/EUfceKDuRskBz6ZD4xEB4yNCXcxzNyoNzEcKkxWNgSDq) | — |
| 12 | OUTCOME | `BgRFIgxElWP9L874_EhQfhP2LFIJpfOo_JhzAOe2jpM` | — | 2026-11-09T10:15:48Z | [`Gb9WAaYgca…`](https://suiscan.xyz/testnet/tx/Gb9WAaYgcaZgUChF5hvweMTUtCe7VZPfzAyoEDLNqG5t) | — |
| 13 | CALIBRATION | `oAiKMwUrcMnBMspkdUCzLtYv83WTKWeGjhBgW9DAmm0` | — | 2026-11-09T10:16:06Z | [`Gb9WAaYgca…`](https://suiscan.xyz/testnet/tx/Gb9WAaYgcaZgUChF5hvweMTUtCe7VZPfzAyoEDLNqG5t) | — |
| 14 | OUTCOME | `rzg6fZnP1dViR1W5TbsBX_f-Qn1pAFlNq6h7GQ6q3s8` | — | 2026-11-09T10:16:34Z | [`EUfceKDuRs…`](https://suiscan.xyz/testnet/tx/EUfceKDuRskBz6ZD4xEB4yNCXcxzNyoNzEcKkxWNgSDq) | — |
| 15 | CALIBRATION | `FsPu2o_5zClXBwtKgLE9suyJoCCEaFFm6mSB7ZqXWFU` | — | 2026-11-09T10:16:53Z | [`EUfceKDuRs…`](https://suiscan.xyz/testnet/tx/EUfceKDuRskBz6ZD4xEB4yNCXcxzNyoNzEcKkxWNgSDq) | — |
| 16 | CONVICTION | `hTCWPRTrtD3jlPkxvl7uNaPksobcmTwB6unedvCjxv8` | — | 2026-11-09T10:20:28Z | [`AQkVzq1wEH…`](https://suiscan.xyz/testnet/tx/AQkVzq1wEHcx7xxdmstsV1RgDL4ZVXNv6qZP3rKBWigS) | — |
| 17 | CONVICTION | `JBoBZ81lIQkkyge5Ky0QAVAyZj1FBJrru5Ds0L95GPU` | `75cd5efd-bb36-4ea0-b33c-5a714c4baf99` | 2026-11-09T11:56:36Z | [`6TA4yADGgZ…`](https://suiscan.xyz/testnet/tx/6TA4yADGgZimoEqZXyZkd7irBpnNGVMBk623XrcCbFTX) | browser |
| 18 | PAYMENT | `Uz1ZxIZ7wTfEcVOJAuDGiuQFkOUo2XC3kDWrgT625Xw` | `b6c0204a-bf02-4de8-afeb-85dec522ef5e` | 2026-11-09T15:35:54Z | [`5mhhMLQ6C5…`](https://suiscan.xyz/testnet/tx/5mhhMLQ6C5rnM3vpqdfpemt99DuVpGW9NKCJRjah6Fn2) | payments |

## 2b. Commit mode — on-chain commit–reveal (27 CONVICTION · 26 OUTCOME; target ≥30 / ≥20)

On-chain ledger (`ConvictionCommitted` events by this address via Tatum, matched to memory by hash): `{"journal":"0x5bcf3bf66f6c71f53aaf681842b554edde5b6c141c7315ba0ac6b4cd6766652f","onchain":28,"with_memory":27,"recording":1,"missing_memory":0,"settled":26,"wins":10,"reveal_ok":26,"win_rate_all_commits":0.38461538461538464,"missing":[]}`

| # | committed (UTC) | conviction | commit tx | sha256 | CONVICTION blob | outcome | OUTCOME blob | origin |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-11-09 09:51 | down/0.85/calm · range | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | `499a97f28482…` | `xC3Bh9aP4WUXJAsUqyNm7rW3B3PPD0ggvHKDEqzmHHI` | WIN · +4.23 · reveal_ok=true | `obLQWE8KJuoYV2qbbZ_J73s5T33Tl-dpzFrtmF0440s` | cli |
| 2 | 2026-11-09 10:03 | down/0.35/calm · range | [`9fGJzrg3qY…`](https://suiscan.xyz/testnet/tx/9fGJzrg3qYygqhyyd1XVpy5VSGQpDcoBRFyRs8Rwxg38) | `3e5187e9af39…` | `Dkuo8cMPG90ZpKDh20uoIGcHINBxDjN7uCk1KYeFPkk` | LOSS · -3.00 · reveal_ok=true | `dKaDaGURA1PSFiuSMt9MD_YtsxN7Teb2JOydbFI3tMo` | cli |
| 3 | 2026-11-09 10:04 | down/0.35/calm · range | [`E2E1baCGXb…`](https://suiscan.xyz/testnet/tx/E2E1baCGXbkrxcFLVbLvKRS5sE6Yj9koZToVh1Rifheu) | `6094428fdea1…` | `sdW7djXk2m1DMEtdSq7EoNKxL1eefDdYfuPMlgAd7mo` | LOSS · -3.00 · reveal_ok=true | `RyWhIOchrgGp_92jprjOlBXTfkQHuiQiaV-c6MRFqLQ` | cli |
| 4 | 2026-11-09 10:08 | up/0.75/choppy · bracketed_range | [`Gb9WAaYgca…`](https://suiscan.xyz/testnet/tx/Gb9WAaYgcaZgUChF5hvweMTUtCe7VZPfzAyoEDLNqG5t) | `c0f20688f546…` | `eSB1aLVsjDLkTWPa2f1g1ZMg8sw7Yv2EqRcg8IfjrJI` | WIN · +3.91 · reveal_ok=true | `BgRFIgxElWP9L874_EhQfhP2LFIJpfOo_JhzAOe2jpM` | browser |
| 5 | 2026-11-09 10:12 | down/0.40/choppy · directional | [`EUfceKDuRs…`](https://suiscan.xyz/testnet/tx/EUfceKDuRskBz6ZD4xEB4yNCXcxzNyoNzEcKkxWNgSDq) | `f8c6c2e0c29c…` | `cX9ZWvQya8FKahD0JLIEiCsRE0lPwPNZs1Kaxe2toVs` | WIN · +3.82 · reveal_ok=true | `rzg6fZnP1dViR1W5TbsBX_f-Qn1pAFlNq6h7GQ6q3s8` | browser |
| 6 | 2026-11-09 10:20 | up/0.85/calm · range | [`AQkVzq1wEH…`](https://suiscan.xyz/testnet/tx/AQkVzq1wEHcx7xxdmstsV1RgDL4ZVXNv6qZP3rKBWigS) | `3e7e04c4ca46…` | `hTCWPRTrtD3jlPkxvl7uNaPksobcmTwB6unedvCjxv8` | LOSS · -5.00 · reveal_ok=true | `8h56LFQjzVEsH1S5MSpzjFDdAViQbtW3nYXBfo5CEfE` | cli |
| 7 | 2026-11-09 10:27 | up/0.80/choppy · bracketed_range | [`E4jd5qoFqC…`](https://suiscan.xyz/testnet/tx/E4jd5qoFqCkYrunGZvd7AcAnYHDeu9MpnVcu99SKMoMV) | `ded51177c031…` | `TRXDsQLlGRiPM8IkSaU0A2xgEDulA27kxxAiXqsXivs` | WIN · +5.06 · reveal_ok=true | `XqFsGftePOKeXBCuJjBxpkoHDeSM-SBXK1wTHnLER3A` | browser |
| 8 | 2026-11-09 10:30 | up/0.85/choppy · bracketed_range | [`3gGpKT3vFu…`](https://suiscan.xyz/testnet/tx/3gGpKT3vFuqJhngwF1tLCUwfF9TTSQxxVgN1boy4VwU1) | `7104d11a83f8…` | `5lWZbhCNT2GjlkBNKv-RIPpfRumfuuz7zD-TbyKdm08` | LOSS · -3.00 · reveal_ok=true | `2IoZgjKAr6j-QrmupWAKBCV6fvaZFwLGdCcLP1hbAIg` | cli |
| 9 | 2026-11-09 10:46 | up/0.35/calm · bracketed_range | [`4R5j8iGZni…`](https://suiscan.xyz/testnet/tx/4R5j8iGZnixZarbSD8oP81D2qWRVg4MVzSMNwMSPfU5C) | `64c066b5fe32…` | `4bHb2lD6SEh3C7RMX_djaGsV_HfCuIjtalFWp_w_ih4` | WIN · +4.93 · reveal_ok=true | `4VyEkttzxjYVTtenDP7Icem376-Kzw_oWHWET3J3Imo` | cli |
| 10 | 2026-11-09 11:03 | up/0.85/choppy · bracketed_range | [`3fCLrs7n79…`](https://suiscan.xyz/testnet/tx/3fCLrs7n79zzTUsNp4ywfiSaxi9jmf5grrAyRJC8amxi) | `f9e51d86b873…` | `Nzevybu_Pdgb8pIssnD8w83-zlkkUP9xDPKUW-M6cJc` | LOSS · -8.00 · reveal_ok=true | `Ik3bC3_3veK29HLpKk68Ek-r5xrOZefdTmHvS_6qLdY` | cli |
| 11 | 2026-11-09 11:19 | down/0.80/choppy · bracketed_range | [`GUoHxxK8f2…`](https://suiscan.xyz/testnet/tx/GUoHxxK8f2UmHPGT7pPhwQNQqi46NFwsi21BVbB38ffv) | `d0b9a9a0b534…` | `CkwfcYAZEhk1j58k9zTRdRCJiHYK5xemXUfGR34jgSo` | LOSS · -3.00 · reveal_ok=true | `oTlPEwwKzFTT8nKo8VcCZSwLqPfjVd5GFEvwyNY1r2I` | cli |
| 12 | 2026-11-09 11:35 | up/0.85/choppy · bracketed_range | [`FAQEfuPVXX…`](https://suiscan.xyz/testnet/tx/FAQEfuPVXXpQSAgd9Q1cBZSmje7KjbBaxKgDRowxVECs) | `016f5dc9e82f…` | `dd4L8cxWtodZkJvE-YAvkE-vwIFEIuYfK6ki4yQZ6QY` | LOSS · -5.00 · reveal_ok=true | `0UceevcbLcxNL64NY2ikEvqYH3QhllZ1NlMunZYzybY` | cli |
| 13 | 2026-11-09 11:52 | up/0.80/choppy · bracketed_range | [`99VmVpULUa…`](https://suiscan.xyz/testnet/tx/99VmVpULUaCS5JMo93sjFMJjAz7AxYvZUR89VVC6CrL9) | `9844fe8bbb5e…` | `QdCB8dtqS83Q_dJNxitLAQQza7Klb7wcYbaMs5USUxM` | LOSS · -8.00 · reveal_ok=true | `hGpsvI5UdHD_lAuQ1ahRsBx0d3EYPf1M4BwjbuvVqSI` | cli |
| 14 | 2026-11-09 11:58 | up/0.85/choppy · directional | [`3d8GH6D5N4…`](https://suiscan.xyz/testnet/tx/3d8GH6D5N4Gq6BEuACPBJbHYasmrUchsBVkfiXwrub2y) | `1c8717e092c2…` | `tuI545aec2AFiiJjs7RdZM7RATgz2jWIdf60t8fA4Pc` | LOSS · -3.00 · reveal_ok=true | `8KHfTdQUClH-xaCY8sOtOE0-4YoJO0YG9JMCJCqHEOc` | cli |
| 15 | 2026-11-09 12:13 | down/0.35/calm · bracketed_range | [`GyT1ZXmQnS…`](https://suiscan.xyz/testnet/tx/GyT1ZXmQnSz6fFW1C2uHWfryS2E6QCfxYwc2ZnkDCDtA) | `5bba8b09d1e1…` | `69n_Ycngm0AduWtkEtoF5uJoiJgFz1l-DNox05owI18` | WIN · +4.82 · reveal_ok=true | `xaCEVaCXe9TaV76W9urvIttfi_og67Wq8zofWVgH7Og` | cli |
| 16 | 2026-11-09 12:31 | up/0.85/choppy · bracketed_range | [`EYsfua9zMu…`](https://suiscan.xyz/testnet/tx/EYsfua9zMuLFhLMi9jG7swJhfMtdSUE838twBP4iefao) | `2ed3d9934859…` | `qZfHzG3dPVbpCfLs1jaJppLipzE0uNOj0SzYlxSQ2O0` | LOSS · -8.00 · reveal_ok=true | `BCs9mA3eqI6YkBJJyZckWEnYJfIvzEVgCB_3X8swv2o` | cli |
| 17 | 2026-11-09 12:47 | up/0.85/calm · range | [`31sX8JW1dv…`](https://suiscan.xyz/testnet/tx/31sX8JW1dvHZztdKqtGu8naC8zHXrGnHcqGqs9x9bnwi) | `da71a326252b…` | `jC1Z3RIg78p6GcdUmeL0VNPyDFZQpFA0HJswtyNhJIA` | LOSS · -3.00 · reveal_ok=true | `Nj3wEbhSmaKp9fARV6ODdbWEvDrTPes0ryn6ZJ52vBc` | cli |
| 18 | 2026-11-09 13:03 | up/0.85/choppy · directional | [`GmcExB1fVZ…`](https://suiscan.xyz/testnet/tx/GmcExB1fVZJj5LrGShwgqvXWU1Y54C5wKx53aLyxHbdd) | `fb1b01040b12…` | `XBLtiRLV9Jc1SSv6Vnsbv5bClv--UJktKY5IG1RqE6Y` | LOSS · -5.00 · reveal_ok=true | `gbFNUpcyMC9_viyQ-WUFDr3rkTW2ajuztt4K8PRn3XU` | cli |
| 19 | 2026-11-09 13:19 | down/0.30/choppy · bracketed_range | [`HPYMu51EZE…`](https://suiscan.xyz/testnet/tx/HPYMu51EZEAYstvLnbvrodVddufgQSseadD37uJHdTnz) | `e50f3c4330d3…` | `2Yhd5VNyyhUJ852Ef7F9m31LkWs5QRdcR8ey77YIdrk` | LOSS · -8.00 · reveal_ok=true | `qWIOoJcuCxGq2q1MM8PA7IYVEIXJzkCOLrC7OtSQbl8` | cli |
| 20 | 2026-11-09 13:35 | up/0.85/choppy · bracketed_range | [`4oPEF9R6bS…`](https://suiscan.xyz/testnet/tx/4oPEF9R6bSL4E6RD1qV6aCHC6ix1hCLzKnm6w51xXigW) | `0a89ba4c57cc…` | `igu41jBV2NxZenjvdW3VTS5SCoGLbTBrUxdil8JobjU` | WIN · +2.94 · reveal_ok=true | `eE6Mk43z2A2kqZLz8p5cbWk-PokG_0vD51zfIUVQ_qU` | cli |
| 21 | 2026-11-09 13:51 | up/0.30/choppy · bracketed_range | [`3fxG8pdEiE…`](https://suiscan.xyz/testnet/tx/3fxG8pdEiETKAk8bzXDhsPSas2p4zPTsjwNqRdcnVQYz) | `babb38107d72…` | `okKJ_of0I7yUj9yYG-cqL1s6x4wWLgeFZ8GsIsm_4II` | LOSS · -5.00 · reveal_ok=true | `PbwjOzjk9qUStMTNc-SdV_dXzE0cyeSU_MzeoymYnz4` | cli |
| 22 | 2026-11-09 14:07 | up/0.85/choppy · bracketed_range | [`G1JSUUJPwG…`](https://suiscan.xyz/testnet/tx/G1JSUUJPwG4iAUoFmDkg8fLfqR6g6gBRi5NDL2UzyB2Z) | `32459c12da23…` | `b9idG4Vc0xKwMIgloHWlXvc0VSiJNFfrvMjtB6rfWCU` | WIN · +7.82 · reveal_ok=true | `nMqXkMLzZXtHYWRJ_BZ6lyuwGVOhguqDtwvr_cFnwe0` | cli |
| 23 | 2026-11-09 14:23 | down/0.85/calm · range | [`CqRKVyk6La…`](https://suiscan.xyz/testnet/tx/CqRKVyk6Laut5T6ZwvHFe61jKmUSbzosMXExDEb5PXac) | `8575febec7e0…` | `SIoUAGXJIZYicrIzueQ7QgaMdDYDd_Kt-fq6iywuP8A` | WIN · +2.50 · reveal_ok=true | `01-_KsVq39Aoyoi0B_l03UR7gEQt2sFRea1ohOcZf1k` | cli |
| 24 | 2026-11-09 14:57 | up/0.35/calm · bracketed_range | [`3b7AnQxA7W…`](https://suiscan.xyz/testnet/tx/3b7AnQxA7WY6oK8vedYjE6LevxX8brDbqBbh6RuEJtwZ) | `d17e3aa0e98f…` | `cx7VAXQcFoR9NjD_L1Myj_NGu4NrpveP9Ah8xPocuUo` | WIN · +7.85 · reveal_ok=true | `1vZEewZvO7Nri5gY1Wl_LRHS-IrFQxJETqAdE50R__E` | cli |
| 25 | 2026-11-09 15:13 | up/0.85/choppy · bracketed_range | [`HYNnGSXvBq…`](https://suiscan.xyz/testnet/tx/HYNnGSXvBqGyHCeN84ThPPmMD9jmk5YyEw57R937F5oB) | `3119a79e5f6f…` | `BBbTE4NsNh9GYMltCvvlC3TUF_eAJOf4h-8_skvLSi4` | LOSS · -3.00 · reveal_ok=true | `9VTpneZ7-Kqq_6uorAu5rPjCyl4Vzf8SWbjY8O_YYRg` | cli |
| 26 | 2026-11-09 15:26 | down/0.80/choppy · bracketed_range | [`7kAU4AEPww…`](https://suiscan.xyz/testnet/tx/7kAU4AEPwwEuEuS6ipLWTnxPX19X9A6eZ4ZVZJoJPeLu) | `bc572cf5ef64…` | `UwmyrKrQE7ncmrxzVvMfLeF_2IQcIe6Mad9rHWUgefU` | LOSS · -5.00 · reveal_ok=true | `BUCxSBQ0gMw14bsvAEhS1tq_abNng5JxBH4WAkp4TyQ` | cli |
| 27 | 2026-11-09 15:47 | up/0.85/choppy · bracketed_range | [`2NKSWWGmxb…`](https://suiscan.xyz/testnet/tx/2NKSWWGmxb4J84gMUFfNm5eZkhnFRnyLnftUCUwDRiii) | `71bafa0ac764…` | `cBPPZ31gOnhhmECntah4hfhfmCQGf1CuZu7YMirgSbk` | pending | — | cli |

## 2c. Provenance — every commit counted by origin

| forecaster | namespace | CONVICTION by origin | commits on-chain | hidden | memories |
|---|---|---|---|---|---|
| demo trader | `helix-v1-4d922636976d` | cli 24 · browser 3 | 28 | 0 | 90 |
| agent momentum | `helix-v1-f86dd6bda0c6` | agent:momentum 2 | 2 | 0 | 6 |
| agent reversion | `helix-v1-b7f54e89048d` | agent:reversion 1 | 1 | 0 | 3 |
| agent surface | `helix-v1-1d2aef04ef74` | agent:surface 2 | 2 | 0 | 6 |
| agent crowd | `helix-v1-9d46530e40aa` | agent:crowd 2 | 2 | 0 | 6 |

## 2d. Proof-of-Forecast — Council, Passport, payments (live)

- **Ticker** (`GET /proof/ticker`, chain events): 37 commits by 7 committers · 35 settled · hidden 0
- **Council**: 4 agents · weights still equal (n < 5) · 0 COUNCIL memories · allocator vetting decisions: 0
  - momentum `0x92608f0b7b1f5872fa0b3a314b7aba05f228e45b24e19d197914a2e2949f7d31` — 2 commits, 2 settled, 1 won, Brier 0.216
  - reversion `0xe89018db81101846e5526e56d7c758cf95d8e6099eb664f0386f9282097d5d58` — 1 commits, 1 settled, 0 won, Brier 0.282
  - surface `0x97dd8db5d9e2c5a88fd64ec36e6bcebecc97a561f265156100b54eed9be2fa3f` — 2 commits, 2 settled, 2 won, Brier 0.107
  - crowd `0x392a02dbb7829a518da3522feb621a9c2706f8010b0c4822aa29ed9a4df1a746` — 2 commits, 2 settled, 2 won, Brier 0.214
- **Passport** (`GET /passport/helix-v1-4d922636976d`, Ed25519-signed, key `18a0e77777aa256a62417fa8b6debb559aaa1af1b0754a5252897a46b6116a6f`): committed 28 · shown 27 · hidden 0 · badges Honest Loser, Contrarian
- **Paid Credibility API** (`GET /api/v1`): 0.001 SUI (testnet) per call, treasury `0x29ca7dc45b6ef496e87e3daa317ac55aa66577fcc6c82323bd171f0f8dc4bd36` · paid calls 2 · latest [`6qNJfXwWVe…`](https://suiscan.xyz/testnet/tx/6qNJfXwWVebnxtSbusDMLf4WFFnqWYpvdYYu9gTYpLqA), [`5mhhMLQ6C5…`](https://suiscan.xyz/testnet/tx/5mhhMLQ6C5rnM3vpqdfpemt99DuVpGW9NKCJRjah6Fn2)

## 3. Memory visibly changes the product (L-01 vs L-02)

Same conviction `{"direction":70,"confidence":85,"horizonCode":1,"volView":70,"capital":5}` compiled against the live market for a fresh address vs. `0x16a384bb…`:

**Without history** (`0x00000000…`):
```json
{
  "order": "BTC between $75,383 and $75,516 at expiry (upside bracket)",
  "structure": "bracketed_range",
  "memory": {
    "n": 0,
    "message": "No settled history in this setup yet — using the market's view.",
    "commit": 5,
    "suggested_commit": 5,
    "structure_suggestion": null,
    "lesson_text": null,
    "gap_you": null,
    "best_voice": null,
    "blob_ids": []
  },
  "guardian_memory": "Memory: no settled high-confidence bullish calls in choppy BTC yet — HELIX takes this conviction at face value."
}
```

**With history**:
```json
{
  "order": "BTC between $75,383 and $75,516 at expiry (upside bracket)",
  "structure": "bracketed_range",
  "memory": {
    "n": 12,
    "message": "Learned from 12 settled convictions in up/high/choppy.",
    "commit": 5,
    "suggested_commit": 1.5,
    "structure_suggestion": null,
    "lesson_text": "up/high/choppy: Won 4/12 here; stated confidence runs ~50 points hot. Size down. HELIX's regime model has been closer than you (Brier 0.23 vs 0.52).",
    "gap_you": 0.5004166666666666,
    "best_voice": "helix",
    "blob_ids": [
      "eSB1aLVsjDLkTWPa2f1g1ZMg8sw7Yv2EqRcg8IfjrJI",
      "BgRFIgxElWP9L874_EhQfhP2LFIJpfOo_JhzAOe2jpM",
      "TRXDsQLlGRiPM8IkSaU0A2xgEDulA27kxxAiXqsXivs",
      "XqFsGftePOKeXBCuJjBxpkoHDeSM-SBXK1wTHnLER3A",
      "5lWZbhCNT2GjlkBNKv-RIPpfRumfuuz7zD-TbyKdm08",
      "2IoZgjKAr6j-QrmupWAKBCV6fvaZFwLGdCcLP1hbAIg",
      "Nzevybu_Pdgb8pIssnD8w83-zlkkUP9xDPKUW-M6cJc",
      "Ik3bC3_3veK29HLpKk68Ek-r5xrOZefdTmHvS_6qLdY",
      "dd4L8cxWtodZkJvE-YAvkE-vwIFEIuYfK6ki4yQZ6QY",
      "0UceevcbLcxNL64NY2ikEvqYH3QhllZ1NlMunZYzybY",
      "QdCB8dtqS83Q_dJNxitLAQQza7Klb7wcYbaMs5USUxM",
      "tuI545aec2AFiiJjs7RdZM7RATgz2jWIdf60t8fA4Pc",
      "8KHfTdQUClH-xaCY8sOtOE0-4YoJO0YG9JMCJCqHEOc",
      "hGpsvI5UdHD_lAuQ1ahRsBx0d3EYPf1M4BwjbuvVqSI",
      "qZfHzG3dPVbpCfLs1jaJppLipzE0uNOj0SzYlxSQ2O0",
      "BCs9mA3eqI6YkBJJyZckWEnYJfIvzEVgCB_3X8swv2o",
      "XBLtiRLV9Jc1SSv6Vnsbv5bClv--UJktKY5IG1RqE6Y",
      "gbFNUpcyMC9_viyQ-WUFDr3rkTW2ajuztt4K8PRn3XU",
      "igu41jBV2NxZenjvdW3VTS5SCoGLbTBrUxdil8JobjU",
      "eE6Mk43z2A2kqZLz8p5cbWk-PokG_0vD51zfIUVQ_qU",
      "b9idG4Vc0xKwMIgloHWlXvc0VSiJNFfrvMjtB6rfWCU",
      "nMqXkMLzZXtHYWRJ_BZ6lyuwGVOhguqDtwvr_cFnwe0",
      "BBbTE4NsNh9GYMltCvvlC3TUF_eAJOf4h-8_skvLSi4",
      "9VTpneZ7-Kqq_6uorAu5rPjCyl4Vzf8SWbjY8O_YYRg",
      "_LgeerkPiEmPB42SpVg2cj3zQs6nQuyKhqfy_-UtfFg",
      "Ke_4MLlEwdqiUGXf22JB5UuE_cvWuzBaMSEfqpZFVaI"
    ]
  },
  "guardian_memory": "Memory: last 12 high-confidence bullish calls in choppy BTC — you won 4; your confidence runs ~50 points hot here. HELIX's regime model has been most accurate (Brier 0.23)."
}
```

## 4. Calibration for `helix-v1-4d922636976d`

```json
{
  "overall": {
    "n": 26,
    "wins": 10,
    "realized": 0.38461538461538464,
    "posterior": 0.4,
    "mean_p_you": 0.8073846153846153,
    "gap_you": 0.40738461538461523,
    "brier": {
      "you": 0.4408344615384615,
      "market": 0.24140584615384614,
      "helix": 0.23998692307692304,
      "crowd": 0.09209166666666667,
      "council": 0.34251850000000006
    },
    "n_crowd": 3,
    "n_council": 2,
    "pnl": -30.120000000000005
  },
  "buckets": [
    {
      "bucket": "down/high/calm",
      "n": 2,
      "wins": 2,
      "realized": 1,
      "posterior": 0.6666666666666666,
      "mean_p_you": 0.883,
      "gap_you": 0.21633333333333338,
      "brier": {
        "you": 0.013688999999999998,
        "market": 0.43957300000000005,
        "helix": 0.4529930000000001,
        "crowd": null,
        "council": null
      },
      "n_crowd": 0,
      "n_council": 0,
      "pnl": 6.73
    },
    {
      "bucket": "down/low/calm",
      "n": 3,
      "wins": 1,
      "realized": 0.3333333333333333,
      "posterior": 0.42857142857142855,
      "mean_p_you": 0.657,
      "gap_you": 0.22842857142857148,
      "brier": {
        "you": 0.3269823333333334,
        "market": 0.23706600000000003,
        "helix": 0.23706600000000003,
        "crowd": null,
        "council": null
      },
      "n_crowd": 0,
      "n_council": 0,
      "pnl": -1.1799999999999997
    },
    {
      "bucket": "up/high/choppy",
      "n": 12,
      "wins": 4,
      "realized": 0.3333333333333333,
      "posterior": 0.375,
      "mean_p_you": 0.8754166666666666,
      "gap_you": 0.5004166666666666,
      "brier": {
        "you": 0.52255375,
        "market": 0.23875824999999998,
        "helix": 0.2339765,
        "crowd": 0.112825,
        "council": null
      },
      "n_crowd": 2,
      "n_council": 0,
      "pnl": -23.27
    },
    {
      "bucket": "down/mid/choppy",
      "n": 1,
      "wins": 1,
      "realized": 1,
      "posterior": 0.6,
      "mean_p_you": 0.68,
      "gap_you": 0.08000000000000007,
      "brier": {
        "you": 0.10239999999999996,
        "market": 0.249001,
        "helix": 0.249001,
        "crowd": 0.05062499999999999,
        "council": null
      },
      "n_crowd": 1,
      "n_council": 0,
      "pnl": 3.82
    },
    {
      "bucket": "up/high/calm",
      "n": 2,
      "wins": 0,
      "realized": 0,
      "posterior": 0.3333333333333333,
      "mean_p_you": 0.883,
      "gap_you": 0.5496666666666667,
      "brier": {
        "you": 0.779689,
        "market": 0.11390650000000002,
        "helix": 0.1073665,
        "crowd": null,
        "council": null
      },
      "n_crowd": 0,
      "n_council": 0,
      "pnl": -8
    },
    {
      "bucket": "up/low/calm",
      "n": 2,
      "wins": 2,
      "realized": 1,
      "posterior": 0.6666666666666666,
      "mean_p_you": 0.657,
      "gap_you": -0.009666666666666601,
      "brier": {
        "you": 0.11764899999999998,
        "market": 0.49632050000000005,
        "helix": 0.49632050000000005,
        "crowd": null,
        "council": 0.6099610000000001
      },
      "n_crowd": 0,
      "n_council": 1,
      "pnl": 12.78
    },
    {
      "bucket": "down/high/choppy",
      "n": 2,
      "wins": 0,
      "realized": 0,
      "posterior": 0.3333333333333333,
      "mean_p_you": 0.86,
      "gap_you": 0.5266666666666666,
      "brier": {
        "you": 0.7395999999999999,
        "market": 0.08791449999999999,
        "helix": 0.08791449999999999,
        "crowd": null,
        "council": 0.07507600000000002
      },
      "n_crowd": 0,
      "n_council": 1,
      "pnl": -8
    },
    {
      "bucket": "down/low/choppy",
      "n": 1,
      "wins": 0,
      "realized": 0,
      "posterior": 0.4,
      "mean_p_you": 0.635,
      "gap_you": 0.235,
      "brier": {
        "you": 0.403225,
        "market": 0.088209,
        "helix": 0.10692900000000001,
        "crowd": null,
        "council": null
      },
      "n_crowd": 0,
      "n_council": 0,
      "pnl": -8
    },
    {
      "bucket": "up/low/choppy",
      "n": 1,
      "wins": 0,
      "realized": 0,
      "posterior": 0.4,
      "mean_p_you": 0.635,
      "gap_you": 0.235,
      "brier": {
        "you": 0.403225,
        "market": 0.08761599999999999,
        "helix": 0.07562500000000001,
        "crowd": null,
        "council": null
      },
      "n_crowd": 0,
      "n_council": 0,
      "pnl": -5
    }
  ],
  "reliability": [
    {
      "lo": 0.5,
      "hi": 0.6,
      "n": 0,
      "stated": null,
      "realized": null
    },
    {
      "lo": 0.6,
      "hi": 0.7,
      "n": 8,
      "stated": 0.654375,
      "realized": 0.5
    },
    {
      "lo": 0.7,
      "hi": 0.8,
      "n": 0,
      "stated": null,
      "realized": null
    },
    {
      "lo": 0.8,
      "hi": 0.9,
      "n": 18,
      "stated": 0.8753888888888885,
      "realized": 0.3333333333333333
    },
    {
      "lo": 0.9,
      "hi": 1.0001,
      "n": 0,
      "stated": null,
      "realized": null
    }
  ],
  "reasons": {
    "flows": {
      "n": 1,
      "wins": 1
    }
  }
}
```
