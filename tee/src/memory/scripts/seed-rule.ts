// seed-rule — create a Ulysses rule for an address from a signed message (N2), e.g. to seed the demo trader.
//
//   RULE_SIGNER_KEY=suiprivkey1… COMPILER_URL=https://helix-compiler.onrender.com \
//     node src/memory/scripts/seed-rule.ts cap_commit max=2 gap_pts=30
//   node src/memory/scripts/seed-rule.ts cooldown_after_losses losses=3 hours=24 conf=high vol=choppy
//   node src/memory/scripts/seed-rule.ts justify_against_market below=50
//   node src/memory/scripts/seed-rule.ts max_per_day n=3
//
// The key signs ONLY the rule message (a personal message; no transaction, no gas). The server verifies the
// signature matches the namespace owner before writing the RULE v1 memory. Templates: GET /rules/templates.
// This is a WRITE to Walrus Memory (through the compiler): never run it in tests or without meaning to.
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const key = process.env.RULE_SIGNER_KEY?.trim();
if (!key) { console.error('RULE_SIGNER_KEY (bech32 suiprivkey…) is required'); process.exit(2); }
const base = (process.env.COMPILER_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const [template, ...kv] = process.argv.slice(2);
if (!template) { console.error('usage: seed-rule.ts <template> key=value …'); process.exit(2); }
const params = Object.fromEntries(kv.map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));

const kp = Ed25519Keypair.fromSecretKey(key);
const address = kp.toSuiAddress();
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} ${r.status}: ${JSON.stringify(j)}`);
  return j;
};
const m = await post('/rules/message', { action: 'create', address, template, params });
const { signature } = await kp.signPersonalMessage(new TextEncoder().encode(m.message));
const out = await post('/rules/create', { address, template, params, ts: m.ts, signature });
console.log(JSON.stringify({ address, rule: out.rule, blob_id: out.blob_id, namespace: out.namespace }, null, 2));
