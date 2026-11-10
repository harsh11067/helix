// decrypt-memory — read a Walrus Memory record straight from Walrus by blob id, bypassing the relayer's
// search index: download the Seal-encrypted blob from the Walrus mainnet aggregator, open a Seal session with
// HELIX's delegate key, approve through the MemWal account's `seal_approve`, and decrypt locally. Sui mainnet
// is read through Tatum. Used when a memory was written (blob id in the logs) but search never returns it.
//   node --env-file=../.env scripts/decrypt-memory.ts <blob_id> [<blob_id> …] [--verify-tx]
// Prints each record's text. With --verify-tx, re-hashes a CONVICTION and checks it against its commit on chain
// (Tatum gRPC). Reads only; writes nothing.
import { MemWalManual } from '@mysten-incubation/memwal/manual';
import { createHash } from 'node:crypto';
import { suiClient } from '../src/shared/tatum.ts';
import { commitBody } from '../src/memory/commit.ts';
import { getTransaction } from '../src/shared/tatumGrpc.ts';

const args = process.argv.slice(2);
const blobs = args.filter((a) => !a.startsWith('--'));
const RELAYER = process.env.MEMWAL_RELAYER_URL ?? 'https://relayer.memory.walrus.xyz';
const cfg: any = await (await fetch(RELAYER.replace(/\/$/, '') + '/config')).json();
// the delegate key opens the Seal session (as the SDK does in relayer mode), passed in bech32 form
const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
const raw = process.env.MEMWAL_PRIVATE_KEY!.trim();
const delegate = raw.startsWith('suiprivkey') ? Ed25519Keypair.fromSecretKey(raw) : Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(raw.replace(/^0x/, ''), 'hex')));
const m: any = (MemWalManual as any).create({
  key: raw, suiPrivateKey: delegate.getSecretKey(), accountId: process.env.MEMWAL_ACCOUNT_ID!.trim(),
  packageId: cfg.packageId, registryId: cfg.registryId, network: 'mainnet',
  suiClient: suiClient('mainnet'), serverUrl: RELAYER, embeddingApiKey: 'unused',
});
const { SessionKey, EncryptedObject } = await import('@mysten/seal');
const { Transaction } = await import('@mysten/sui/transactions');
const sealClient = await m.getSealClient();
const client = suiClient('mainnet');
const signerAddress = await m.getSignerAddress();
const sessionKey = await SessionKey.create({ address: signerAddress, packageId: cfg.packageId, ttlMin: 5, signer: await m.createSigner(signerAddress), suiClient: client as any });
for (const blobId of blobs) {
  try {
    const data: Uint8Array = await m.walrusDownload(blobId);
    const parsed = EncryptedObject.parse(data);
    const tx = new Transaction();
    tx.moveCall({ target: `${cfg.packageId}::account::seal_approve`, arguments: [tx.pure.vector('u8', Array.from(Buffer.from(parsed.id, 'hex'))), tx.object(cfg.registryId), tx.object(process.env.MEMWAL_ACCOUNT_ID!.trim())] });
    const txBytes = await tx.build({ client: client as any, onlyTransactionKind: true });
    // the key servers and threshold this blob was encrypted for are recorded in the ciphertext itself
    const { SealClient } = await import('@mysten/seal');
    const sc = new SealClient({ suiClient: client as any, serverConfigs: (parsed as any).services.map(([objectId]: [string, number]) => ({ objectId, weight: 1 })), verifyKeyServers: false });
    await sc.fetchKeys({ ids: [parsed.id], txBytes, sessionKey, threshold: (parsed as any).threshold });
    const text = new TextDecoder().decode(await sc.decrypt({ data, sessionKey, txBytes }));
    const out: any = { blob_id: blobId, text };
    if (args.includes('--verify-tx') && /^CONVICTION v1/.test(text)) {
      const tx = text.match(/\btx=([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1] ?? text.match(/\bcommit_tx=([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1];
      const h = createHash('sha256').update(commitBody(text)).digest('hex');
      const chain = tx ? await getTransaction(tx).catch(() => null) : null;
      out.verify = { tx, sha256: h, chain_hash: chain?.events?.[0]?.hash ?? null, match: !!chain && chain.events?.[0]?.hash === h };
    }
    console.log(JSON.stringify(out));
  } catch (e) { console.log(JSON.stringify({ blob_id: blobId, error: (e as Error).message.slice(0, 200) })); }
}
process.exit(0);
