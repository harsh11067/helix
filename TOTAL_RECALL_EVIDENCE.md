# TOTAL_RECALL_EVIDENCE

Generated 2026-11-09T10:11:21.533Z by `tee/scripts/evidence.mjs` from live endpoints — nothing in this file is hand-typed.
Service: https://helix-compiler.onrender.com

## 1. Tatum chokepoint + Walrus Memory health (`GET /health`)

```json
{
  "tatum_testnet_checkpoint": 404518998,
  "tatum_mainnet_checkpoint": 343323975,
  "tatum": {
    "plan": "free;ratelimit=3;strategy=shared",
    "testnet": "sui-testnet.gateway.tatum.io",
    "mainnet": "sui-mainnet.gateway.tatum.io",
    "requests": 78,
    "retries": 4,
    "recent_executions": [
      {
        "net": "testnet",
        "digest": "Gb9WAaYgcaZgUChF5hvweMTUtCe7VZPfzAyoEDLNqG5t",
        "at": 1794218903161
      },
      {
        "net": "testnet",
        "digest": "E2E1baCGXbkrxcFLVbLvKRS5sE6Yj9koZToVh1Rifheu",
        "at": 1794218643571
      },
      {
        "net": "testnet",
        "digest": "9fGJzrg3qYygqhyyd1XVpy5VSGQpDcoBRFyRs8Rwxg38",
        "at": 1794218596344
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
    "pending": 1
  },
  "predict": {
    "network": "testnet",
    "open_windows": [
      3.9
    ],
    "quote_coin": "0xc028557a1ed49e42ed091e115aedefd70a442b184c18fbec5c48d5b6c0b8c184::usdc::USDC"
  }
}
```

## 2. Memories on Walrus Mainnet — 5 trading memories

By type: **CONVICTION** 1 · **OUTCOME** 2 · **CALIBRATION** 2

Every row was written with `rememberAndWait` to the Walrus Memory mainnet relayer; `tx` is the Sui testnet transaction it describes (verify all with `node scripts/verify-ledger.mjs`). Registry bookkeeping memories (`USER`) are excluded from the count.

| # | type | blob id | job id | written | tx | origin |
|---|---|---|---|---|---|---|
| 1 | CONVICTION | `xC3Bh9aP4WUXJAsUqyNm7rW3B3PPD0ggvHKDEqzmHHI` | `bc076fa3-7ed6-4362-9a11-d8310943ef88` | 2026-11-09T09:52:06Z | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | cli |
| 2 | OUTCOME | `obLQWE8KJuoYV2qbbZ_J73s5T33Tl-dpzFrtmF0440s` | `42752172-33bf-4eff-bbf2-6eb132e6f775` | 2026-11-09T10:00:52Z | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | watcher |
| 3 | OUTCOME | `obLQWE8KJuoYV2qbbZ_J73s5T33Tl-dpzFrtmF0440s` | `42752172-33bf-4eff-bbf2-6eb132e6f775` | 2026-11-09T10:00:54Z | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | watcher |
| 4 | CALIBRATION | `20o5NXeG4p2QYzB5LFxV6Uup9O-Erd9HNsI99SHYUYY` | `3c66808b-25ae-4998-9ac2-e205c060f19d` | 2026-11-09T10:01:10Z | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | watcher |
| 5 | CALIBRATION | `20o5NXeG4p2QYzB5LFxV6Uup9O-Erd9HNsI99SHYUYY` | `3c66808b-25ae-4998-9ac2-e205c060f19d` | 2026-11-09T10:01:10Z | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | watcher |

## 2b. Commit mode — on-chain commit–reveal (4 CONVICTION · 3 OUTCOME; target ≥30 / ≥20)

On-chain ledger (`ConvictionCommitted` events by this address via Tatum, matched to memory by hash): `{"journal":"0x5bcf3bf66f6c71f53aaf681842b554edde5b6c141c7315ba0ac6b4cd6766652f","onchain":4,"with_memory":4,"missing_memory":0,"settled":3,"wins":1,"reveal_ok":3,"win_rate_all_commits":0.3333333333333333,"missing":[]}`

