/* ============================================================
   HELIX — zkLogin (Sign in with Google → self-custodial Sui address)

   The literal embodiment of the thesis: a user authenticates with Google and
   trades on-chain without ever seeing a seed phrase. This is a REAL Sui zkLogin
   flow, powered by Enoki (Mysten's hosted prover + salt service):

     1. ask Enoki for a nonce bound to a fresh ephemeral Ed25519 keypair + maxEpoch
     2. redirect to Google OAuth (OpenID Connect, response_type=id_token)
     3. receive the JWT, ask Enoki for this user's salt+address and a ZK proof
     4. assemble a zkLogin signature and submit the SAME PTB the wallet path uses

   WHY ENOKI (and not the raw prover): the public Mysten prover
   (prover.mystenlabs.com) ONLY issues proofs for an allow-listed set of OAuth
   audiences — a custom Google client id returns
       400 InputValidationError: "The audience <client_id> is not supported".
   The devnet prover (prover-dev) accepts any audience but emits TEST-circuit
   proofs that fail testnet's MAIN-circuit verifier ("Groth16 proof verify
   failed"). Enoki is the supported path for a custom app on testnet/mainnet: you
   register YOUR Google client id as an auth provider in the Enoki portal and it
   proves against the right circuit for your audience. It also manages a per-user
   salt (so identities are unlinkable — better than a shared demo salt).

   Config (set in app.html, like HELIX_COMPILER_URL):
     window.HELIX_GOOGLE_CLIENT_ID — your Google OAuth *Web* client id (the OAuth
                                     redirect uses it; register it in Enoki too).
     window.HELIX_ENOKI_KEY        — your Enoki *public* API key (enoki_public_…).
                                     Domain-restricted, safe in the frontend.
     window.HELIX_ENOKI_NETWORK    — 'testnet' (default) | 'mainnet' | 'devnet'.
   The redirect URI you register in Google must match the page exactly, e.g.
     https://<your-app>/app.html   and   http://localhost:5173/app.html
   One-time Enoki setup (portal.enoki.mystenlabs.com): create a project → copy the
   public API key → add Google as an auth provider with the SAME client id above →
   add your app origin(s) to the allow-list.
   ============================================================ */
import { Ed25519Keypair } from 'https://esm.sh/@mysten/sui@1.30.0/keypairs/ed25519';
import { getZkLoginSignature } from 'https://esm.sh/@mysten/sui@1.30.0/zklogin';

const ENOKI_URL = 'https://api.enoki.mystenlabs.com/v1';
const NETWORK = (typeof window !== 'undefined' && window.HELIX_ENOKI_NETWORK) || 'testnet';
const ZK_DEBUG = typeof window !== 'undefined' && window.HELIX_ZK_DEBUG !== false; // on by default while stabilizing

// localStorage (NOT sessionStorage) for the ephemeral stash → full session. The
// OAuth round-trip (and some in-app/mobile browsers) can reset the tab session,
// which wipes sessionStorage and yields "ephemeral state lost"; localStorage
// survives the redirect and a reload. The stash is short-lived (bound to maxEpoch)
// and cleared on disconnect.
const SS = 'helix.zk';
const store = (typeof window !== 'undefined' && window.localStorage) || sessionStorage;

export function googleClientId() {
  return (typeof window !== 'undefined' && window.HELIX_GOOGLE_CLIENT_ID) || '';
}
export function enokiKey() {
  return (typeof window !== 'undefined' && window.HELIX_ENOKI_KEY) || '';
}
// Button visibility: a Google client id is enough to SHOW the option; if the
// Enoki key is missing we surface a precise, actionable error at begin() rather
// than hide the button (the user explicitly wants it visible).
export function zkConfigured() { return !!googleClientId(); }

