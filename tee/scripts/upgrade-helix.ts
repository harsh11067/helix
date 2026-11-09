// upgrade-helix — compatible upgrade of the HELIX Move package with the existing UpgradeCap,
// signed locally by the deployer and executed through Tatum (Sui JSON-RPC is retired).
//
//   (cd ../contracts && sui move build --dump-bytecode-as-base64 > /path/build.json)
//   node --env-file=../.env scripts/upgrade-helix.ts --build /path/build.json            # simulate only
//   node --env-file=../.env scripts/upgrade-helix.ts --build /path/build.json --execute  # sign + execute
//
// Reads published-at / upgrade-capability from contracts/Published.toml; on success rewrites
// Published.toml (published-at, version) and prints the new package id + digest.

import { readFileSync, writeFileSync } from 'node:fs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction, UpgradePolicy } from '@mysten/sui/transactions';
import { suiClient, recordExecution } from '../src/shared/tatum.ts';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const PUBLISHED = new URL('../../contracts/Published.toml', import.meta.url);

const toml = readFileSync(PUBLISHED, 'utf8');
const field = (k: string) => toml.match(new RegExp(`${k}\\s*=\\s*"?([^"\\n]+)"?`))?.[1]?.trim();
const current = field('published-at')!, cap = field('upgrade-capability')!, version = Number(field('version'));
const build = JSON.parse(readFileSync(opt('build') ?? '', 'utf8'));

const d: any = decodeSuiPrivateKey(process.env.SUI_DEPLOYER_PRIVATE_KEY!.trim());
const kp = Ed25519Keypair.fromSecretKey(d.secretKey);
const sender = kp.toSuiAddress();

const tx = new Transaction();
tx.setSender(sender);
const ticket = tx.moveCall({
  target: '0x2::package::authorize_upgrade',
  arguments: [tx.object(cap), tx.pure.u8(UpgradePolicy.COMPATIBLE), tx.pure.vector('u8', build.digest)],
});
const receipt = tx.upgrade({ modules: build.modules, dependencies: build.dependencies, package: current, ticket });
tx.moveCall({ target: '0x2::package::commit_upgrade', arguments: [tx.object(cap), receipt] });

const client: any = suiClient('testnet');
const bytes = await tx.build({ client });
const sim: any = await client.simulateTransaction({ transaction: bytes, include: { effects: true } });
const eff = sim?.Transaction?.effects ?? sim?.transaction?.effects ?? sim?.effects;
const gas = eff?.gasUsed;
console.log(JSON.stringify({ sender, current, cap, version, modules: build.modules.length, simulate: eff?.status, gasUsed: gas }, null, 2));
if (!eff?.status?.success) process.exit(1);

if (args.includes('--execute')) {
  const { signature } = await kp.signTransaction(bytes);
  const res: any = await client.executeTransaction({ transaction: bytes, signatures: [signature], include: { effects: true, objectTypes: true } });
  const t = res?.Transaction ?? res?.transaction ?? res;
  const digest = t?.digest;
  recordExecution('testnet', digest);
  const done: any = await client.waitForTransaction({ digest, include: { effects: true, objectTypes: true }, timeout: 60_000 });
  const te = (done?.Transaction ?? done?.transaction ?? done)?.effects;
  const types = (done?.Transaction ?? done?.transaction ?? done)?.objectTypes ?? {};
  const changed = te?.changedObjects ?? [];
  const pkg = changed.find((o: any) => types[o.objectId] === 'package' || o.outputState === 'PackageWrite')?.objectId
    ?? changed.find((o: any) => o.idOperation === 'Created')?.objectId;
  console.log(JSON.stringify({ digest, status: te?.status, newPackage: pkg, changed: changed.map((o: any) => [o.objectId, o.idOperation, o.outputState, types[o.objectId]]) }, null, 2));
  if (te?.status?.success && pkg) {
    writeFileSync(PUBLISHED, toml.replace(/published-at\s*=\s*"[^"]+"/, `published-at = "${pkg}"`).replace(/version\s*=\s*\d+/, `version = ${version + 1}`));
    console.log(`Published.toml → published-at ${pkg}, version ${version + 1}`);
  }
}
