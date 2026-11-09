// P2-05 — verify a Forecaster Passport's signature OFFLINE against the published attestor key.
//   node tee/scripts/verify-attestation.mjs <address|namespace> [--api https://helix-compiler.onrender.com]
// Fetches the signed passport and /.well-known/helix-attestation.json, recomputes the canonical JSON
// (keys sorted at every depth), checks the raw Ed25519 signature, then flips one byte to show it fails.
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
const API = (args.includes('--api') ? args[args.indexOf('--api') + 1] : 'https://helix-compiler.onrender.com').replace(/\/+$/, '');
const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v ?? null)
  : Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;

const wk = await (await fetch(`${API}/.well-known/helix-attestation.json`)).json();
const { passport, signature } = await (await fetch(`${API}/passport/${encodeURIComponent(id)}`)).json();
if (signature.pubkey_hex !== wk.pubkey_hex) { console.log('FAIL: signature key differs from the published attestor key'); process.exit(1); }
const pk = new Ed25519PublicKey(Buffer.from(wk.pubkey_hex, 'hex'));
const msg = new TextEncoder().encode(canonical(passport));
const ok = await pk.verify(msg, Buffer.from(signature.sig_b64, 'base64'));
const tampered = Uint8Array.from(msg); tampered[Math.floor(tampered.length / 2)] ^= 1;
const okTampered = await pk.verify(tampered, Buffer.from(signature.sig_b64, 'base64'));
console.log(`passport ${passport.namespace} · settled ${passport.n_settled} · committed ${passport.committed} · hidden ${passport.hidden}`);
console.log(`attestor ${wk.pubkey_hex.slice(0, 16)}… · signature ${ok ? 'VALID' : 'INVALID'} · one flipped byte → ${okTampered ? 'still valid (BAD)' : 'rejected'}`);
process.exit(ok && !okTampered ? 0 : 1);
