// passport/offchain/report — N3 Forecaster Report: a signed snapshot of a passport, frozen as a Walrus blob.
//
// The live passport changes with every call. A report freezes it: HELIX signs the passport (raw Ed25519 over
// canonical JSON, the attestor key published at /.well-known/helix-attestation.json), uploads the signed
// document to Walrus as a plain blob, and writes a `REPORT v1` memory pointing at it. Anyone can then fetch
// the blob from any Walrus aggregator and check the signature offline (tee/scripts/verify-report.mjs, or the
// passport page's report viewer, which verifies with WebCrypto) — even if HELIX's servers are gone.
//
// Honest by construction: never issued while the hidden count is unknown (same rule as the on-chain
// attestation), one per forecaster per 10 minutes, and the report says which Walrus network holds it.
import { uploadBlob } from '../../shared/walrus.ts';
import { remember } from '../../memory/store.ts';
import { formatRecord, namespaceFor } from '../../memory/format.ts';
import { HttpError } from '../../shared/http.ts';
import { signJson } from './attest.ts';

export const REPORT_EPOCHS = Number(process.env.REPORT_EPOCHS ?? 30);
const WALRUS_NETWORK = process.env.WALRUS_NETWORK_LABEL ?? 'walrus-testnet';
const AGGREGATOR = (process.env.WALRUS_AGGREGATOR_URL ?? 'https://aggregator.walrus-testnet.walrus.space').replace(/\/+$/, '');
const APP = (process.env.HELIX_APP_URL ?? 'https://helix-app-fovn.onrender.com').replace(/\/+$/, '');
const last = new Map<string, { at: number; out: any }>();

/** The document that gets signed (pure; tested). */
export function buildReport(passport: any, now = Date.now()) {
  return {
    kind: 'helix-forecaster-report', v: 1, issuer: 'HELIX',
    issued_at: new Date(now).toISOString(), walrus_network: WALRUS_NETWORK,
    passport,
    verify: {
      attestor_key: 'https://helix-compiler.onrender.com/.well-known/helix-attestation.json',
      signed: 'raw Ed25519 over the UTF-8 bytes of canonical JSON (keys sorted at every depth) of `report`',
      script: 'node tee/scripts/verify-report.mjs <blob_id>',
      each_commit: 'every row carries its Sui digest and hash; re-hash the remembered text and compare on chain',
    },
  };
}

export async function createReport(owner: string, getPassport: (owner: string) => Promise<any>, now = Date.now()) {
  const prev = last.get(owner);
  if (prev && now - prev.at < 10 * 60_000) return { ...prev.out, reused: true };   // one per 10 min: no spam, same answer
  const pp = await getPassport(owner);
  if (pp?.hidden == null) throw new HttpError(503, { error: 'commit ledger unavailable right now — not freezing an unknown hidden count; retry shortly' });
  const report = buildReport(pp, now);
  const signature = await signJson(report);
  const blob_id = await uploadBlob({ report, signature }, REPORT_EPOCHS);
  const ns = namespaceFor(owner);
  const mem = await remember(ns, formatRecord('REPORT', [
    ['blob', blob_id], ['network', WALRUS_NETWORK], ['committed', pp.committed], ['hidden', pp.hidden], ['n', pp.n_settled],
    ['wins', pp.wins], ['brier', pp.brier == null ? 'na' : Number(pp.brier).toFixed(3)], ['ts', Math.floor(now / 1000)],
  ]), { origin: 'report' }).catch(() => null);                                      // the blob stands on its own
  const out = {
    blob_id, walrus_network: WALRUS_NETWORK, epochs: REPORT_EPOCHS, issued_at: report.issued_at,
    aggregator_url: `${AGGREGATOR}/v1/blobs/${blob_id}`, viewer_url: `${APP}/passport.html?report=${blob_id}`,
    memory_blob: mem?.blob_id ?? null, pubkey_hex: signature.pubkey_hex,
  };
  last.set(owner, { at: now, out });
  if (last.size > 500) last.clear();
  return out;
}

/** test hook */
export const __resetReports = () => last.clear();