/* thin Enoki REST helper — returns the `data` envelope, throws a readable error */
async function enoki(path, { method = 'GET', jwt, body } = {}) {
  const key = enokiKey();
  if (!key) throw new Error('zkLogin needs an Enoki API key — set window.HELIX_ENOKI_KEY in app.html (see .env.example §6).');
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (jwt) headers['zklogin-jwt'] = jwt;
  const r = await fetch(`${ENOKI_URL}/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let detail = await r.text();
    try { detail = JSON.parse(detail)?.message || detail; } catch (e) {}
    throw new Error(`Enoki ${path} ${r.status}: ${String(detail).slice(0, 200)}`);
  }
  const { data } = await r.json();
  return data;
}

function b64urlToJson(part) {
  const s = part.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return JSON.parse(decodeURIComponent(escape(atob(s + pad))));
}
function decodeJwt(jwt) { return b64urlToJson(jwt.split('.')[1]); }

/* (1) begin: fresh ephemeral key, ask Enoki for a nonce (it pins maxEpoch +
   randomness), stash across the redirect, go to Google. */
export async function beginGoogleLogin(suiClient, redirectUri) {
  if (!zkConfigured()) throw new Error('zkLogin not configured (HELIX_GOOGLE_CLIENT_ID)');
  const eph = Ed25519Keypair.generate();
  const ephemeralPublicKey = eph.getPublicKey().toSuiPublicKey();
  const { nonce, randomness, maxEpoch } = await enoki('zklogin/nonce', {
    method: 'POST', body: { network: NETWORK, ephemeralPublicKey },
  });
  store.setItem(SS, JSON.stringify({
    pending: true, secret: eph.getSecretKey(), maxEpoch, randomness, nonce, redirectUri,
  }));
  if (ZK_DEBUG) console.log('[zkLogin] begin', { network: NETWORK, maxEpoch, nonce, ephPub: ephemeralPublicKey });
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email',
    nonce,
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/* (2) complete: call on load. If Google redirected back with a JWT in the URL
   fragment, finish: Enoki gives salt+address and the ZK proof; persist session. */
export async function completeGoogleLoginIfPresent(suiClient) {
  const h = window.location.hash || '';
  if (!h.includes('id_token=')) return null;
  const frag = new URLSearchParams(h.replace(/^#/, ''));
  const jwt = frag.get('id_token');
  // scrub the sensitive fragment from the address bar immediately
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const stash = JSON.parse(store.getItem(SS) || 'null');
  if (!jwt || !stash || !stash.pending) throw new Error('zkLogin: ephemeral state lost');

  const { secret, maxEpoch, randomness, nonce: storedNonce } = stash;
  const eph = Ed25519Keypair.fromSecretKey(secret);
  const ephemeralPublicKey = eph.getPublicKey().toSuiPublicKey();
  const payload = decodeJwt(jwt);

  // (a) salt + address for this (app, user) from Enoki
  const { address, salt } = await enoki('zklogin', { jwt });
  // (b) ZK proof bound to the SAME ephemeral key / maxEpoch / randomness
  const proof = await enoki('zklogin/zkp', {
    method: 'POST', jwt,
    body: { network: NETWORK, ephemeralPublicKey, maxEpoch, randomness },
  });

  if (ZK_DEBUG) {
    console.group('[zkLogin] complete — input audit');
    console.log('(2) nonce stored / in JWT :', storedNonce, '/', payload.nonce, '(match:', storedNonce === payload.nonce, ')');
    console.log('(3) iss/aud/sub           :', payload.iss, '/', payload.aud, '/', payload.sub);
    console.log('(1) salt (Enoki)          :', salt);
    console.log('    address (Enoki)       :', address, '| maxEpoch:', maxEpoch);
    console.log('    proof addressSeed     :', proof.addressSeed, '| keys:', Object.keys(proof || {}));
    console.groupEnd();
  }

  // proof = ZkLoginSignatureInputs { proofPoints, issBase64Details, headerBase64, addressSeed }.
  // Store addressSeed separately; the rest is reassembled in zkSignAndExecute.
  const { addressSeed, ...proofInputs } = proof;
  const session = {
    address, maxEpoch, secret, proof: proofInputs, addressSeed,
    sub: payload.sub, email: payload.email || null,
  };
  store.setItem(SS, JSON.stringify(session));
  return session;
}

/* a persisted, ready-to-use session (survives reloads within the tab) */
export function loadSession() {
  try {
    const s = JSON.parse(store.getItem(SS) || 'null');
    return (s && s.proof && s.address) ? s : null;
  } catch (e) { return null; }
}
export function clearSession() { try { store.removeItem(SS); } catch (e) {} }

/* (3) sign + execute a Transaction with the assembled zkLogin signature.
   Returns the same shape the wallet path returns (digest / effects / objectChanges
   / events) so every downstream flow (mint, breed, list) works unchanged. */
export async function zkSignAndExecute(suiClient, session, tx) {
  // maxEpoch guard: a zkLogin proof is only valid while currentEpoch <= maxEpoch.
  // An expired proof produces the SAME "Groth16 proof verify failed" surface as a
  // bad input, so fail with a clear, actionable error (re-login) instead.
  try {
    const { epoch } = await suiClient.getLatestSuiSystemState();
    if (Number(epoch) > Number(session.maxEpoch)) {
      throw new Error(`zkLogin session expired (epoch ${epoch} > maxEpoch ${session.maxEpoch}). Sign in with Google again.`);
    }
    if (ZK_DEBUG) console.log('[zkLogin] sign — epoch', Number(epoch), 'maxEpoch', session.maxEpoch, '| sender', session.address);
  } catch (e) {
    if (/session expired/.test(e.message)) throw e; // re-throw our guard; ignore RPC hiccups
  }
  tx.setSender(session.address);
  const eph = Ed25519Keypair.fromSecretKey(session.secret);
  const { bytes, signature: userSignature } = await tx.sign({ client: suiClient, signer: eph });
  const zkSignature = getZkLoginSignature({
    inputs: { ...session.proof, addressSeed: session.addressSeed },
    maxEpoch: session.maxEpoch,
    userSignature,
  });
  const res = await suiClient.executeTransactionBlock({
    transactionBlock: bytes, signature: zkSignature,
    options: { showEffects: true, showObjectChanges: true, showEvents: true },
  });
  await suiClient.waitForTransaction({ digest: res.digest });
  return res;
}
