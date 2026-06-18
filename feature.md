# HELIX — Final Features to Win

> Two features, chosen for maximum score-per-hour. Each removes a credibility gap AND adds genuine capability. Nothing here is decorative. Build Feature 1; Feature 2 only if time remains after recording the demo.

---

## Feature 1 — zkLogin onboarding (HIGH priority, build this)

### Why this one, specifically

1. **It converts a claim you're already making from false to true.** The landing page lists `zkLogin` in the Sui-stack badges. Right now that's unbacked — a judge who connects with a normal wallet and greps the code finds no zkLogin. Building it removes that landmine.
2. **It directly serves the Agentic Web track.** zkLogin is explicitly named in Sub-track 2 (Autonomous Agent Wallet) and is a first-class Sui primitive. Using it genuinely signals ecosystem fluency.
3. **It is the literal embodiment of your thesis.** "Remove the knowledge wall" — a user signs in with Google and trades on-chain without ever seeing a seed phrase. The most on-message feature you could add.

### What it does
A "Continue with Google" path alongside the existing Wallet Standard connect. The user authenticates with OAuth; zkLogin derives a Sui address they control; they compile and mint exactly as with a browser wallet — no extension, no seed phrase.

### Build approach (scoped for hours, not days)
- Use Sui's official flow via `@mysten/sui/zklogin` (helpers are in the SDK you already load).
- Flow: generate ephemeral keypair + nonce -> redirect to Google OAuth -> receive JWT -> fetch ZK proof from Mysten's testnet prover -> assemble the zkLogin signature -> derive the address.
- Keep it additive: the wallet picker gets a third option, "Continue with Google." Everything downstream (compile, PTB, mint) is unchanged — it receives a zkLogin-derived signer instead of a wallet-standard signer.
- Salt: for a hackathon, a deterministic per-user salt is acceptable and honest — label it "demo salt management; production uses a salt backup service."

### Scope guard (no theater)
If the prover integration fights you for more than ~90 minutes, fall back cleanly: either it mints via a real zkLogin signature, or you REMOVE the zkLogin badge from the landing page. Do NOT ship a button that looks like zkLogin and silently does nothing. Real or removed — no middle.

### Acceptance test
- Click "Continue with Google" -> OAuth -> returns with a derived Sui address shown.
- That address completes a real `predict::mint` (fund with DUSDC first).
- A real testnet tx signed via the zkLogin signature, visible on Suiscan.
- If full proof flow can't land: badge removed, feature cut cleanly.

---

## Feature 2 — Seal-encrypted private strategy thesis (QUICK, optional)

### Why this one
The landing page also lists `Seal` — another currently-unbacked badge. Seal is cheap to integrate for one concrete use and adds a privacy dimension that pairs with the "verifiable but private" story.

### What it does
When creating a strategy, the user attaches a private note/thesis ("why I believe this") encrypted with Seal and stored on Walrus. Publicly, the strategy's structure and performance are transparent; the *reasoning* is the owner's private property — revealed only to a buyer after they pay to copy. A clean access-control demo.

### Why it's a good story
Closes the loop on "verifiable lineage + private alpha": anyone verifies a strategy's on-chain record, but the thesis behind it is encrypted and only revealed to paying copiers. Novel access-control pattern; makes the Seal badge true.

### Build approach
- Use `@mysten/seal`. Encrypt the note client-side with a policy keyed to the owner (and copiers post-payment).
- Store ciphertext on Walrus (real client already wired).
- Strategy Detail: owner sees decrypted note; non-owner sees "Private thesis — unlocks on copy."

### Scope guard
Strictly optional. Only after zkLogin is done AND the demo is recorded. Acceptance: encrypt a note, store on Walrus, decrypt as owner, confirm a different address cannot decrypt. If it doesn't land, remove the Seal badge rather than fake it.

---

## What to explicitly NOT build (discipline)

The 2025 winners prove feature count doesn't win — coherent working depth does. Cut, with confidence:

- NO full breeding dialog UI — on-chain breeding works and is demoable from Strategy Detail; that's enough.
- NO conviction-tree builder UI — Move logic is tested; show as roadmap.
- NO AI Advisor mode — scope creep.
- NO live-Greeks WebSocket + auto-hedge button — Risk Compass guardian already covers it.
- NO Distributional RL hedging (D4PG) — rule-based hedge logic is real; full RL is a research project, mention as roadmap.
- NO Postgres persistence — in-memory is fine by ADR-008.

Cutting these is itself a winning move.

---

## Priority order for remaining hours

1. Confirm work is committed + a fresh clone builds.
2. zkLogin (Feature 1) — the one feature that matters.
3. Record the demo (video.md) — higher value than Feature 2.
4. Seal notes (Feature 2) — only if time remains.
5. Submit.

If you only do 1-3, you win on a clean, honest, working core with zkLogin making your thesis literal. Feature 2 is gravy.
