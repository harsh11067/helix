/* ============================================================
   HELIX — Seal-encrypted private strategy thesis

   A strategy's structure and performance are public on-chain; its *reasoning* —
   the owner's thesis — is encrypted client-side with Seal and stored on Walrus.
   The plaintext is readable only by the strategy owner, or by an address that
   paid to copy the strategy (holds a CopyRelationship). Access is enforced
   on-chain by helix::seal_policy::seal_approve* (a real Sui access policy).

   Verified end-to-end on testnet (headless): encrypt → Walrus round-trip →
   owner decrypts, stranger denied. See SUBMISSION.md.

   Package-id note (this is an UPGRADED package):
     • Seal identity namespace = the ORIGINAL package id (first version).
     • The seal_policy module was added in the compatible upgrade, so every
       seal_policy call AND the ThesisAttached event use the LATEST package id.
   ============================================================ */
import { SealClient, SessionKey, getAllowlistedKeyServers }
  from 'https://esm.sh/@mysten/seal@0.4.18?deps=@mysten/sui@1.30.0';
import { Transaction } from 'https://esm.sh/@mysten/sui@1.30.0/transactions';
import { fromHex } from 'https://esm.sh/@mysten/sui@1.30.0/utils';

const PKG_ORIGINAL = '0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3';
const PKG_LATEST   = '0x96b36ef86f445b525eccaa5410a2c6cebe6c6dff85c86fbfee9914581b0ad391';
const THRESHOLD = 1; // 1-of-2 Mysten testnet key servers (demo resilience)
const WALRUS_PUBLISHER  = 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

export const SEAL_EVENT_TYPE = `${PKG_LATEST}::seal_policy::ThesisAttached`;

function makeClient(suiClient) {
  return new SealClient({
    suiClient,
    serverConfigs: getAllowlistedKeyServers('testnet').map(id => ({ objectId: id, weight: 1 })),
    verifyKeyServers: false,
  });
}
const idHex = (sid) => sid.replace(/^0x/, '');

/* ---- Walrus (real testnet publisher/aggregator) ---- */
export async function uploadToWalrus(bytes, epochs = 1) {
  const r = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`, { method: 'PUT', body: bytes });
  if (!r.ok) throw new Error(`walrus upload ${r.status}`);
  const j = await r.json();
  const blobId = j.newlyCreated?.blobObject?.blobId ?? j.alreadyCertified?.blobId;
  if (!blobId) throw new Error('walrus: no blobId in response');
  return blobId;
}
export async function fetchFromWalrus(blobId) {
  const r = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
  if (!r.ok) throw new Error(`walrus fetch ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/* ---- Seal ---- */
// Encrypt a thesis for a strategy → ciphertext bytes (to be stored on Walrus).
export async function encryptThesis(suiClient, strategyId, text) {
  const client = makeClient(suiClient);
  const { encryptedObject } = await client.encrypt({
    threshold: THRESHOLD, packageId: PKG_ORIGINAL, id: idHex(strategyId),
    data: new TextEncoder().encode(text),
  });
  return encryptedObject;
}

// Owner records the Walrus blob on-chain (emits ThesisAttached). Adds the call to
// the caller's Transaction so it can be batched or signed standalone.
export function addAttachThesis(tx, strategyId, blobId) {
  tx.moveCall({
    target: `${PKG_LATEST}::seal_policy::attach_thesis`,
    arguments: [tx.object(strategyId), tx.pure.vector('u8', Array.from(new TextEncoder().encode(blobId)))],
  });
}

// Decrypt a thesis. `signPersonalMessage(bytes) -> { signature }` abstracts the
// wallet; `copyRelationshipId` (optional) uses the copier access path.
export async function decryptThesis(suiClient, address, signPersonalMessage, ciphertext, strategyId, copyRelationshipId) {
  const client = makeClient(suiClient);
  const sk = new SessionKey({ address, packageId: PKG_ORIGINAL, ttlMin: 10, suiClient });
  const { signature } = await signPersonalMessage(sk.getPersonalMessage());
  sk.setPersonalMessageSignature(signature);

  const tx = new Transaction();
  const idArg = tx.pure.vector('u8', Array.from(fromHex(idHex(strategyId))));
  if (copyRelationshipId) {
    tx.moveCall({
      target: `${PKG_LATEST}::seal_policy::seal_approve_copier`,
      arguments: [idArg, tx.object(strategyId), tx.object(copyRelationshipId)],
    });
  } else {
    tx.moveCall({
      target: `${PKG_LATEST}::seal_policy::seal_approve`,
      arguments: [idArg, tx.object(strategyId)],
    });
  }
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
  const out = await client.decrypt({ data: ciphertext, sessionKey: sk, txBytes });
  return new TextDecoder().decode(out);
}

// Decode the blob_id (a vector<u8> of the UTF-8 blob-id string) from a parsed
// ThesisAttached event, tolerating either array or base64 SDK encodings.
export function decodeBlobId(parsedJson) {
  const raw = parsedJson?.blob_id;
  if (!raw) return null;
  if (Array.isArray(raw)) return new TextDecoder().decode(Uint8Array.from(raw));
  if (typeof raw === 'string') {
    try { return new TextDecoder().decode(Uint8Array.from(atob(raw), c => c.charCodeAt(0))); }
    catch (e) { return raw; }
  }
  return null;
}
