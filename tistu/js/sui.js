/* ============================================================
   HELIX — browser chain access (Total Recall)

   Every Sui call the page makes goes to the HELIX compiler service, which is
   the single chokepoint to Tatum's Sui gateway (the Tatum credential never reaches the
   browser). Sui retired public JSON-RPC in 2026, so reads are GraphQL:
     reads    → POST {compiler}/graphql      (proxied to Tatum, read-only)
     builds   → @mysten/sui v2 SuiGraphQLClient on the same proxy
     signing  → the wallet (sui:signTransaction) or the zkLogin ephemeral key
     execute  → POST {compiler}/tx/execute   (Tatum executeTransaction, logged)
   ============================================================ */
// Vendored @mysten/sui 2.39.1 bundle (js/vendor/README.md): 6 local files instead of ~236 esm.sh modules.
import { SuiGraphQLClient, Transaction, toBase64, fromBase64 } from './vendor/core.js';
export { Transaction, toBase64, fromBase64 };

let API = '';
export let client = null;

export function initChain(compilerUrl) {
  API = String(compilerUrl).replace(/\/+$/, '');
  client = new SuiGraphQLClient({ url: API + '/graphql', network: 'testnet' });
  return client;
}
export const apiBase = () => API;

/* ---------------- HTTP helpers to the compiler ---------------- */
export async function api(path, body, { timeoutMs = 60000 } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: c.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `HTTP ${r.status}`); e.code = j.code; e.plan = j.plan; e.status = r.status; throw e; }
    return j;
  } finally { clearTimeout(t); }
}

export async function gql(query, variables) {
  const j = await api('/graphql', { query, variables });
  if (j.errors?.length) throw new Error(j.errors[0].message || 'graphql error');
  return j.data;
}

/* ---------------- reads (GraphQL through the compiler → Tatum) ---------------- */
export async function ownedOfType(owner, type, first = 50) {
  const d = await gql(`query($a: SuiAddress!, $t: String!, $n: Int) { address(address: $a) {
      objects(filter: { type: $t }, first: $n) { nodes { address contents { type { repr } json } } } } }`, { a: owner, t: type, n: first });
  return (d.address?.objects?.nodes || []).map(n => ({ id: n.address, type: n.contents?.type?.repr, json: n.contents?.json }));
}
export async function objectOf(id) {
  const d = await gql(`query($id: SuiAddress!) { object(address: $id) { address
      owner { __typename ... on AddressOwner { address { address } } }
      asMoveObject { contents { type { repr } json } } } }`, { id });
  const o = d.object; if (!o) return null;
  return { id: o.address, type: o.asMoveObject?.contents?.type?.repr, json: o.asMoveObject?.contents?.json, owner: o.owner?.address?.address || null };
}
export async function eventsOfType(type, last = 50) {
  const d = await gql(`query($t: String!, $n: Int) { events(last: $n, filter: { type: $t }) {
      nodes { timestamp contents { json } transaction { digest } } } }`, { t: type, n: last });
  return (d.events?.nodes || []).map(n => ({ json: n.contents?.json, ts: Date.parse(n.timestamp || 0) || 0, digest: n.transaction?.digest }))
    .sort((a, b) => b.ts - a.ts);
}
export async function coinsOf(owner, coinType) {
  const all = await ownedOfType(owner, `0x2::coin::Coin<${coinType}>`);
  return all.map(c => ({ id: c.id, balance: BigInt(c.json?.balance ?? 0) })).sort((a, b) => (b.balance > a.balance ? 1 : -1));
}
export async function currentEpoch() {
  const d = await gql('{ epoch { epochId } }');
  return Number(d.epoch?.epochId);
}

/* ---------------- signing + execution ---------------- */
// A fully-built transaction handed to a wallet: wallets call `toJSON()` and accept
// base64 transaction bytes there (Transaction.from understands both).
export const bytesTx = (b64) => ({ toJSON: async () => b64 });

export async function buildBytes(tx, sender) {
  tx.setSenderIfNotSet(sender);
  return toBase64(await tx.build({ client }));
}

export async function walletSign(wallet, account, b64) {
  const f = wallet?.features?.['sui:signTransaction'];
  if (!f) throw new Error('This wallet cannot sign-only (sui:signTransaction). Update Slush / Sui Wallet.');
  const r = await f.signTransaction({ transaction: bytesTx(b64), account, chain: 'sui:testnet' });
  return { bytes: r.bytes || b64, signature: r.signature };
}

/** Execute signed bytes through the compiler (→ Tatum). Returns a normalized result. */
export async function executeSigned(bytesB64, signature, extra = {}) {
  const r = await api('/tx/execute', { txBytes: bytesB64, signatures: [signature], ...extra }, { timeoutMs: 90000 });
  return {
    ...r,
    // compatibility shape for older call sites
    effects: { status: { status: r.success ? 'success' : 'failure', error: r.error } },
    objectChanges: (r.changed || []).map(c => ({
      type: c.op === 'Created' ? 'created' : 'mutated', objectId: c.id, objectType: c.type || '',
    })),
  };
}
