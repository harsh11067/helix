// walrus — REAL Walrus testnet blob storage (publisher/aggregator API,
// CLAUDE.md §7). Replaces the volatile in-memory mockWalrus on the live path;
// the mock is retained behind OFFLINE=1 so the deterministic TEE tests stay green.
//
// Backtest equity curves + attestation archives are uploaded here; the returned
// blob id is a real, content-addressed Walrus id (base64url) that anyone can
// fetch from the public aggregator and that walrus_adapter::new_blob_ref wraps
// as the on-chain pointer.
import { put as mockPut, get as mockGet } from './mockWalrus.ts';

const PUBLISHER = process.env.WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space';
const AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL ?? 'https://aggregator.walrus-testnet.walrus.space';
const isOffline = () => process.env.OFFLINE === '1';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Upload bytes/JSON-able data; returns a real Walrus blob id (or the mock
 *  content-address under OFFLINE=1). */
export async function uploadBlob(data: unknown, epochs = 1): Promise<string> {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  if (isOffline()) return mockPut(body);          // MOCK fallback (tests / no-network)
  const r = await fetch(`${PUBLISHER}/v1/blobs?epochs=${epochs}`, { method: 'PUT', body });
  if (!r.ok) throw new Error(`walrus upload failed ${r.status}`);
  const j: any = await r.json();
  const id = j?.newlyCreated?.blobObject?.blobId ?? j?.alreadyCertified?.blobId;
  if (!id) throw new Error('walrus: no blobId in publisher response');
  return id;
}

/** Fetch a blob back by id as bytes. */
export async function fetchBlob(blobId: string): Promise<Uint8Array> {
  if (isOffline()) {
    const v = mockGet(blobId);
    if (v == null) throw new Error('walrus(mock): blob not found');
    return enc.encode(v);
  }
  const r = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!r.ok) throw new Error(`walrus fetch failed ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Convenience: fetch a blob and parse it as JSON. */
export async function fetchJson(blobId: string): Promise<any> {
  return JSON.parse(dec.decode(await fetchBlob(blobId)));
}

/** A real Walrus testnet id is base64url, ~43 chars and not 64-hex (the mock's
 *  sha256). Used to assert we stored against the real network, not the mock. */
export function isRealWalrusId(id: string): boolean {
  return /^[A-Za-z0-9_-]{40,48}$/.test(id) && !/^[0-9a-f]{64}$/.test(id);
}

/** On-chain pointer bytes for walrus_adapter::new_blob_ref(blob_id, kind, size). */
export function blobIdBytes(blobId: string): Uint8Array { return enc.encode(blobId); }
