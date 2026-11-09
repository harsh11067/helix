// passport/offchain/routes — the Passport API (NEXT_BIG.md §3, LANES.md §0 contract). Flag FEATURE_PASSPORT
// (on unless set to "0"). Free and unauthenticated: passports are public by design.
//
//   GET /passport/:id                 summary (id = address or namespace; ".json" suffix allowed), signed
//   GET /passport/:id/card.svg        the share card / OG image / on-chain Display image
//   GET /passport/:id/attestation?owner=0x…   BCS attestation for the on-chain passport (LANES.md §0)
//   GET /.well-known/helix-attestation.json   the attestor public key and how to verify
//   GET /verify/:digest               any commit digest → on-chain event + remembered text → match?

import { HttpError, RawResponse } from '../../shared/http.ts';
import { gql } from '../../shared/tatum.ts';
import { recallForAddress } from '../../memory/store.ts';
import { commitBody, sha256hex, hashHex, JOURNAL_PKG } from '../../memory/commit.ts';
import { namespaceFor, str } from '../../memory/format.ts';
import { passportFor, resolveOwner } from './summary.ts';
import { passportCardSVG } from './card.ts';
import { signJson, signAttestation, pubkeyHex, BADGES } from './attest.ts';

const enabled = () => process.env.FEATURE_PASSPORT !== '0';
const cache = new Map<string, { at: number; v: any }>();
async function passportCached(owner: string) {
  const hit = cache.get(owner);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const v = await passportFor(owner);
  cache.set(owner, { at: Date.now(), v });
  if (cache.size > 300) cache.clear();
  return v;
}
async function ownerOr404(id: string): Promise<string> {
  if (!enabled()) throw new HttpError(404, { error: 'not found' });
  const owner = await resolveOwner(id);
  if (!owner) throw new HttpError(404, { error: 'no passport for that id — use a Sui address, or a namespace that has at least one commit' });
  return owner;
}

/** Re-verify one commit from public data: the on-chain event (via Tatum) against the remembered text. */
export async function verifyCommit(digest: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(digest)) throw new HttpError(400, { error: 'not a transaction digest' });
  const r: any = await gql('testnet', `query($d:String!){ transaction(digest:$d){ sender { address } effects { timestamp status events { nodes { contents { type { repr } json } } } } } }`, { d: digest });
  const t = r.data?.transaction;
  if (!t) throw new HttpError(404, { error: 'transaction not found' });
  const ev = (t.effects?.events?.nodes ?? []).find((n: any) => String(n.contents?.type?.repr ?? '').endsWith('::journal::ConvictionCommitted'));
  if (!ev) return { digest, verdict: 'not_a_commit', detail: 'this transaction did not emit helix::journal::ConvictionCommitted' };
  const j = ev.contents.json, owner = String(j.owner), onchainHash = hashHex(j.hash);
  const recs = await recallForAddress(owner);
  const conv = recs.find((x) => x.type === 'CONVICTION' && str(x, 'tx') === digest) ?? recs.find((x) => x.type === 'CONVICTION' && str(x, 'hash') === onchainHash);
  const body = conv ? commitBody(conv.text) : null;
  const recomputed = body ? sha256hex(body) : null;
  return {
    digest, journal_package: JOURNAL_PKG, owner, namespace: namespaceFor(owner),
    chain: { hash: onchainHash, market: j.oracle, expiry_ms: Number(j.expiry_ms), committed_ms: Number(j.committed_ms), timestamp: t.effects?.timestamp, source: 'Sui testnet via Tatum GraphQL' },
    memory: conv ? { blob_id: conv.blob_id, text: body, source: 'Walrus Memory (mainnet)' } : null,
    recomputed_hash: recomputed,
    verdict: !conv ? 'hidden' : recomputed === onchainHash ? 'match' : 'mismatch',
  };
}

export function passportRoutes() {
  return {
    'GET /.well-known/helix-attestation.json': () => ({
      issuer: 'HELIX', alg: 'ed25519', pubkey_hex: pubkeyHex(),
      json: 'GET /passport/:id → { passport, signature }: raw Ed25519 over UTF-8 canonical JSON (keys sorted at every depth) of `passport`',
      bcs: 'GET /passport/:ns/attestation?owner= → raw Ed25519 over BCS(Attestation{owner: address, ns: String, n_settled, wins, brier_bps, gap_bps: u64, gap_negative: bool, hidden, badges, issued_ms, expires_ms: u64})',
      badges: BADGES, verify_script: 'node tee/scripts/verify-attestation.mjs <passport id>',
    }),
    'GET /passport/:id': async (_b: any, _u: URL, p: Record<string, string>) => {
      const passport = await passportCached(await ownerOr404(p.id));
      return { passport, signature: await signJson(passport) };
    },
    'GET /passport/:id/card.svg': async (_b: any, _u: URL, p: Record<string, string>) =>
      new RawResponse(passportCardSVG(await passportCached(await ownerOr404(p.id))), 'image/svg+xml; charset=utf-8', { 'cache-control': 'public, max-age=60' }),
    'GET /passport/:id/attestation': async (_b: any, u: URL, p: Record<string, string>) => {
      const owner = (u.searchParams.get('owner') ?? '').toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(owner)) throw new HttpError(400, { error: 'owner=<sui address> required' });
      if (!/^0x/.test(p.id) && namespaceFor(owner) !== p.id) throw new HttpError(400, { error: 'namespace does not belong to that owner' });
      const pp = await passportCached(await ownerOr404(owner));
      const now = Date.now();
      const brier = pp.brier ?? 0.25, gap = pp.gap_you ?? 0;
      return signAttestation({
        owner, ns: pp.namespace, n_settled: pp.n_settled, wins: pp.wins,
        brier_bps: Math.round((pp.n_settled ? brier : 0.25) * 10_000), gap_bps: Math.round(Math.abs(gap) * 10_000), gap_negative: gap < 0,
        hidden: pp.hidden, badges: pp.badges, issued_ms: now, expires_ms: now + 15 * 60_000,
      });
    },
    'GET /verify/:digest': (_b: any, _u: URL, p: Record<string, string>) => verifyCommit(p.digest),
  };
}
