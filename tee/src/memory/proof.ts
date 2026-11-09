// proof — show that a memory really lives on Walrus MAINNET and was written by this
// app's Walrus Memory account, reading the chain through Tatum's MAINNET gateway.
//
//  1. Tatum mainnet → the MemWalAccount object (shared): owner + delegate keys.
//     Our delegate PUBLIC key must be listed there → the account authorised this writer.
//  2. Walrus mainnet aggregator → the blob bytes for blob_id (Seal-encrypted ciphertext;
//     we report size + sha256, never decrypt here).
//  3. The blob_id must be one recalled from this address's namespace.
//  4. Tatum mainnet checkpoint at proof time.

import { createHash } from 'node:crypto';
import { gql, latestCheckpoint, TATUM_URLS } from '../shared/tatum.ts';
import { agentPublicKey } from './store.ts';
import { recallForAddress } from './store.ts';
import { namespaceFor } from './format.ts';

const AGGREGATOR = process.env.WALRUS_MAINNET_AGGREGATOR ?? 'https://aggregator.walrus-mainnet.walrus.space';

export async function memoryProof(address: string, blobId: string) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(blobId)) throw new Error('invalid blob id');
  const accountId = process.env.MEMWAL_ACCOUNT_ID?.trim();
  const recs = await recallForAddress(address);
  const rec = recs.find((r) => r.blob_id === blobId);

  const acct = accountId ? await gql('mainnet', `query($id: SuiAddress!) { object(address: $id) { address version digest
      owner { __typename } previousTransaction { digest effects { timestamp } }
      asMoveObject { contents { type { repr } json } } } }`, { id: accountId }) : null;
  const obj: any = acct?.data?.object ?? null;
  const json = obj?.asMoveObject?.contents?.json ?? null;
  const ourPk = await agentPublicKey();
  const delegateListed = !!(ourPk && json?.delegate_keys?.some((k: any) =>
    Buffer.from(String(k.public_key), 'base64').toString('hex').toLowerCase() === ourPk.toLowerCase()));

  let blob: any = { fetched: false };
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 15_000);
    const r = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`, { signal: c.signal });
    clearTimeout(t);
    if (r.ok) {
      const bytes = Buffer.from(await r.arrayBuffer());
      blob = { fetched: true, http: r.status, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), encrypted: true };
    } else blob = { fetched: false, http: r.status };
  } catch (e) { blob = { fetched: false, error: (e as Error).message.slice(0, 80) }; }

  const checkpoint = await latestCheckpoint('mainnet').catch(() => null);
  return {
    blob_id: blobId,
    namespace: namespaceFor(address),
    in_namespace: !!rec,
    record_type: rec?.type ?? null,
    walrus: { network: 'mainnet', aggregator: AGGREGATOR, ...blob },
    memwal_account: obj ? {
      object_id: obj.address, type: obj.asMoveObject?.contents?.type?.repr, version: obj.version,
      owner: json?.owner ?? null, active: json?.active ?? null,
      last_tx: obj.previousTransaction?.digest ?? null, last_tx_time: obj.previousTransaction?.effects?.timestamp ?? null,
      delegate_keys: (json?.delegate_keys ?? []).map((k: any) => ({ public_key_hex: Buffer.from(String(k.public_key), 'base64').toString('hex'), label: k.label })),
      our_delegate_listed: delegateListed,
    } : null,
    read_via: { gateway: new URL(TATUM_URLS.mainnet).host, network: 'sui-mainnet', checkpoint },
    verdict: !!rec && blob.fetched && delegateListed ? 'verified' : 'incomplete',
  };
}
