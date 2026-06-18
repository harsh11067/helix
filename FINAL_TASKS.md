# HELIX — Final Tasks to Win (Master Sequence)

> Everything remaining, ordered by leverage. Each task has a CLI prompt and a binary acceptance test. Do them in order. Stop building when the demo is recorded — not before, not after.

State as of now (verified): live frontend at https://helix-app-fovn.onrender.com, live compiler at https://helix-compiler.onrender.com (real SVI), published package 0xdc4b27...d2b3, real browser mint confirmed, tests 57/20/7 green, repo public at github.com/harsh11067/helix.

---

## Task 1 — Verify the safety net (5 min, do first)

The work's authenticity lives in git now (repo is public). Confirm a fresh clone actually builds — don't assume.

CLI prompt:
> Clone github.com/harsh11067/helix into /tmp/helix-verify, run `cd contracts && sui move build` and `sui move test`, and `cd tee && node --test test/*.test.ts`. Confirm the Move package and wired tistu/js/app.js are present and build/test green from a clean clone. Report what's missing if anything.

Acceptance: fresh clone builds, 57 Move tests pass, frontend files present.

---

## Task 2 — zkLogin onboarding (the one feature — see feature.md)

CLI prompt:
> Add zkLogin "Continue with Google" to tistu as a third option in the wallet picker, additive to the existing Wallet Standard connect. Use @mysten/sui/zklogin: ephemeral keypair + nonce, Google OAuth redirect, fetch ZK proof from Mysten's testnet prover, assemble the zkLogin signature, derive and display the Sui address. Downstream compile/PTB/mint must work unchanged with the zkLogin signer. Use a deterministic demo salt, labeled as such. If the prover flow can't land in ~90 min, do NOT ship a dead button — instead remove the zkLogin badge from the landing page and report the fallback. Keep all tests green. Report the derived address and, once funded, a real zkLogin-signed mint digest.

Acceptance: Google sign-in -> derived address -> real predict::mint signed via zkLogin, on Suiscan. OR badge cleanly removed. No theater.

---

## Task 3 — The lineage demo wiring (30 min — answers "where do I show the tree")

You asked where breeding/tree shows and how to demo it. The answer, locked:

- The **Conviction Canvas** is for FRESH convictions only. Don't put breeding there — it would muddy its identity ("express a belief").
- **Breeding is an action on an existing owned strategy**, surfaced on the **Strategy Detail** page: a "Breed with..." button that picks a second strategy you own, mints a child crossing only the BEHAVIORAL genes (entry/exit, hedge thresholds, kill-switch — never structure), via the real on-chain breeding call you already have.
- The **Lineage page** renders the tree from real `StrategyCreated` + `BreedingExecuted` events: parent nodes, child node, edges between them. A static 3-node tree (two parents, one child) is enough — no time-machine, no filters.

CLI prompt:
> On the Strategy Detail page, wire a "Breed with..." action: select a second owned StrategyObject, call the existing on-chain breeding entry (behavioral-gene crossover only), and on success route to the Lineage page. On the Lineage page, render nodes from real StrategyCreated + BreedingExecuted events with parent->child edges, in the established design language. Keep it to a clean static tree. No new Move code. Report a real breeding tx digest and confirm the child appears as a node linked to both parents.

Acceptance: a real on-chain breeding tx; the child shows in Lineage linked to two parents. (If breeding already mints cleanly, just ensure the Lineage tree renders the relationship — that's the demoable artifact.)

---

## Task 4 — Honesty + claim sweep (15 min, before recording)

CLI prompt:
> Grep all user-facing frontend strings. Ensure ZERO occurrences of: "iron condor", "straddle", "butterfly", "Greeks", "Delta/Gamma/Vega netting", and any "Nautilus-verified"/"TEE-verified" trust badge on the compiled structure. Replace with: directional bet / range bet / bracketed range / portfolio risk axes / "attestation: dev-signed". Confirm the zkLogin and Seal badges on the landing page are only present if those features actually shipped (per Tasks 2 and optional Seal). Report the grep results.

Acceptance: no overclaiming strings in the UI; every stack badge maps to something real.

---

## Task 5 — Record the demo (see video.md) — HIGHEST non-code leverage

Not a CLI task. You do this:
1. Warm the Render services (load + compile a few minutes before).
2. Confirm wallet has DUSDC + SUI gas.
3. Record the B-roll segments per video.md shot list.
4. Generate the 11Labs voiceover from the script in video.md.
5. Assemble, caption, end-card, export under 5 min.
6. Record the 20-second backup mint+Suiscan clip.

Acceptance: a 3-4 min video with the live mint + Suiscan beat, uploaded unlisted, link ready.

---

## Task 6 — Optional Seal feature (only if Task 5 done with time left — see feature.md)

CLI prompt:
> Add a Seal-encrypted private "thesis" note to strategy creation: encrypt client-side with @mysten/seal keyed to the owner, store ciphertext on the real Walrus client, show decrypted to owner and locked to non-owners on Strategy Detail. If it doesn't land cleanly, remove the Seal badge. Acceptance: owner decrypts, a different address cannot.

---

## Task 7 — Submission

Submit to TWO tracks (not more — focus wins):
1. **Primary: Agentic Web -> Sub-track 3 (Intent Engine).** Your loop matches its must-haves verbatim; zkLogin reinforces the Sub-track 2 nod.
2. **Secondary: DeepBook Predict.** Genuine predict::mint, published package, end-to-end.

Submission checklist:
- [ ] README leads with: one-liner, live URL, package ID, Suiscan mint link, demo video link.
- [ ] Deepsurge submission: both tracks, all fields, video, live URL, team info.
- [ ] Pitch deck (10 slides) with a STATIC Suiscan-proof slide (insurance against live demo failure).
- [ ] Backup video clip attached/linked.
- [ ] Confirm submission received.

---

## The cut list (do NOT build — discipline)

Breeding wizard UI, conviction-tree builder UI, AI advisor, live-Greeks WebSocket, D4PG RL hedging, Postgres. All roadmap. The 2025 winners prove focused depth beats feature sprawl.

---

## Render vs Vercel (your question, answered)

Render is fine — it's the same category as Railway (push-to-deploy PaaS). Keep it. The only real risk is the free-tier cold start (~50s after 15 min idle). Mitigations: warm it before recording; for a judge-clickable live URL, the cheapest paid tier removes cold starts entirely (worth a few dollars during judging week). Do NOT migrate to Vercel now — motion without benefit.

---

## The one sentence

> You are past the build bar. From here, winning is: make the claims true (zkLogin), prove it on video (the Suiscan beat), submit to the two tracks you genuinely fit, and cut everything else. Build less, prove more.
