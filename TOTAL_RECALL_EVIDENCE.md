# TOTAL_RECALL_EVIDENCE

Generated 2026-11-10T11:51:07.479Z by `tee/scripts/evidence.mjs` from live endpoints — nothing in this file is hand-typed.
Service: https://helix-compiler.onrender.com

## 1. Tatum chokepoint + Walrus Memory health (`GET /health`)

```json
{
  "tatum_testnet_checkpoint": 404897132,
  "tatum_mainnet_checkpoint": 343704646,
  "tatum": {
    "plan": "free;ratelimit=3;strategy=shared",
    "testnet": "sui-testnet.gateway.tatum.io",
    "mainnet": "sui-mainnet.gateway.tatum.io",
    "requests": 503,
    "retries": 6,
    "recent_executions": [
      {
        "net": "testnet",
        "digest": "8xa5EA1rmYexSJt8JGr9yrJtDFwWuveH3CYKiHaFxtHe",
        "at": 1794311026795
      },
      {
        "net": "testnet",
        "digest": "7WWKREo9rhsyjj686nehUGk6LqsNZpxXcZmsiKyxPnoF",
        "at": 1794310472203
      },
      {
        "net": "testnet",
        "digest": "HofjsL7TrK6vuLVdAYh5U9w5radmtd6QQ7NA89PmHvm2",
        "at": 1794310384192
      },
      {
        "net": "testnet",
        "digest": "HCFDetGZ8tdKr2VWBbDBs8YbSQik6D26kP6pkq61NaBg",
        "at": 1794310352617
      },
      {
        "net": "testnet",
        "digest": "2GMagds1EfZAn3oRKDAnxANAhNw6aZmMqwideT9LJro9",
        "at": 1794310292438
      }
    ]
  },
  "memwal": "ok",
  "memwal_detail": {
    "status": "ok",
    "mode": "mainnet",
    "agentMatches": true
  },
  "memory_network": "walrus-mainnet",
  "watcher": {
    "pending": 0
  },
  "predict": {
    "network": "testnet",
    "open_windows": [
      4,
      9
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

## 2b. Commit mode — on-chain commit–reveal (80 CONVICTION · 80 OUTCOME; target ≥30 / ≥20)

On-chain ledger (`ConvictionCommitted` events by this address via Tatum, matched to memory by hash): `{"journal":"0x5bcf3bf66f6c71f53aaf681842b554edde5b6c141c7315ba0ac6b4cd6766652f","onchain":88,"with_memory":84,"recording":0,"missing_memory":4,"memory_complete":true,"verified_at_settlement":4,"verified_at_settlement_digests":["9odUAx2bXLgbGXbMLVNRWWq1SDDiWdDyU5NAQQqLLti3","Fqqh9cJzJwCr4FY4kadSMdwpRKX3AoSELeomqssq4i26","Aa8YJhbAXnMyMMTZeHG5PQ2oXWBEnRHEyu38gh34efSB","6SKKccFY5y1bRLmRNy1VasrJHj71exc6QsJx4Cvy3w8Q"],"settled":84,"wins":34,"reveal_ok":84,"win_rate_all_commits":0.38636363636363635,"missing":[{"digest":"Di18sa2d8Ae61KQrC6U9MRWAMQFpoSbK7czY5LZTg77e","hash":"66f6e7bd176499a82659ce260f83c271f6c646e8b62e4183228e7c03fcacfdc2","expiry_ms":1794240000000},{"digest":"CrWw3cmzoNygVeUEpkSddngSUxYB8mcJphbMieRFkjuE","hash":"65711cff0bab72ae642164e0823e94bc89da15a7dd3988e3222e943c89a31217","expiry_ms":1794294000000},{"digest":"B6tHQUWRhnTPbK5py8QeMs5Rhx11UwggaynQR8dEnqAj","hash":"dd534990d3e514243cf60f1a75023b5f73e80658cc6dd862759bacd707f5a0f1","expiry_ms":1794298800000},{"digest":"8QogKW8DRe1EefjauX7gMwLJYNNjx6hnN3jo28afqERX","hash":"e4e92df9635fd763bb011e17f39cd73f035f150d782f821656c3ade90f909d57","expiry_ms":1794309300000}]}`

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
| 19 | 2026-11-09 13:19 | down/0.30/choppy · bracketed_range | [`HPYMu51EZE…`](https://suiscan.xyz/testnet/tx/HPYMu51EZEAYstvLnbvrodVddufgQSseadD37uJHdTnz) | `e50f3c4330d3…` | `2Yhd5VNyyhUJ852Ef7F9m31LkWs5QRdcR8ey77YIdrk` | LOSS · -8.00 · reveal_ok=true | `5ZbErUb9oh1wDHqRQamp7wHaaJTGOsXiR8GOP9qbirM` | cli |
| 20 | 2026-11-09 13:35 | up/0.85/choppy · bracketed_range | [`4oPEF9R6bS…`](https://suiscan.xyz/testnet/tx/4oPEF9R6bSL4E6RD1qV6aCHC6ix1hCLzKnm6w51xXigW) | `0a89ba4c57cc…` | `igu41jBV2NxZenjvdW3VTS5SCoGLbTBrUxdil8JobjU` | WIN · +2.94 · reveal_ok=true | `eE6Mk43z2A2kqZLz8p5cbWk-PokG_0vD51zfIUVQ_qU` | cli |
| 21 | 2026-11-09 13:51 | up/0.30/choppy · bracketed_range | [`3fxG8pdEiE…`](https://suiscan.xyz/testnet/tx/3fxG8pdEiETKAk8bzXDhsPSas2p4zPTsjwNqRdcnVQYz) | `babb38107d72…` | `okKJ_of0I7yUj9yYG-cqL1s6x4wWLgeFZ8GsIsm_4II` | LOSS · -5.00 · reveal_ok=true | `PbwjOzjk9qUStMTNc-SdV_dXzE0cyeSU_MzeoymYnz4` | cli |
| 22 | 2026-11-09 14:07 | up/0.85/choppy · bracketed_range | [`G1JSUUJPwG…`](https://suiscan.xyz/testnet/tx/G1JSUUJPwG4iAUoFmDkg8fLfqR6g6gBRi5NDL2UzyB2Z) | `32459c12da23…` | `b9idG4Vc0xKwMIgloHWlXvc0VSiJNFfrvMjtB6rfWCU` | WIN · +7.82 · reveal_ok=true | `nMqXkMLzZXtHYWRJ_BZ6lyuwGVOhguqDtwvr_cFnwe0` | cli |
| 23 | 2026-11-09 14:23 | down/0.85/calm · range | [`CqRKVyk6La…`](https://suiscan.xyz/testnet/tx/CqRKVyk6Laut5T6ZwvHFe61jKmUSbzosMXExDEb5PXac) | `8575febec7e0…` | `SIoUAGXJIZYicrIzueQ7QgaMdDYDd_Kt-fq6iywuP8A` | WIN · +2.50 · reveal_ok=true | `01-_KsVq39Aoyoi0B_l03UR7gEQt2sFRea1ohOcZf1k` | cli |
| 24 | 2026-11-09 14:57 | up/0.35/calm · bracketed_range | [`3b7AnQxA7W…`](https://suiscan.xyz/testnet/tx/3b7AnQxA7WY6oK8vedYjE6LevxX8brDbqBbh6RuEJtwZ) | `d17e3aa0e98f…` | `cx7VAXQcFoR9NjD_L1Myj_NGu4NrpveP9Ah8xPocuUo` | WIN · +7.85 · reveal_ok=true | `1vZEewZvO7Nri5gY1Wl_LRHS-IrFQxJETqAdE50R__E` | cli |
| 25 | 2026-11-09 15:13 | up/0.85/choppy · bracketed_range | [`HYNnGSXvBq…`](https://suiscan.xyz/testnet/tx/HYNnGSXvBqGyHCeN84ThPPmMD9jmk5YyEw57R937F5oB) | `3119a79e5f6f…` | `BBbTE4NsNh9GYMltCvvlC3TUF_eAJOf4h-8_skvLSi4` | LOSS · -3.00 · reveal_ok=true | `SIxwa5ZDKcEIqyfvbUiGrvYcGvullAHmUE592XFF_HI` | cli |
| 26 | 2026-11-09 15:26 | down/0.80/choppy · bracketed_range | [`7kAU4AEPww…`](https://suiscan.xyz/testnet/tx/7kAU4AEPwwEuEuS6ipLWTnxPX19X9A6eZ4ZVZJoJPeLu) | `bc572cf5ef64…` | `UwmyrKrQE7ncmrxzVvMfLeF_2IQcIe6Mad9rHWUgefU` | LOSS · -5.00 · reveal_ok=true | `BUCxSBQ0gMw14bsvAEhS1tq_abNng5JxBH4WAkp4TyQ` | cli |
| 27 | 2026-11-09 15:47 | up/0.85/choppy · bracketed_range | [`2NKSWWGmxb…`](https://suiscan.xyz/testnet/tx/2NKSWWGmxb4J84gMUFfNm5eZkhnFRnyLnftUCUwDRiii) | `71bafa0ac764…` | `cBPPZ31gOnhhmECntah4hfhfmCQGf1CuZu7YMirgSbk` | WIN · +7.78 · reveal_ok=true | `PgGXzPmMpurxfMhtJr_8PvhYRZxr8UpQHl52gyCEzX8` | cli |
| 28 | 2026-11-09 15:50 | up/0.85/choppy · bracketed_range | [`FQdrBCaF6a…`](https://suiscan.xyz/testnet/tx/FQdrBCaF6apGwraP3RFDAgfFAyW8BxSAmbALTUHHfb68) | `980561965292…` | `weCCTiT5p1MMPy6T4CpH1xDvxEebeLtR6Vx6EDtscaE` | WIN · +7.79 · reveal_ok=true | `ojlDDeF-46MFQMHqB7dm0OzEIJXkyieInPExpFYQDLE` | cli |
| 29 | 2026-11-09 15:54 | up/0.80/choppy · bracketed_range | [`3wgDtCzPs1…`](https://suiscan.xyz/testnet/tx/3wgDtCzPs1iQadsYeZVdzKUdeQPsNTb6yZh8gweAEpAX) | `63b03b0d291b…` | `LD9b4ryMTiOp1uZlUPhmpqa-WVKY2oIzQOVI9r8z2sY` | WIN · +2.97 · reveal_ok=true | `0-DOr1e-B9t7entcZ3zJz_BP-Z-JHEzrLTPxGcEBNwk` | cli |
| 30 | 2026-11-09 16:16 | up/0.85/choppy · bracketed_range | [`129diGz6RY…`](https://suiscan.xyz/testnet/tx/129diGz6RYnPP7u49eySnEajNYnMvdya4XQdQgejwvzA) | `c78b22c4a221…` | `UL79K2AUTqO1sOl33N4Ed2CmeISUEGEq7xDVm0Z8L-w` | LOSS · -5.00 · reveal_ok=true | `LU7PfE6F-mDU_P0RW1Bp_UU5Eq0vhGKXvWYpVy5rOZc` | cli |
| 31 | 2026-11-09 16:38 | down/0.35/calm · bracketed_range | [`H8PNPQigVj…`](https://suiscan.xyz/testnet/tx/H8PNPQigVj8QWyCEZ7BJazV1J4eBP4WAc2pxBozDgQtd) | `45b0eeac293c…` | `LdSqQu4gvLuBf2pqhiWpei7XLuIncmdZzX72kowHPNU` | LOSS · -8.00 · reveal_ok=true | `w7mDXfgxklccSSFHz71iYdXxi33zUS1QnL7lkI7wQMQ` | cli |
| 32 | 2026-11-09 17:00 | up/0.85/choppy · bracketed_range | [`GS8rrwfR3S…`](https://suiscan.xyz/testnet/tx/GS8rrwfR3SCZQeEwZ1ALS4To4QfzdnvMn2xjFXZEH6pF) | `5ec3f3e999ee…` | `pNqNOupjhvNc2ggiaAahrwF1Lcdnagi4oASRDMLywck` | LOSS · -3.00 · reveal_ok=true | `FIQP4XUb_yZGABCVt57SCHxPTZoAx4hCGvq4_UQLjzs` | cli |
| 33 | 2026-11-09 17:21 | up/0.85/calm · range | [`2oAYPaFiRb…`](https://suiscan.xyz/testnet/tx/2oAYPaFiRb4HCFHUSypMJcTuRYkxaKWbNCn5fNnMbKEB) | `05d5f66b7ba4…` | `X9PaKU4zPkjlFOQIRqKQLINi7UfP2Y8eol7D2UjL_VM` | LOSS · -5.00 · reveal_ok=true | `J18AHh9K6KAyG-Bc0uhS5WGmgHTs4609XSNRLYiiRS4` | cli |
| 34 | 2026-11-09 17:43 | up/0.85/choppy · bracketed_range | [`4twNgQSUbz…`](https://suiscan.xyz/testnet/tx/4twNgQSUbzRD3qz12NDvLUv6DcZMJBeR5TbRSTmQL5Tm) | `f7ec90ed9a2c…` | `XWlngqFN-OGjvytOuiZCRzT7s2bdf7hwNClF5yqxH5Q` | LOSS · -8.00 · reveal_ok=true | `BqzR3CEEiXvs38rgP0UftRGsh1fVOcnlKzw6_opfTg0` | cli |
| 35 | 2026-11-09 18:05 | down/0.30/choppy · bracketed_range | [`5JGmDCYzYG…`](https://suiscan.xyz/testnet/tx/5JGmDCYzYGBm5XvC2ZtYuZrBNUV5CxFcm1YDPLhau44y) | `2c4abd9ad033…` | `XQhGJdmnpnkoWATlJiRPCw8MgRlEUY64Pzy2PWW6akE` | WIN · +2.92 · reveal_ok=true | `_DVYLCJj_otuaudsoL5NB2jD_tjLktQL4F24DOFH0Yw` | cli |
| 36 | 2026-11-09 18:26 | up/0.85/choppy · bracketed_range | [`7wrTnwMdS8…`](https://suiscan.xyz/testnet/tx/7wrTnwMdS8kTgEN5JR631eNJBj4oLVTw9BzDLw8U8QvR) | `215e6e461d11…` | `MUO4-N7lX4xAqX5AKm9ZONuLXamJHmkhNeAzA0gNVUo` | LOSS · -5.00 · reveal_ok=true | `feMBYLARTmL4mPmHOUrJ8AQqxeZawc5Ygojkiio-meg` | cli |
| 37 | 2026-11-09 18:48 | up/0.30/choppy · bracketed_range | [`3ZSBbfp7XM…`](https://suiscan.xyz/testnet/tx/3ZSBbfp7XMB9kygDPSGuNwz59VaPTtVxQH9D6yVvLYL7) | `5e6f8d130b83…` | `ude8ZnmyU_iMiWD8IGtFBebIQNS-n8wsb38mR0TJEO8` | WIN · +7.83 · reveal_ok=true | `JS2ggJ9SWzYoz2u2kpazTtOOEZkOUVzEXvlYiSy6evM` | cli |
| 38 | 2026-11-09 19:10 | up/0.85/choppy · directional | [`2xyqhBANi3…`](https://suiscan.xyz/testnet/tx/2xyqhBANi3g4UTaGzsUrjsmdCYoqf7NhLQYp6tsgipAn) | `02bf09a91bf4…` | `MnnRRhT6ca2L7HwKlrg0dOCRRbulOr6f6xsUDgyNz2Y` | LOSS · -3.00 · reveal_ok=true | `r_hbl-8JiRRctLS5n74UHoGssCMozFZ0FO2Z7TGxZ6k` | cli |
| 39 | 2026-11-09 19:52 | up/0.85/choppy · bracketed_range | [`5k3KNiSqk7…`](https://suiscan.xyz/testnet/tx/5k3KNiSqk7NhChmaFxAdPJY4phCyKi6rHQNFjuLMshTF) | `4337a6693ec4…` | `0pyW0GtlgVhXafLPex_F6kCnbqB2V-YUXW4lcKog0Ho` | LOSS · -8.00 · reveal_ok=true | `oYg50EtneVYso-xP5aSzXxfjMRPdm-oihJ4IpsAaLbw` | cli |
| 40 | 2026-11-09 20:14 | up/0.35/calm · bracketed_range | [`6iC5PeqrnP…`](https://suiscan.xyz/testnet/tx/6iC5PeqrnPaGttsyErbot9ngj6S6Srvdo9m7RxaZzwT1) | `fa0302a1e7b3…` | `0XS435yF03jmWFeo9BgJ5Y8a1edIXhW7f3J15FTqbic` | LOSS · -3.00 · reveal_ok=true | `yFLIR1k4_-AOv0TTANUqWIGZUKdyBRT9R_uLWZmkfdU` | cli |
| 41 | 2026-11-09 20:42 | up/0.85/choppy · bracketed_range | [`GzGCeMKczN…`](https://suiscan.xyz/testnet/tx/GzGCeMKczN1dhvu8EQarqAGB11faJMDJb8DGqeduvCfW) | `8871447759e4…` | `bXleufd3ZLc_SmXhNDRBPOunVvsCuMgPKafkV9wtS7E` | LOSS · -5.00 · reveal_ok=true | `XgxOuMd16gdeFsMqnqvKGVICv0P6viUUv3pn8oYyxTY` | cli |
| 42 | 2026-11-09 21:03 | down/0.80/choppy · bracketed_range | [`9PR9fSMCoo…`](https://suiscan.xyz/testnet/tx/9PR9fSMCoo5UqYg5dj6yGwsViE4oD5HLynZeomwZqCPY) | `a5a2e7831bfb…` | `D_L14QVwmAfJ0ayKX8KDXAdktw6e9DsR6kxh-UIqK7w` | WIN · +7.75 · reveal_ok=true | `hU7SozGWIY0k0zjfQyK6mMlclIFHA_NtkGyddFiNypI` | cli |
| 43 | 2026-11-09 21:23 | up/0.85/choppy · directional | [`5UMqPQ5Jis…`](https://suiscan.xyz/testnet/tx/5UMqPQ5JisJxusqn7qc6xGVn5crpcUxPD4AHToWEv5We) | `35337b56b7aa…` | `dyI7gpVVvRPBv-S9pTaZDI-ss3OsXlQIQCTx9ir1qwM` | WIN · +2.67 · reveal_ok=true | `C3haKP6sBf3xvRsKxMuXIAWeN5HBef5d0VW4USEoNsI` | cli |
| 44 | 2026-11-09 21:46 | up/0.80/choppy · directional | [`B5L8aRu7UW…`](https://suiscan.xyz/testnet/tx/B5L8aRu7UWxVrz4th6ahLrPXGQxqYQuA6DHR5ALqt3TU) | `95b896edd4bc…` | `ngeca2g-XgK2DaI8nC33UWPeVpttudac2nMp8abpsJg` | WIN · +4.48 · reveal_ok=true | `0Q-2xdt9BURZJX-dAjSfsdRqDkdbQUn5i1uKHPNkHUY` | cli |
| 45 | 2026-11-09 22:06 | up/0.85/choppy · bracketed_range | [`FSP3QdzCHb…`](https://suiscan.xyz/testnet/tx/FSP3QdzCHbwMFCrKzA6qHFosZZ9fs2ALJZoumiAo228L) | `a9fabfceed56…` | `67LcabJWNkY5KNsbl0JhjEYn2yis9ejBRmKIUl2IU-A` | LOSS · -8.00 · reveal_ok=true | `D5Dso0upFbasOHTIMwbqlqnIdalFoDm_MZV1FJ5gw18` | cli |
| 46 | 2026-11-09 22:27 | down/0.35/calm · range | [`C6HJ86KjAV…`](https://suiscan.xyz/testnet/tx/C6HJ86KjAVPspuJ3j2yUgYTp1fn5JpWFADQPFEsoinyR) | `db0aff8c30a0…` | `C_vumhesqyzJ3IA997r528KVeZCDHycrvx71StkuOao` | WIN · +2.61 · reveal_ok=true | `MHtG02Yqko6N2jgoQL6NzvJsCMf9F8dl30CwZG1ThxA` | cli |
| 47 | 2026-11-09 22:48 | up/0.85/choppy · bracketed_range | [`CcWQ7M8xZ8…`](https://suiscan.xyz/testnet/tx/CcWQ7M8xZ8XJG1fYBqvE2rW7SfXdQDPuAtNDhj8SDTBB) | `89f8ce87f5da…` | `ky_B4LyjgnjjhVq8E_sZPi_hZfBoAGMDh0miWCKLnL0` | WIN · +4.92 · reveal_ok=true | `DOPPhWri1Z2AwU6WviC09lXrH6Hp7SpQ5fI71m7Wzg8` | cli |
| 48 | 2026-11-09 23:09 | up/0.85/calm · bracketed_range | [`EfYCpCT6Nz…`](https://suiscan.xyz/testnet/tx/EfYCpCT6Nz1M4wZJWjJWWC7eZ8DnXnB5ZERnoVCZwqHD) | `098be767f251…` | `YGFN3WbHmHOe-7FCcnUDQUyKxtuMcLUCsF01ZeR5kiA` | LOSS · -8.00 · reveal_ok=true | `3pL3hmIT3IwndJD0qLX0dDs3Oe7Et_opaUBU4047MKE` | cli |
| 49 | 2026-11-09 23:30 | up/0.85/choppy · bracketed_range | [`A86g6H8LUj…`](https://suiscan.xyz/testnet/tx/A86g6H8LUjg5Jq5QPaZECmCKeVaXsR7AV4ihDajVVF1B) | `cd553004e18d…` | `fSL8XKGqPRRHh12dDCNRNNifzscROic8SSq_cZryT4o` | LOSS · -3.00 · reveal_ok=true | `NCeB8Q4pvmKfRi5RPbCseVWKm_jcNja8kq6ET8VmrHk` | cli |
| 50 | 2026-11-09 23:51 | down/0.30/choppy · directional | [`9aytBCd5QA…`](https://suiscan.xyz/testnet/tx/9aytBCd5QAi7y6VTUsJTfXTdvoXqoG1TMccfPAknqMDq) | `746fb9d4525d…` | `PxjX6agsOVMP86hXpKJAuEy9BuPf1oSn0XwDUDuMcJc` | LOSS · -5.00 · reveal_ok=true | `2OJIB9f8zOzzCrzmrInG0TPUaPpZI85XOyla6Fbhfi4` | cli |
| 51 | 2026-11-10 00:11 | up/0.85/choppy · bracketed_range | [`Cd9AYNP95z…`](https://suiscan.xyz/testnet/tx/Cd9AYNP95zuuYPQ2RDS4jGDa68rYHZ3C1CwYnSd1a2mW) | `7c094380e3c7…` | `tIWHjvMWapzFuihL93tYrosGwfnjA3XRrU_mAwjjBkM` | LOSS · -8.00 · reveal_ok=true | `OfvtBoZozw2t2l3WFuAM_OrN5Fs6Vk3yKrqMNL1SeJY` | cli |
| 52 | 2026-11-10 00:32 | up/0.30/choppy · bracketed_range | [`Hgu7tqPMEs…`](https://suiscan.xyz/testnet/tx/Hgu7tqPMEsxhGyx4E3SQcedMe6mAknJHud6QsPQhW5b4) | `96ad8128069f…` | `XBFNwp9Z0H_5uMtWUf5y4dTkhScvK5NMCUshhSUu3L4` | WIN · +2.97 · reveal_ok=true | `pDHiQrI5eF8s9uEUw-dIdwbgiDi-W70nyOqk8kc8q7Q` | cli |
| 53 | 2026-11-10 00:53 | up/0.85/choppy · directional | [`3kZNRvMJyf…`](https://suiscan.xyz/testnet/tx/3kZNRvMJyfFK8nbKZ3izEcztPdiUpLjp5x1RSTqmbnnV) | `dace4d636393…` | `NsqRyfk-sAW3OGd0QqQxaWbDNCspV2aseQ3DSoHj62Q` | WIN · +4.50 · reveal_ok=true | `9OVZka8mxetRgF_gnzymynpDlvMUsbyiPEoSAKDyKSQ` | cli |
| 54 | 2026-11-10 01:15 | down/0.85/calm · bracketed_range | [`7K7a1v8zS6…`](https://suiscan.xyz/testnet/tx/7K7a1v8zS6EHLFXQ3RqqZV4UbUpt1TLCfXijbMYsxWQ6) | `521dba97d88b…` | `wPfoDMhhPSW3Izh4ZColn_iwTdzKGv4Tmrpxv4H8gVk` | LOSS · -8.00 · reveal_ok=true | `wj30FOQ4X5jaAgheg2bmyGQPSxtDSUpLQk4hyqBd-24` | cli |
| 55 | 2026-11-10 01:18 | up/0.85/choppy · bracketed_range | [`38ysLon1N7…`](https://suiscan.xyz/testnet/tx/38ysLon1N7kZKCEqz7o1Z6rimV6xH2SuQgskFqDiRB3M) | `9d5bbd353066…` | `bO2Ev5gDRFS2kIA6-wqOfGgGb5A3zs5dg0-XouFFmco` | LOSS · -3.00 · reveal_ok=true | `rJ5Zb6UKFWXnTyBtqvEHSSMw9-ohUmzHZRxyex-jpMQ` | cli |
| 56 | 2026-11-10 01:38 | up/0.35/calm · bracketed_range | [`CBmd2iuhPs…`](https://suiscan.xyz/testnet/tx/CBmd2iuhPsZhPSzNG6tiGBLtJDhaY3eXKHRWuvWU8B6Y) | `4594f4f87a71…` | `_a4PLYLRKS00cD4CL7UFdDB4fl0Lecy8vtV2p_4Iorg` | WIN · +4.91 · reveal_ok=true | `Mzswz8d9EQEkObvogGdYiifFawCunax94seRx1zWr9E` | cli |
| 57 | 2026-11-10 02:00 | up/0.85/choppy · bracketed_range | [`7MxhUDGRfH…`](https://suiscan.xyz/testnet/tx/7MxhUDGRfHVxVAMoB1ZtpPoK8fzsM9x419tP28yeC499) | `296f4df32587…` | `8Gvl1bgGmCxCmfQR83g-DV31851FsChwgGnEW_g45Kg` | LOSS · -8.00 · reveal_ok=true | `aLH8wT2XNxp8Hcghg3WRXMRySlHBZvvQCkL1RXNqWfI` | cli |
| 58 | 2026-11-10 02:21 | down/0.80/choppy · bracketed_range | [`5fKwXaToNH…`](https://suiscan.xyz/testnet/tx/5fKwXaToNHJpA4tSwEbu5HYsAxo1et4KXryyzxhk7p99) | `c2f1e7f57007…` | `8lKxnioPmqVHxFAeC-peBKKrsl-ikaImc8-HpulIFCM` | LOSS · -3.00 · reveal_ok=true | `wuQkj9QaslodXiwFhG_FVqodMRmRL8OJdGejn89F53E` | cli |
| 59 | 2026-11-10 02:42 | up/0.85/choppy · bracketed_range | [`7gvEEt7ZdJ…`](https://suiscan.xyz/testnet/tx/7gvEEt7ZdJyab1ZvHZN9wnAtAgoWZzQY1uUCwSooyuP9) | `88e8d1b33e8c…` | `5P5PCFLbEWMIGU80oRM3CaAgrnKNIPIhEjRgKuRtQVk` | LOSS · -5.00 · reveal_ok=true | `GCBeHztCMmooXFUctmQ2g4T2UX1TkyWxNkW_PvqEERU` | cli |
| 60 | 2026-11-10 03:02 | up/0.80/choppy · bracketed_range | [`47MGYTcVrE…`](https://suiscan.xyz/testnet/tx/47MGYTcVrERGQpddJHhiW64bWoC6TL7dLeZ7GDpvm5mC) | `533f12d78bc7…` | `wbGARTGpIzXAcMxIbVCDD5k30bLHqGgOD08OlCD9Xdg` | LOSS · -8.00 · reveal_ok=true | `aiQPfAp1ESftr1eqx1kWQuF8W2WmQIwjnMVV_h_9n-0` | cli |
| 61 | 2026-11-10 03:23 | up/0.85/choppy · directional | [`3ovM9euUXM…`](https://suiscan.xyz/testnet/tx/3ovM9euUXM8ybFfFjY37ErQf9NwB55KiPK73cFsr6u9L) | `ebad7efd68d6…` | `mPZ71RIFo-ftX6adWaPSxPyXqRbdllH6-ZlFbrj1BKI` | LOSS · -3.00 · reveal_ok=true | `fwaev7z8q5uHf4LiLvv4ljKFuu_npNTSLWroVP4Mg2I` | cli |
| 62 | 2026-11-10 03:45 | down/0.35/calm · bracketed_range | [`E9bgEP7TiG…`](https://suiscan.xyz/testnet/tx/E9bgEP7TiGE4sfCUMZ5bnfBg9UDU1rTVE3uFBKqWoT9J) | `8c5f0d236ae5…` | `ko6hb9y8xXMCofDgL_KoarGX03CZ1xUtYVGY9PHYvWw` | LOSS · -5.00 · reveal_ok=true | `V-OMgEH8kn-zibIyoZzkgEnkEM010_p0UZ4LRIMa9Yo` | cli |
| 63 | 2026-11-10 04:05 | up/0.85/choppy · bracketed_range | [`APkCE66boX…`](https://suiscan.xyz/testnet/tx/APkCE66boXfjbv6AxXAi4PWvvV284AgQKYvHJzGy9Uqb) | `3ca77fd1b558…` | `SB8EET5CP3SdQOJGE6-q_WiMXP9k6djel56KFM5DX5Q` | LOSS · -8.00 · reveal_ok=true | `oFueYtPVlni9FW501FQr9HM-tIXZWRhNRKSfjC3eaV8` | cli |
| 64 | 2026-11-10 04:26 | up/0.85/calm · range | [`ELBAekXbz7…`](https://suiscan.xyz/testnet/tx/ELBAekXbz7jxxd1cBb6tRZbFjtyKthfPh6owLzGWtzqf) | `8366d04b038f…` | `zh6LGB1A6RcghV4k8v4y9AY_dKH_oi_4APbnl4e2Tp0` | LOSS · -3.00 · reveal_ok=true | `MBskPhAoAxGf6Uykrhe9bAWLBVk-wGoWHm5_B5Qp9EI` | cli |
| 65 | 2026-11-10 04:46 | up/0.85/choppy · bracketed_range | [`EBa4Lz8cWE…`](https://suiscan.xyz/testnet/tx/EBa4Lz8cWE5RP8z52wkAmDJMsDkLeyjpaHhcf1B3Ds4B) | `374494aa2419…` | `__wfo3tPars0Nt6-o1_EqyH08HzkUUf4vn1DEo8CBEk` | LOSS · -5.00 · reveal_ok=true | `5DueSogNUkuvLIs47Q3CKfUWCdp0AknbhprVW-z6wMY` | cli |
| 66 | 2026-11-10 05:07 | down/0.30/choppy · bracketed_range | [`EkJCszj988…`](https://suiscan.xyz/testnet/tx/EkJCszj988Gt4cb7txS8RH5jPkbjGGfNP3V3KJcSLUpH) | `2cefd935adc2…` | `wqP5EZb-ZxFX1wsfxsIdXKbrKVgN2rwSUGJiyOC1hj8` | LOSS · -8.00 · reveal_ok=true | `GSb42-CsL98Qesb8q7xk9ibuI6TcEepVhtRbAWkmT08` | cli |
| 67 | 2026-11-10 05:27 | up/0.85/choppy · directional | [`3kmtzXkvrx…`](https://suiscan.xyz/testnet/tx/3kmtzXkvrxmSFJ7RZqFYxHue5RiesvHEM1LYGkxFj2Bm) | `4a35e13d027b…` | `rC2XMNAI71vJgzeZCJWZn-si9z5lirT9NNwy_5BGGhc` | WIN · +2.62 · reveal_ok=true | `L4yWxds0BJQtEwP7JWs8ruQogXO6BR_xXsbHNCEpP6g` | cli |
| 68 | 2026-11-10 05:48 | up/0.30/choppy · bracketed_range | [`92FZkWQFLZ…`](https://suiscan.xyz/testnet/tx/92FZkWQFLZmyV57Dvv77ScoHXP9SxezceTPPFmQZTrCA) | `a0dcd0395f96…` | `P6xsumGnARpTW7V653Nrg0_GDbeKmh_ji7CkQtfmuUI` | LOSS · -5.00 · reveal_ok=true | `G1sFu7QgUrncwbN567Cj2MoIYZmJH9MgyNpYKhUMU8c` | cli |
| 69 | 2026-11-10 06:08 | up/0.85/choppy · bracketed_range | [`2trtPmsnZT…`](https://suiscan.xyz/testnet/tx/2trtPmsnZTZ2zPRHeqKptKTVceYPgUrykBsYkuzPtrje) | `b7464e1ab32a…` | `i375K5lzSdC-341tnOoEOt1KuvG6w45q6kgUhxIn9YQ` | LOSS · -8.00 · reveal_ok=true | `hqrCgKxk67-KWEbh4bN7T2uMw85FcCbEr8-kMxdVRwk` | cli |
| 70 | 2026-11-10 06:30 | down/0.85/calm · bracketed_range | [`6fAuumwSWd…`](https://suiscan.xyz/testnet/tx/6fAuumwSWdAYfA17ksHF3EdqhaJqjZ2fArY12yHwVvD) | `bd1915c4a73c…` | `TG8tZuJ2YtFta1XXapMHpxTcYymvi0zamzSlK7PnXP8` | WIN · +2.96 · reveal_ok=true | `-vvX_7TkXXs5M2F-_D0fKJ21bFxTiV_vgT5O0k6C6rM` | cli |
| 71 | 2026-11-10 06:33 | up/0.85/choppy · bracketed_range | [`CQa6HucVZq…`](https://suiscan.xyz/testnet/tx/CQa6HucVZqqwMbNmCWyEiuEWAgnPGHRPABqUP1MqmQzN) | `4eb743824fb7…` | `8yn-QIjZSCxTBjTxj5X3q-NwkVsLIbf8yeEOM3Mbt50` | WIN · +4.87 · reveal_ok=true | `PBs9YrVxi9QbsnL79s-F39yAnuaRODwzPUmfiS7FrCw` | cli |
| 72 | 2026-11-10 07:36 | down/0.80/choppy · bracketed_range | [`XcLbfpc2kE…`](https://suiscan.xyz/testnet/tx/XcLbfpc2kELPS8n4F2dY2Ytyo6A1mWEW51CgMxaqyqQ) | `2db887f18f66…` | `UbROZvt3-8_FhhuyINoxm4cNKwGN7y6k0ExXg1Hyatw` | LOSS · -5.00 · reveal_ok=true | `BjqvTQiAQ0r8LgGDR4hwbtInPKhatKNp7b7nVJV8gN0` | cli |
| 73 | 2026-11-10 07:56 | up/0.85/choppy · bracketed_range | [`FAGZFd4nTv…`](https://suiscan.xyz/testnet/tx/FAGZFd4nTvZLe5ZnKyWeCwP5Jyqhyss5G2ipNVdQgZhw) | `6bbe310439b5…` | `rL_Van8GlmW_gZXEjkwFQOu4sSJLb87dYmjvluJi8tY` | LOSS · -8.00 · reveal_ok=true | `4wUqzKP-Ao1NPWQhMezt6LvUe2abHRBNee5WL018OYA` | cli |
| 74 | 2026-11-10 08:37 | up/0.85/choppy · bracketed_range | [`Ct3bbKhs6S…`](https://suiscan.xyz/testnet/tx/Ct3bbKhs6SQreysqCAnMCDaVEhmC9tzBPmqaCyRnj11e) | `e50b62585b28…` | `1ntluqZ6s_gNwUa2lMjE4C6Kaw96zYKCeYeqWGMEaNM` | WIN · +4.91 · reveal_ok=true | `P9JSMBm9rroD6I8Obywu4zm0Qv22jY9EkvfqRRT8c84` | cli |
| 75 | 2026-11-10 08:58 | down/0.35/calm · bracketed_range | [`CDZiS2tdsq…`](https://suiscan.xyz/testnet/tx/CDZiS2tdsqiaw4omCRZ4mebmfHbS8VW6ATk8utJLcrAb) | `abe8c083537c…` | `X0EKAujJOQHchLtJ8OwVfODbET25JmOyWbwA-Rrn8WM` | WIN · +8.17 · reveal_ok=true | `efmxqlaI_sg1O0nYDouGNRNxo04ns7r1LJwwNPovKeU` | cli |
| 76 | 2026-11-10 09:18 | up/0.85/choppy · bracketed_range | [`GmbxCKMwtm…`](https://suiscan.xyz/testnet/tx/GmbxCKMwtm8BeocA446Mnur5s6Tq2GEYkmrfd8L9Lh2Y) | `cb89282503e0…` | `8etbRzUDEFm9HzzxolwHwZ0Mn2PKIYbg492F9d4jOew` | LOSS · -3.00 · reveal_ok=true | `ew2iTyAXGxEYF2lVwZV1k2nSx0369tZe8CzsNpLJu_k` | cli |
| 77 | 2026-11-10 10:00 | up/0.85/choppy · directional | [`Dvnu2e8LzZ…`](https://suiscan.xyz/testnet/tx/Dvnu2e8LzZBx3ze7ejp5si2JXWVGnBwhixkH3CAAUpLr) | `53b95155b2bf…` | `UV0FufT4nd15R9TNyHxAnO5raZkMaSY6DNhXBi0JZ38` | LOSS · -8.00 · reveal_ok=true | `T-reZQmuQ7sacOeuSh7rpugoU5G-LVFAE3Aymti_IYw` | cli |
| 78 | 2026-11-10 10:21 | down/0.30/choppy · bracketed_range | [`3PyGLcRnzm…`](https://suiscan.xyz/testnet/tx/3PyGLcRnzmkHspYaWvUMFxXBZtQve3kzGHmXotM93pjH) | `6a8523cbc543…` | `zsWZBM6R7yIPnp7Ox-_LqV9a6-0tE3A_VtnijaNSuss` | WIN · +2.93 · reveal_ok=true | `Pdr6EPpnVgOeQ_SL1ZZHtke0KmU_CxL1h--XhJDM2rg` | cli |
| 79 | 2026-11-10 11:23 | up/0.85/choppy · directional | [`FXhX9YtZGS…`](https://suiscan.xyz/testnet/tx/FXhX9YtZGSAWCpccwPpFuE4jdUodeUQK3xUwSad7rzjn) | `35037f03067e…` | `Ti6QM1IEMvjZDXXIFHPcldMXA4HloIstXWEeDVfAyYA` | WIN · +2.67 · reveal_ok=true | `DH82XnpeldrVOCvrhKjGz-i6OwitesIiP96Be5MJNLw` | cli |
| 80 | 2026-11-10 11:43 | down/0.85/calm · bracketed_range | [`8xa5EA1rmY…`](https://suiscan.xyz/testnet/tx/8xa5EA1rmYexSJt8JGr9yrJtDFwWuveH3CYKiHaFxtHe) | `9f8e6d4a30ac…` | `MeHwysDx111J9cCwdqmfEpEP8lLUMh-gxHZOqM94o2Q` | WIN · +5.04 · reveal_ok=true | `IT4BNOMjQ3tZ8UKMI1Vhsu1iOKAZFVxNUwk-x5cupE0` | cli |

## 2c. Provenance — every commit counted by origin

| forecaster | namespace | CONVICTION by origin | commits on-chain | hidden | memories |
|---|---|---|---|---|---|
| demo trader | `helix-v1-4d922636976d` | cli 77 · browser 3 | 88 | 4 | 330 |
| agent momentum | `helix-v1-f86dd6bda0c6` | agent:momentum 41 | 42 | 1 | 154 |
| agent reversion | `helix-v1-b7f54e89048d` | agent:reversion 32 | 32 | 0 | 124 |
| agent surface | `helix-v1-1d2aef04ef74` | agent:surface 41 | 41 | 0 | 135 |
| agent crowd | `helix-v1-9d46530e40aa` | agent:crowd 42 | 42 | 0 | 156 |

## 2d. Proof-of-Forecast — Council, Passport, payments (live)

- **Ticker** (`GET /proof/ticker`, chain events): 256 commits by 15 committers · 256 settled · hidden 5
- **Council**: 4 agents · weights {"momentum":0.23829840000571728,"reversion":0.19689467390432835,"surface":0.32124841120593506,"crowd":0.24355851488401925} · 42 COUNCIL memories · allocator vetting decisions: 11
  - momentum `0x92608f0b7b1f5872fa0b3a314b7aba05f228e45b24e19d197914a2e2949f7d31` — 42 commits, 41 settled, 22 won, Brier 0.240
  - reversion `0xe89018db81101846e5526e56d7c758cf95d8e6099eb664f0386f9282097d5d58` — 32 commits, 32 settled, 12 won, Brier 0.290
  - surface `0x97dd8db5d9e2c5a88fd64ec36e6bcebecc97a561f265156100b54eed9be2fa3f` — 41 commits, 41 settled, 31 won, Brier 0.178
  - crowd `0x392a02dbb7829a518da3522feb621a9c2706f8010b0c4822aa29ed9a4df1a746` — 42 commits, 42 settled, 29 won, Brier 0.235
- **Passport** (`GET /passport/helix-v1-4d922636976d`, Ed25519-signed, key `18a0e77777aa256a62417fa8b6debb559aaa1af1b0754a5252897a46b6116a6f`): committed 88 · shown 84 · hidden 4 · badges Contrarian
- **Paid Credibility API** (`GET /api/v1`): 0.001 SUI (testnet) per call, treasury `0x29ca7dc45b6ef496e87e3daa317ac55aa66577fcc6c82323bd171f0f8dc4bd36` · paid calls 14 · latest [`8s22h1bois…`](https://suiscan.xyz/testnet/tx/8s22h1boisym63cqtpjp1ou9sKGtRkWfpf3yMfmm16KK), [`8goFm5VCi3…`](https://suiscan.xyz/testnet/tx/8goFm5VCi3ud9xwEq9rWsTiCza8GDZs5WQfNK4nMiWzP), [`8M6EfbpDTH…`](https://suiscan.xyz/testnet/tx/8M6EfbpDTHbR7rsceyvnbgYM3Y3uEhnk8Likjjsq4Xf9)

## 3. Memory visibly changes the product (L-01 vs L-02)

Same conviction `{"direction":70,"confidence":85,"horizonCode":1,"volView":70,"capital":5}` compiled against the live market for a fresh address vs. `0x16a384bb…`:

**Without history** (`0x00000000…`):
```json
{
  "order": "BTC above $74,356 at expiry",
  "structure": "directional",
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
  "order": "BTC above $74,356 at expiry",
  "structure": "directional",
  "memory": {
    "n": 44,
    "message": "Learned from 44 settled convictions in up/high/choppy.",
    "commit": 5,
    "suggested_commit": 1.5,
    "structure_suggestion": null,
    "lesson_text": "up/high/choppy: Won 15/44 here; stated confidence runs ~53 points hot. Size down. The HELIX Council has been closer than you (Brier 0.21 vs 0.52).",
    "gap_you": 0.5251969696969696,
    "best_voice": "council",
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
      "hGpsvI5UdHD_lAuQ1ahRsBx0d3EYPf1M4BwjbuvVqSI",
      "8KHfTdQUClH-xaCY8sOtOE0-4YoJO0YG9JMCJCqHEOc",
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
      "AvBI1IDaMX0nELArAwuEjYc53hGt-EuHVIOI0VCUCsc",
      "SIxwa5ZDKcEIqyfvbUiGrvYcGvullAHmUE592XFF_HI",
      "cBPPZ31gOnhhmECntah4hfhfmCQGf1CuZu7YMirgSbk",
      "weCCTiT5p1MMPy6T4CpH1xDvxEebeLtR6Vx6EDtscaE",
      "LD9b4ryMTiOp1uZlUPhmpqa-WVKY2oIzQOVI9r8z2sY",
      "Ivx4lG6Eoxl11-2RFFGCciVwL_WQlbgyy8apbk5MbD8",
      "ojlDDeF-46MFQMHqB7dm0OzEIJXkyieInPExpFYQDLE",
      "0-DOr1e-B9t7entcZ3zJz_BP-Z-JHEzrLTPxGcEBNwk",
      "A49owUofMMHhUYYkWIZVSDUdyUNSuEywOzyJ97wKmrw",
      "WziNgS5EpBLUWpmZLA-MEEH00cqfLHxlxleMjDi3OvI",
      "cC0I95cyASc0q7eznE8c5ammFd5b5SCaRvCtvfAkaow",
      "PgGXzPmMpurxfMhtJr_8PvhYRZxr8UpQHl52gyCEzX8",
      "UL79K2AUTqO1sOl33N4Ed2CmeISUEGEq7xDVm0Z8L-w",
      "LU7PfE6F-mDU_P0RW1Bp_UU5Eq0vhGKXvWYpVy5rOZc",
      "pNqNOupjhvNc2ggiaAahrwF1Lcdnagi4oASRDMLywck",
      "FIQP4XUb_yZGABCVt57SCHxPTZoAx4hCGvq4_UQLjzs",
      "XWlngqFN-OGjvytOuiZCRzT7s2bdf7hwNClF5yqxH5Q",
      "BqzR3CEEiXvs38rgP0UftRGsh1fVOcnlKzw6_opfTg0",
      "MUO4-N7lX4xAqX5AKm9ZONuLXamJHmkhNeAzA0gNVUo",
      "feMBYLARTmL4mPmHOUrJ8AQqxeZawc5Ygojkiio-meg",
      "MnnRRhT6ca2L7HwKlrg0dOCRRbulOr6f6xsUDgyNz2Y",
      "r_hbl-8JiRRctLS5n74UHoGssCMozFZ0FO2Z7TGxZ6k",
      "0pyW0GtlgVhXafLPex_F6kCnbqB2V-YUXW4lcKog0Ho",
      "_6H5Ne6CXb9ZSD-QhhuhuL2W539aWa8CdzGGBwJpKT4",
      "1gZDc4DukXXW7FsYemK06cdYD9dsF2lOiBZH22LAKZM",
      "A7zbJ-lKcx5y-VYRhDVpBYqGtD5ii1D5mYcPH40w-ck",
      "oYg50EtneVYso-xP5aSzXxfjMRPdm-oihJ4IpsAaLbw",
      "bXleufd3ZLc_SmXhNDRBPOunVvsCuMgPKafkV9wtS7E",
      "XgxOuMd16gdeFsMqnqvKGVICv0P6viUUv3pn8oYyxTY",
      "dyI7gpVVvRPBv-S9pTaZDI-ss3OsXlQIQCTx9ir1qwM",
      "C3haKP6sBf3xvRsKxMuXIAWeN5HBef5d0VW4USEoNsI",
      "ngeca2g-XgK2DaI8nC33UWPeVpttudac2nMp8abpsJg",
      "0Q-2xdt9BURZJX-dAjSfsdRqDkdbQUn5i1uKHPNkHUY",
      "67LcabJWNkY5KNsbl0JhjEYn2yis9ejBRmKIUl2IU-A",
      "D5Dso0upFbasOHTIMwbqlqnIdalFoDm_MZV1FJ5gw18",
      "ky_B4LyjgnjjhVq8E_sZPi_hZfBoAGMDh0miWCKLnL0",
      "DOPPhWri1Z2AwU6WviC09lXrH6Hp7SpQ5fI71m7Wzg8",
      "fSL8XKGqPRRHh12dDCNRNNifzscROic8SSq_cZryT4o",
      "NCeB8Q4pvmKfRi5RPbCseVWKm_jcNja8kq6ET8VmrHk",
      "tIWHjvMWapzFuihL93tYrosGwfnjA3XRrU_mAwjjBkM",
      "OfvtBoZozw2t2l3WFuAM_OrN5Fs6Vk3yKrqMNL1SeJY",
      "NsqRyfk-sAW3OGd0QqQxaWbDNCspV2aseQ3DSoHj62Q",
      "7VYPM6fyw9aD0QAFaYey1Qyl9XLJhA0M2bGlg0XCoXo",
      "cgLVRHI0mryYX8W3M2xUYwVWPD62F3rM1xESCBghTz4",
      "rddh-CLrtRt72QIWDtrOV-fuNUyZDAUBcu3HGPoqWTQ",
      "9OVZka8mxetRgF_gnzymynpDlvMUsbyiPEoSAKDyKSQ",
      "bO2Ev5gDRFS2kIA6-wqOfGgGb5A3zs5dg0-XouFFmco",
      "rJ5Zb6UKFWXnTyBtqvEHSSMw9-ohUmzHZRxyex-jpMQ",
      "8Gvl1bgGmCxCmfQR83g-DV31851FsChwgGnEW_g45Kg",
      "H16I4MUABHFoRd9AaBNs026jcvqySP9VBjCWxVAk-Gw",
      "RlxOjwLjxKAVaOtEDUy4gTmCl8kWvfjrtpghgG_xujU",
      "aLH8wT2XNxp8Hcghg3WRXMRySlHBZvvQCkL1RXNqWfI",
      "5P5PCFLbEWMIGU80oRM3CaAgrnKNIPIhEjRgKuRtQVk",
      "GCBeHztCMmooXFUctmQ2g4T2UX1TkyWxNkW_PvqEERU",
      "wbGARTGpIzXAcMxIbVCDD5k30bLHqGgOD08OlCD9Xdg",
      "dhWo9MDYuwmGDgaG1HRdyjzcm7q20b0SQ6tFD45QmmE",
      "aiQPfAp1ESftr1eqx1kWQuF8W2WmQIwjnMVV_h_9n-0",
      "mPZ71RIFo-ftX6adWaPSxPyXqRbdllH6-ZlFbrj1BKI",
      "fwaev7z8q5uHf4LiLvv4ljKFuu_npNTSLWroVP4Mg2I",
      "SB8EET5CP3SdQOJGE6-q_WiMXP9k6djel56KFM5DX5Q",
      "oFueYtPVlni9FW501FQr9HM-tIXZWRhNRKSfjC3eaV8",
      "__wfo3tPars0Nt6-o1_EqyH08HzkUUf4vn1DEo8CBEk",
      "5DueSogNUkuvLIs47Q3CKfUWCdp0AknbhprVW-z6wMY",
      "rC2XMNAI71vJgzeZCJWZn-si9z5lirT9NNwy_5BGGhc",
      "L4yWxds0BJQtEwP7JWs8ruQogXO6BR_xXsbHNCEpP6g",
      "i375K5lzSdC-341tnOoEOt1KuvG6w45q6kgUhxIn9YQ",
      "hqrCgKxk67-KWEbh4bN7T2uMw85FcCbEr8-kMxdVRwk",
      "8yn-QIjZSCxTBjTxj5X3q-NwkVsLIbf8yeEOM3Mbt50",
      "PBs9YrVxi9QbsnL79s-F39yAnuaRODwzPUmfiS7FrCw",
      "rL_Van8GlmW_gZXEjkwFQOu4sSJLb87dYmjvluJi8tY",
      "4wUqzKP-Ao1NPWQhMezt6LvUe2abHRBNee5WL018OYA",
      "1ntluqZ6s_gNwUa2lMjE4C6Kaw96zYKCeYeqWGMEaNM",
      "P9JSMBm9rroD6I8Obywu4zm0Qv22jY9EkvfqRRT8c84",
      "8etbRzUDEFm9HzzxolwHwZ0Mn2PKIYbg492F9d4jOew",
      "ew2iTyAXGxEYF2lVwZV1k2nSx0369tZe8CzsNpLJu_k",
      "UV0FufT4nd15R9TNyHxAnO5raZkMaSY6DNhXBi0JZ38",
      "T-reZQmuQ7sacOeuSh7rpugoU5G-LVFAE3Aymti_IYw",
      "Ti6QM1IEMvjZDXXIFHPcldMXA4HloIstXWEeDVfAyYA",
      "DH82XnpeldrVOCvrhKjGz-i6OwitesIiP96Be5MJNLw",
      "lilC-rY2TmnNMbrmGaXVrZVIUbrw9ak9KO38xjpe2g4",
      "iD9sY21OI2V9Y9_7_l9D2IivGrJDkIEQSqdafWH7nEM"
    ]
  },
  "guardian_memory": "Memory: last 44 high-confidence bullish calls in choppy BTC — you won 15; your confidence runs ~53 points hot here. The HELIX Council has been most accurate (Brier 0.21)."
}
```

## 4. Calibration for `helix-v1-4d922636976d`

```json
{
  "overall": {
    "n": 80,
    "wins": 31,
    "realized": 0.3875,
    "posterior": 0.39285714285714285,
    "mean_p_you": 0.8180500000000007,
    "gap_you": 0.42519285714285787,
    "brier": {
      "you": 0.44991100000000006,
      "market": 0.24008105000000005,
      "helix": 0.24195102499999996,
      "crowd": 0.3378583333333333,
      "council": 0.2529826818181818
    },
    "n_crowd": 12,
    "n_council": 44,
    "pnl": -120.85
  },
  "buckets": [
    {
      "bucket": "down/high/calm",
      "n": 5,
      "wins": 4,
      "realized": 0.8,
      "posterior": 0.6666666666666666,
      "mean_p_you": 0.883,
      "gap_you": 0.21633333333333338,
      "brier": {
        "you": 0.16688899999999998,
        "market": 0.39511460000000004,
        "helix": 0.4100106,
        "crowd": null,
        "council": 0.286189
      },
      "n_crowd": 0,
      "n_council": 2,
      "pnl": 6.73
    },
    {
      "bucket": "down/low/calm",
      "n": 7,
      "wins": 3,
      "realized": 0.42857142857142855,
      "posterior": 0.45454545454545453,
      "mean_p_you": 0.657,
      "gap_you": 0.2024545454545455,
      "brier": {
        "you": 0.29707757142857144,
        "market": 0.26491328571428574,
        "helix": 0.24757942857142856,
        "crowd": null,
        "council": 0.30812500000000004
      },
      "n_crowd": 0,
      "n_council": 2,
      "pnl": -3.4000000000000004
    },
    {
      "bucket": "up/high/choppy",
      "n": 44,
      "wins": 15,
      "realized": 0.3409090909090909,
      "posterior": 0.3541666666666667,
      "mean_p_you": 0.8793636363636363,
      "gap_you": 0.5251969696969696,
      "brier": {
        "you": 0.5174187727272727,
        "market": 0.21796720454545448,
        "helix": 0.22270718181818186,
        "crowd": 0.370665,
        "council": 0.21307849999999995
      },
      "n_crowd": 10,
      "n_council": 24,
      "pnl": -96.08999999999999
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
      "n": 5,
      "wins": 0,
      "realized": 0,
      "posterior": 0.2222222222222222,
      "mean_p_you": 0.883,
      "gap_you": 0.6607777777777778,
      "brier": {
        "you": 0.779689,
        "market": 0.10811000000000001,
        "helix": 0.10326679999999999,
        "crowd": null,
        "council": 0.08343266666666667
      },
      "n_crowd": 0,
      "n_council": 3,
      "pnl": -24
    },
    {
      "bucket": "up/low/calm",
      "n": 4,
      "wins": 3,
      "realized": 0.75,
      "posterior": 0.625,
      "mean_p_you": 0.657,
      "gap_you": 0.03200000000000003,
      "brier": {
        "you": 0.196149,
        "market": 0.39308925000000006,
        "helix": 0.38275425,
        "crowd": null,
        "council": 0.5627425
      },
      "n_crowd": 0,
      "n_council": 2,
      "pnl": 14.69
    },
    {
      "bucket": "down/high/choppy",
      "n": 5,
      "wins": 1,
      "realized": 0.2,
      "posterior": 0.3333333333333333,
      "mean_p_you": 0.86,
      "gap_you": 0.5266666666666666,
      "brier": {
        "you": 0.5955999999999999,
        "market": 0.16889399999999996,
        "helix": 0.177918,
        "crowd": null,
        "council": 0.18645525000000002
      },
      "n_crowd": 0,
      "n_council": 4,
      "pnl": -8.25
    },
    {
      "bucket": "down/low/choppy",
      "n": 5,
      "wins": 2,
      "realized": 0.4,
      "posterior": 0.4444444444444444,
      "mean_p_you": 0.635,
      "gap_you": 0.1905555555555556,
      "brier": {
        "you": 0.29522499999999996,
        "market": 0.2825772,
        "helix": 0.2736922,
        "crowd": 0.29702500000000004,
        "council": 0.401115
      },
      "n_crowd": 1,
      "n_council": 4,
      "pnl": -15.149999999999999
    },
    {
      "bucket": "up/low/choppy",
      "n": 4,
      "wins": 2,
      "realized": 0.5,
      "posterior": 0.5,
      "mean_p_you": 0.635,
      "gap_you": 0.135,
      "brier": {
        "you": 0.268225,
        "market": 0.29167425,
        "helix": 0.3048635,
        "crowd": null,
        "council": 0.367554
      },
      "n_crowd": 0,
      "n_council": 3,
      "pnl": 0.8000000000000007
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
      "n": 21,
      "stated": 0.6486666666666666,
      "realized": 0.5238095238095238
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
      "n": 59,
      "stated": 0.878338983050848,
      "realized": 0.3389830508474576
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
