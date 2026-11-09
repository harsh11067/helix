# Vendored Sui SDK bundles

Built once from the exact versions the app used from esm.sh (`@mysten/sui@2.39.1`,
`@mysten/seal@1.5.4`, `@wallet-standard/app@1.1.0`) with esbuild code-splitting, so the
page loads 6 local files instead of ~236 esm.sh modules before anything can run.

- `core.js`: SuiGraphQLClient, Transaction, toBase64/fromBase64/fromHex, getWallets (loaded at boot)
- `zk.js`: Ed25519Keypair, getZkLoginSignature (zkLogin)
- `seal.js`: SealClient, SessionKey (loaded only when a thesis is locked or unlocked)
- `chunk-*.js`: code shared between the three entries (one copy of @mysten/sui)

Rebuild: see `build.sh`.
