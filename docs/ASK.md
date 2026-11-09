# Ask your memory (P6): how it works and what Walrus `ask` costs

`POST /ask { address | ns, question }` answers a question from one forecaster's Walrus Memory and lists the memories it used, each with its blob ID. Flag: `FEATURE_ASK=1`.

## Plan A: Walrus Memory's own `ask` (shipped, primary)

Researched in [MystenLabs/MemWal](https://github.com/MystenLabs/MemWal) at `60b0dcb` (2026-11-09).

| Question | Answer | Source |
|---|---|---|
| Route | `POST {relayer}/api/ask`, body `{ question, limit, namespace }` (optional `scoring_weights`). Response `{ answer, memories_used: <count>, memories: [{ blob_id, text, distance }] }` | `packages/python-sdk-memwal/memwal/client.py` `ask()`; `services/server/src/routes/admin.rs` `ask` |
| In the JS SDK? | No. Only the Python SDK has `ask()`. The JS SDK (`@mysten-incubation/memwal` 0.1.13) signs every relayer call through one generic `signedRequest(method, path, body)`. HELIX calls `/api/ask` through that same method with its existing client, so no Python sidecar is needed | `tee/src/ask/walrus.ts` |
| Auth | Our Ed25519 **delegate key** (`MEMWAL_PRIVATE_KEY`, account `MEMWAL_ACCOUNT_ID`). Headers `x-public-key`, `x-signature`, `x-timestamp`, `x-nonce`, `x-account-id` over `"{ts}.{method}.{path}.{sha256(body)}.{nonce}.{account_id}"`. The nonce is single-use (Redis, 10 min). Plus `x-seal-session`: a 5-minute SEAL session key, because the relayer must decrypt the memories | SDK `signedRequest`; server `auth.rs` |
| What the relayer does | Embeds the question, vector-searches the namespace (`limit` default 5, capped at 100; HELIX sends 6), downloads the blobs from Walrus, SEAL-decrypts them, then calls an LLM with the memories as separate untrusted context. The system prompt says: answer from the memories, or say honestly that they don't cover the question | `admin.rs` `ask`; `services/server/src/services/prompts/ask.txt` |
| Model | `openai/gpt-4o-mini`, called on an OpenAI-compatible endpoint (OpenRouter) with the **relayer operator's** API key (`openai_api_key` in the relayer config) | `admin.rs` `call_ask_llm` |
| Who pays | **The relayer operator** (the hosted relayer at `relayer.memory.walrus.xyz`) pays for embedding and generation. HELIX pays nothing per call: there's no SUI, WAL or storage, because it's a read | same |
| Limits | Rate limits are counted in weighted requests. `ask` weighs 2 (`recall` 1, `remember` 5, `analyze` 10). Three layers: **30/min per delegate key**, **60/min per account**, **500/hour per account**. These budgets are **shared with every HELIX memory write and recall**, because one delegate key serves the whole app | `services/server/src/rate_limit.rs` |
| Privacy | The relayer sees the decrypted memories and sends them to the LLM provider. That matches the existing "relayer sees plaintext" limit in the README. HELIX memories are scores and convictions, not personal data | |
| Measured | Demo trader, "When am I most overconfident?": 5.3 to 5.8 s, 6 memories cited (LESSON records for `up/high/choppy`) | live, 2026-11-09 |

### HELIX's guards around it (`tee/src/ask/walrus.ts`)

- **Budget:** at most `ASK_WALRUS_PER_HOUR` (default 30) Walrus asks per hour, so asking can't starve memory writes. After any relayer error, HELIX backs off for 5 minutes. `ASK_WALRUS=0` turns Plan A off.
- **Question shaping:** HELIX can't change the relayer's system prompt, so the question carries the instruction: answer in at most 3 sentences, only from the retrieved memories, quote numbers exactly, and say "I don't have memories about that yet." otherwise.
- **Number check:** every number in the answer must appear in the cited memories or the question (rounding is allowed, and so is 0.42 ↔ 42%). If one doesn't, HELIX does not show the Walrus answer. It answers from stats instead and says which number failed (`unverified_numbers`).
- **Cross-check:** a Walrus answer always carries the deterministic stats answer as `check`, when a template applies. The panel shows it as "checked against your stats".
- **Rate limit:** `POST /ask` allows `ASK_PER_MIN` (default 10) questions per minute per forecaster and 120 per minute in total. Past that it returns a polite 429 with `retry-after`.

## Plan B: answered from your stats (always built; the fallback)

`tee/src/ask/templates.ts` has 13 deterministic templates. Free text maps to the nearest template by keyword, and the panel labels these answers "from your stats":

overconfidence by setup · best setup · worst setup · which voice to trust (choppy / calm / overall) · calibration change over the last 7 days vs before · track record · beating the market · latest lessons · hidden commits (on-chain ledger) · most reliable Council agent · last 5 calls · confidence bands · ranges vs directional.

- Every number comes from the existing calibration math (`settledRows`, `bucketStats`, Beta(2,2) posterior, Brier per voice) over the forecaster's own records, and carries its n. Voices need n ≥ 3 to be ranked. Below n = 3 the answer says it's noisy.
- **Grounding rule:** every answer cites the CONVICTION / OUTCOME / CALIBRATION / LESSON records its numbers came from (`memories_used`, newest first, up to 8, with `memories_total`). If no memories can be cited, the answer is exactly "I don't have memories about that yet." The same goes for unknown questions and for missing sources (for example, the commit ledger can't be read). A question about an asset with no records never borrows BTC numbers.

## When each mode answers (`mode: 'auto'`, the default)

1. If Walrus ask is available, it answers. If its answer cites memories and every number checks out, the response is `mode: 'walrus-ask'`, with the stats answer attached as `check`.
2. Otherwise the stats template answers (`mode: 'stats'`, with a `note` saying why). That happens when Walrus ask is over budget, errors, cites nothing, says it has no memories, or quotes a number that isn't in the cited memories.
3. If neither can cite a memory, the reply is "I don't have memories about that yet." with an empty `memories_used`.

`mode: 'stats'` skips Walrus entirely.

## UI

The header button "Ask your memory" (`tistu/js/ask-button.js`) appears only when the server has the flag on. The panel itself (`tistu/js/ask.js`) is loaded with a dynamic `import()` on the first click. It offers suggested-question chips, a mode badge ("Walrus ask" / "from your stats"), and memory chips that link to `https://walruscan.com/mainnet/blob/<id>`. It works in Judge Mode without a wallet: it asks about the viewed address, or offers the demo trader.
