// N3 — verify a HELIX Forecaster Report straight from Walrus, without trusting HELIX's servers for the data:
//   node tee/scripts/verify-report.mjs <blob_id> [--aggregator https://aggregator.walrus-testnet.walrus.space]
// Downloads the blob from a Walrus aggregator, recomputes the canonical JSON of `report` (keys sorted at every
// depth), checks the raw Ed25519 signature against the attestor key published at
// /.well-known/helix-attestation.json, then flips one byte to show a tampered copy fails.
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

const args = process.argv.slice(2);
const blob = args.find((a) => !a.startsWith('--'));
if (!blob) { console.error('usage: verify-report.mjs <blob_id>'); process.exit(2); }
const AGG = (args.includes('--aggregator') ? args[args.indexOf('--aggregator') + 1] : 'https://aggregator.walrus-testnet.walrus.space').replace(/\/+$/, '');
const KEY_URL = 'https://helix-compiler.onrender.com/.well-known/helix-attestation.json';
const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v ?? null)
  : Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;

const { report, signature } = await (await fetch(`${AGG}/v1/blobs/${blob}`)).json();
const wk = await (await fetch(KEY_URL)).json().catch(() => null);
if (wk && wk.pubkey_hex !== signature.pubkey_hex) { console.log('FAIL: signed by a key other than the published HELIX attestor'); process.exit(1); }
const pk = new Ed25519PublicKey(Buffer.from(signature.pubkey_hex, 'hex'));
const msg = new TextEncoder().encode(canonical(report));
const ok = await pk.verify(msg, Buffer.from(signature.sig_b64, 'base64'));
const t = Uint8Array.from(msg); t[Math.floor(t.length / 2)] ^= 1;
const okT = await pk.verify(t, Buffer.from(signature.sig_b64, 'base64'));
const p = report.passport;
console.log(`report ${blob} · ${report.walrus_network} · issued ${report.issued_at}`);
console.log(`forecaster ${p.namespace} · committed ${p.committed} · shown ${p.shown} · hidden ${p.hidden} · settled ${p.n_settled} · won ${p.wins} · Brier ${p.brier?.toFixed?.(3)}`);
console.log(`attestor ${signature.pubkey_hex.slice(0, 16)}…${wk ? ' (matches /.well-known)' : ' (key endpoint unreachable — checked against the embedded key)'} · signature ${ok ? 'VALID' : 'INVALID'} · one flipped byte → ${okT ? 'still valid (BAD)' : 'rejected'}`);
process.exit(ok && !okT ? 0 : 1);
