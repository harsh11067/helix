#!/usr/bin/env bash
# Rebuild the vendored SDK bundles (run from anywhere; needs network for npm).
set -euo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)"
W="$(mktemp -d)"; cd "$W"
echo '{"name":"helix-vendor","private":true,"type":"module"}' > package.json
npm i --no-audit --no-fund @mysten/sui@2.39.1 @mysten/seal@1.5.4 @wallet-standard/app@1.1.0 esbuild@0.25.10
mkdir entries
printf "export { SuiGraphQLClient } from '@mysten/sui/graphql';\nexport { Transaction } from '@mysten/sui/transactions';\nexport { toBase64, fromBase64, fromHex } from '@mysten/sui/utils';\nexport { getWallets } from '@wallet-standard/app';\n" > entries/core.js
printf "export { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';\nexport { getZkLoginSignature } from '@mysten/sui/zklogin';\n" > entries/zk.js
printf "export { SealClient, SessionKey } from '@mysten/seal';\n" > entries/seal.js
rm -f "$OUT"/*.js
./node_modules/.bin/esbuild entries/core.js entries/zk.js entries/seal.js --bundle --splitting --format=esm --minify \
  --target=es2022 --platform=browser --outdir="$OUT" --chunk-names=chunk-[hash] --legal-comments=none
