// verify-all — check HELIX's claims yourself, in one command. No keys needed.
//   cd tee && node scripts/verify-all.mjs [address|namespace] [--api https://helix-compiler.onrender.com]
//
//  1. Chain audit: every ConvictionCommitted re-verified as a transaction (what /proof/audit reports).
//  2. Passport signature: Ed25519 over canonical JSON, against the published attestor key.
//  3. Three random commits: re-hash the remembered text HERE (sha256) and compare with the hash on Sui,
//     read through two separate Tatum interfaces (GraphQL via HELIX's read-only proxy, gRPC via /verify).
//  4. The latest frozen report: fetched straight from a Walrus aggregator, signature checked here.
//  5. A memory proof: the Walrus Memory account read on Sui mainnet + the blob from the Walrus mainnet aggregator.
import { createHash } from 'node:crypto';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) ?? 'helix-v1-4d922636976d';
const API = (args.includes('--api') ? args[args.indexOf('--api') + 1] : 'https://helix-compiler.onrender.com').replace(/\/+$/, '');
const AGG = 'https://aggregator.walrus-testnet.walrus.space';
const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v ?? null)
  : Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const get = async (p) => { const r = await fetch(p.startsWith('http') ? p : API + p, { signal: AbortSignal.timeout(90_000) }); if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`); return r.json(); };
const sigOk = (obj, sig) => new Ed25519PublicKey(Buffer.from(sig.pubkey_hex, 'hex')).verify(new TextEncoder().encode(canonical(obj)), Buffer.from(sig.sig_b64, 'base64'));
// the text that was hashed on chain: the remembered CONVICTION without its own hash/tx fields (memory/commit.ts commitBody)
const commitBody = (t) => String(t ?? '').split(' | ').filter((s) => !/^(hash|tx|commit_tx)=/.test(s.trim())).join(' | ');
const results = [];
const step = async (name, fn) => {
  try { const d = await fn(); results.push(true); console.log(`✓ ${name}${d ? ' — ' + d : ''}`); }
  catch (e) { results.push(false); console.log(`✗ ${name} — ${e.message}`); }
};

console.log(`HELIX · verifying ${id} against ${API}\n`);
const wk = await get('/.well-known/helix-attestation.json');
const { passport: p, signature } = await get(`/passport/${encodeURIComponent(id)}`);

await step('chain audit', async () => {
  const a = await get('/proof/audit');
  if (a.ok !== a.audited) throw new Error(`${a.audited - a.ok} of ${a.audited} commits failed a check`);
  return `${a.ok}/${a.audited} commits: found, succeeded, sent by the committer, same hash, landed before expiry (closest ${a.min_lead_s}s)`;
});
await step('passport signature', async () => {
  if (signature.pubkey_hex !== wk.pubkey_hex) throw new Error('signed by a key other than the published attestor');
  if (!(await sigOk(p, signature))) throw new Error('signature does not match');
  return `${p.namespace}: committed ${p.committed} · shown ${p.shown} · hidden ${p.hidden} · settled ${p.n_settled} · won ${p.wins}`;
});
const withText = (p.commits ?? []).filter((c) => c.text && c.digest);
for (const c of withText.sort(() => Math.random() - 0.5).slice(0, 3)) {
  await step(`commit ${c.digest.slice(0, 10)}… re-hashed here`, async () => {
    const mine = createHash('sha256').update(commitBody(c.text)).digest('hex');
    const q = { query: 'query($d:String!){ transaction(digest:$d){ effects { events { nodes { contents { type { repr } json } } } } } }', variables: { d: c.digest } };
    const g = await (await fetch(API + '/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) })).json();
    const ev = (g?.data?.transaction?.effects?.events?.nodes ?? []).find((n) => String(n.contents?.type?.repr ?? '').endsWith('::journal::ConvictionCommitted'));
    const h = ev?.contents?.json?.hash;
    const viaGql = Array.isArray(h) ? h.map((b) => Number(b).toString(16).padStart(2, '0')).join('') : /^[0-9a-f]{64}$/i.test(h ?? '') ? h.toLowerCase() : h ? Buffer.from(h, 'base64').toString('hex') : null;
    const viaGrpc = (await get(`/verify/${c.digest}/grpc`)).events?.[0]?.hash ?? null;
    if (viaGql !== mine) throw new Error(`GraphQL hash ${String(viaGql).slice(0, 12)}… ≠ memory ${mine.slice(0, 12)}…`);
    if (viaGrpc !== mine) throw new Error(`gRPC hash ${String(viaGrpc).slice(0, 12)}… ≠ memory ${mine.slice(0, 12)}…`);
    return `sha256 ${mine.slice(0, 12)}… = on-chain via Tatum GraphQL and Tatum gRPC`;
  });
}
await step('latest frozen report (from Walrus)', async () => {
  const r = p.reports?.[0];
  if (!r) return 'none frozen yet for this forecaster (passport → "Freeze a signed copy on Walrus")';
  const doc = await get(`${AGG}/v1/blobs/${r.blob_id}`);
  if (doc.signature.pubkey_hex !== wk.pubkey_hex || !(await sigOk(doc.report, doc.signature))) throw new Error('report signature invalid');
  return `${r.blob_id.slice(0, 12)}… issued ${doc.report.issued_at} · committed ${doc.report.passport.committed} · hidden ${doc.report.passport.hidden} · signature valid`;
});
await step('memory proof on Walrus mainnet', async () => {
  const blob = withText[0]?.conviction_blob;
  if (!blob || !p.address) return 'no conviction blob on this page';
  const pr = await get(`/memory/${p.address}/proof/${blob}`);
  if (pr.verdict !== 'verified') throw new Error(`verdict ${pr.verdict}`);
  return `blob ${blob.slice(0, 12)}… in namespace, fetched from the mainnet aggregator, our delegate key listed on the MemWal account (read via ${(pr.via ?? []).join(' + ') || 'Tatum'})`;
});
const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
