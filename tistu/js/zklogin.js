/* ============================================================
   HELIX — zkLogin (Sign in with Google → self-custodial Sui address)

   The literal embodiment of the thesis: a user authenticates with Google and
   trades on-chain without ever seeing a seed phrase. This is a REAL Sui zkLogin
   flow — no mock, no theater:

     1. generate an ephemeral Ed25519 keypair + nonce (bound to maxEpoch)
     2. redirect to Google OAuth (OpenID Connect, response_type=id_token)
     3. receive the JWT, fetch a ZK proof from Mysten's testnet prover
     4. derive the user's Sui address from (iss, aud, sub, salt)
     5. assemble a zkLogin signature and submit the SAME PTB the wallet path uses

   Config (set in app.html, like HELIX_COMPILER_URL):
     window.HELIX_GOOGLE_CLIENT_ID  — your Google OAuth *Web* client id.
                                      The button is HIDDEN until this is set, so
                                      there is never a dead button (scope guard:
                                      real or removed, no middle).
   The redirect URI you register in Google must match the page exactly, e.g.
     https://<your-app>/app.html   and   http://localhost:5173/app.html
   ============================================================ */
import { Ed25519Keypair } from 'https://esm.sh/@mysten/sui@1.30.0/keypairs/ed25519';
import {
  generateNonce, generateRandomness, getExtendedEphemeralPublicKey,
  jwtToAddress, getZkLoginSignature, genAddressSeed,
} from 'https://esm.sh/@mysten/sui@1.30.0/zklogin';

const PROVER = (typeof window !== 'undefined' && window.HELIX_ZK_PROVER)
  || 'https://prover-dev.mystenlabs.com/v1';

// DEMO salt management: a single deterministic app-wide salt. This is the honest
// hackathon choice — the same Google account always derives the same Sui address.
// PRODUCTION uses a per-user salt backup service so the app never holds the secret
// and identities stay unlinkable. Labeled as such in the UI and SUBMISSION.md.
const DEMO_SALT = (typeof window !== 'undefined' && window.HELIX_ZK_SALT)
  || '247865123908765234190';

const SS = 'helix.zk'; // sessionStorage slot (ephemeral state, then full session)

export function googleClientId() {
  return (typeof window !== 'undefined' && window.HELIX_GOOGLE_CLIENT_ID) || '';
}
export function zkConfigured() { return !!googleClientId(); }

function b64urlToJson(part) {
  const s = part.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return JSON.parse(decodeURIComponent(escape(atob(s + pad))));
}
function decodeJwt(jwt) { return b64urlToJson(jwt.split('.')[1]); }

/* (1) begin: ephemeral key + nonce, stash across the redirect, go to Google */
export async function beginGoogleLogin(suiClient, redirectUri) {
  if (!zkConfigured()) throw new Error('zkLogin not configured (HELIX_GOOGLE_CLIENT_ID)');
  const { epoch } = await suiClient.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 2;          // proof valid for ~2 epochs
  const eph = Ed25519Keypair.generate();
  const randomness = generateRandomness();
  const nonce = generateNonce(eph.getPublicKey(), maxEpoch, randomness);
  sessionStorage.setItem(SS, JSON.stringify({
    pending: true, secret: eph.getSecretKey(), maxEpoch, randomness, redirectUri,
  }));
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
   fragment, finish: fetch the ZK proof, derive the address, persist the session. */
export async function completeGoogleLoginIfPresent(suiClient) {
  const h = window.location.hash || '';
  if (!h.includes('id_token=')) return null;
  const frag = new URLSearchParams(h.replace(/^#/, ''));
  const jwt = frag.get('id_token');
  // scrub the sensitive fragment from the address bar immediately
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const stash = JSON.parse(sessionStorage.getItem(SS) || 'null');
  if (!jwt || !stash || !stash.pending) throw new Error('zkLogin: ephemeral state lost');

  const { secret, maxEpoch, randomness } = stash;
  const eph = Ed25519Keypair.fromSecretKey(secret);
  const payload = decodeJwt(jwt);
  const salt = DEMO_SALT;
  const address = jwtToAddress(jwt, salt);
  const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(eph.getPublicKey());

  const r = await fetch(PROVER, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jwt, extendedEphemeralPublicKey, maxEpoch,
      jwtRandomness: randomness, salt, keyClaimName: 'sub',
    }),
  });
  if (!r.ok) throw new Error(`zk prover ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const proof = await r.json();

  const addressSeed = genAddressSeed(BigInt(salt), 'sub', payload.sub, payload.aud).toString();
  const session = {
    address, maxEpoch, secret, proof, addressSeed,
    sub: payload.sub, email: payload.email || null,
  };
  sessionStorage.setItem(SS, JSON.stringify(session));
  return session;
}

/* a persisted, ready-to-use session (survives reloads within the tab) */
export function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SS) || 'null');
    return (s && s.proof && s.address) ? s : null;
  } catch (e) { return null; }
}
export function clearSession() { try { sessionStorage.removeItem(SS); } catch (e) {} }

/* (3) sign + execute a Transaction with the assembled zkLogin signature.
   Returns the same shape the wallet path returns (digest / effects / objectChanges
   / events) so every downstream flow (mint, breed, list) works unchanged. */
export async function zkSignAndExecute(suiClient, session, tx) {
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