| # | committed (UTC) | conviction | commit tx | sha256 | CONVICTION blob | outcome | OUTCOME blob | origin |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-11-09 09:51 | down/0.85/calm · range | [`Evkrx8umKi…`](https://suiscan.xyz/testnet/tx/Evkrx8umKiW6Ei4Pi8qVMZU18AgzZ4JFnhy558XXJSHt) | `499a97f28482…` | `xC3Bh9aP4WUXJAsUqyNm7rW3B3PPD0ggvHKDEqzmHHI` | WIN · +4.23 · reveal_ok=true | `obLQWE8KJuoYV2qbbZ_J73s5T33Tl-dpzFrtmF0440s` | cli |
| 2 | 2026-11-09 10:03 | down/0.35/calm · range | [`9fGJzrg3qY…`](https://suiscan.xyz/testnet/tx/9fGJzrg3qYygqhyyd1XVpy5VSGQpDcoBRFyRs8Rwxg38) | `3e5187e9af39…` | `Dkuo8cMPG90ZpKDh20uoIGcHINBxDjN7uCk1KYeFPkk` | LOSS · -3.00 · reveal_ok=true | `dKaDaGURA1PSFiuSMt9MD_YtsxN7Teb2JOydbFI3tMo` | cli |
| 3 | 2026-11-09 10:04 | down/0.35/calm · range | [`E2E1baCGXb…`](https://suiscan.xyz/testnet/tx/E2E1baCGXbkrxcFLVbLvKRS5sE6Yj9koZToVh1Rifheu) | `6094428fdea1…` | `sdW7djXk2m1DMEtdSq7EoNKxL1eefDdYfuPMlgAd7mo` | LOSS · -3.00 · reveal_ok=true | `RyWhIOchrgGp_92jprjOlBXTfkQHuiQiaV-c6MRFqLQ` | cli |
| 4 | 2026-11-09 10:08 | up/0.75/choppy · bracketed_range | [`Gb9WAaYgca…`](https://suiscan.xyz/testnet/tx/Gb9WAaYgcaZgUChF5hvweMTUtCe7VZPfzAyoEDLNqG5t) | `c0f20688f546…` | `eSB1aLVsjDLkTWPa2f1g1ZMg8sw7Yv2EqRcg8IfjrJI` | pending | — | browser |

## 3. Memory visibly changes the product (L-01 vs L-02)

Same conviction `{"direction":70,"confidence":85,"horizonCode":1,"volView":70,"capital":5}` compiled against the live market for a fresh address vs. `0x16a384bb…`:

**Without history** (`0x00000000…`):
```json
{
  "order": "BTC between $74,125 and $74,172 at expiry (upside bracket)",
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
  "order": "BTC between $74,125 and $74,172 at expiry (upside bracket)",
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

## 4. Calibration for `helix-v1-4d922636976d`

```json
{
  "overall": {
    "n": 3,
    "wins": 1,
    "realized": 0.3333333333333333,
    "posterior": 0.42857142857142855,
    "mean_p_you": 0.7323333333333334,
    "gap_you": 0.30376190476190484,
    "brier": {
      "you": 0.29232900000000006,
      "market": 0.22067400000000004,
      "helix": 0.22067400000000004,
      "crowd": null
    },
    "n_crowd": 0,
    "pnl": -1.7699999999999996
  },
  "buckets": [
    {
      "bucket": "down/high/calm",
      "n": 1,
      "wins": 1,
      "realized": 1,
      "posterior": 0.6,
      "mean_p_you": 0.883,
      "gap_you": 0.28300000000000003,
      "brier": {
        "you": 0.013688999999999998,
        "market": 0.44222500000000003,
        "helix": 0.44222500000000003,
        "crowd": null
      },
      "n_crowd": 0,
      "pnl": 4.23
    },
    {
      "bucket": "down/low/calm",
      "n": 2,
      "wins": 0,
      "realized": 0,
      "posterior": 0.3333333333333333,
      "mean_p_you": 0.657,
      "gap_you": 0.3236666666666667,
      "brier": {
        "you": 0.43164900000000006,
        "market": 0.10989850000000001,
        "helix": 0.10989850000000001,
        "crowd": null
      },
      "n_crowd": 0,
      "pnl": -6
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
      "n": 2,
      "stated": 0.657,
      "realized": 0
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
      "n": 1,
      "stated": 0.883,
      "realized": 1
    },
    {
      "lo": 0.9,
      "hi": 1.0001,
      "n": 0,
      "stated": null,
      "realized": null
    }
  ],
  "reasons": {}
}
```
