// live-check — test3.md P4 checks against the published helix_passport, with Lane B's own keys only.
//
//   node --env-file=../.env src/passport/onchain/scripts/live-check.ts --keyfile <path> [--execute]
//
// A fresh test key (0 SUI, generated into --keyfile on first run, never committed) claims and refreshes
// its passport with LANE_B_DEPLOYER as the GAS SPONSOR (the P4-12 shape: sender has no SUI). Its
// attestation comes from the interim signer (real stats: a fresh address has none). Then, simulate-only:
//   P4-07 replaying the mint attestation on refresh aborts · P4-08 a forged signature aborts ·
//   P4-09 someone else's attestation aborts · P4-10 TransferObjects of the passport fails ·
//   P4-11 gate_example pass / abort · duplicate claim aborts.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { suiClient, recordExecution } from '../../../shared/tatum.ts';
import { namespaceFor } from '../../../memory/format.ts';
import { keypairFrom, signAttestation } from '../attestation.ts';
import { mockAttestationFor } from '../mockAttestation.ts';
import { isSponsorablePassportCall } from '../sponsor.ts';
import { PASSPORT_PACKAGE, buildClaimTx, buildRefreshTx, passportOf, createdPassportId } from '../chain.ts';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const execute = args.includes('--execute');
const keyfile = opt('keyfile');
if (!keyfile) throw new Error('--keyfile required');
if (!existsSync(keyfile)) writeFileSync(keyfile, Ed25519Keypair.generate().getSecretKey() + '\n', { mode: 0o600 });
const T = keypairFrom(readFileSync(keyfile, 'utf8'));
const sponsor = keypairFrom(process.env.LANE_B_DEPLOYER!);
const tAddr = T.toSuiAddress(), sAddr = sponsor.toSuiAddress();
const ns = namespaceFor(tAddr);
const client: any = suiClient('testnet');
const unwrap = (r: any) => r?.Transaction ?? r?.FailedTransaction ?? r?.transaction ?? r;
const report: Record<string, unknown> = { tester: tAddr, ns, sponsor: sAddr, package: PASSPORT_PACKAGE };

async function sim(tx: Transaction): Promise<{ ok: boolean; error: string | null; gas?: any; bytes?: Uint8Array }> {
  try {
    const bytes = await tx.build({ client });
    const e = unwrap(await client.simulateTransaction({ transaction: bytes, include: { effects: true } }))?.effects;
    return { ok: !!e?.status?.success, error: e?.status?.error ? JSON.stringify(e.status.error).slice(0, 300) : null, gas: e?.gasUsed, bytes };
  } catch (err) { return { ok: false, error: String((err as Error).message).slice(0, 300) }; }
}
const sponsored = (tx: Transaction) => { tx.setGasOwner(sAddr); return tx; };

async function execSponsored(tx: Transaction, label: string) {
  sponsored(tx);
  const s = await sim(tx);
  const data = Transaction.from(s.bytes ?? new Uint8Array()).getData();
  report[`${label}_sponsor_predicate`] = s.bytes ? isSponsorablePassportCall(data) ?? 'allowed' : 'not built';
  report[`${label}_simulate`] = { ok: s.ok, error: s.error, gas: s.gas };
  if (!s.ok || !execute || !s.bytes) return null;
  const sigs = [(await T.signTransaction(s.bytes)).signature, (await sponsor.signTransaction(s.bytes)).signature];
  const r = unwrap(await client.executeTransaction({ transaction: s.bytes, signatures: sigs, include: { effects: true, objectTypes: true } }));
  recordExecution('testnet', r.digest);
  const done = unwrap(await client.waitForTransaction({ digest: r.digest, include: { effects: true, objectTypes: true }, timeout: 60_000 }));
  report[`${label}_digest`] = r.digest;
  report[`${label}_status`] = done?.effects?.status;
  report[`${label}_gas`] = done?.effects?.gasUsed;
  return done;
}

// ---- claim (sponsored) or refresh if already claimed
let current = await passportOf(tAddr, true);
const att1 = await mockAttestationFor(ns, tAddr);
report.attestation_fields = att1.fields;
if (!current) {
  const sent = budgeted(buildClaimTx(tAddr, att1));
  const done = await execSponsored(sent, 'claim');
  if (done) report.passport = createdPassportId(done);
  await new Promise((r) => setTimeout(r, 3000));
  current = await passportOf(tAddr, true);
}
report.onchain_after_claim = current;
function budgeted(tx: Transaction) { tx.setGasBudget(15_000_000); return tx; }

if (current) {
  // ---- refresh with a newer attestation (sponsored)
  const att2 = await mockAttestationFor(ns, tAddr);
  await execSponsored(budgeted(buildRefreshTx(tAddr, current.id, att2)), 'refresh');
  await new Promise((r) => setTimeout(r, 3000));
  const after = await passportOf(tAddr, true);
  report.onchain_after_refresh = after;

  // ---- P4-07 replay: the original claim attestation can never be applied again
  report.p4_07_replay_old = await sim(sponsored(budgeted(buildRefreshTx(tAddr, current.id, att1)))).then((r) => ({ ok: r.ok, error: r.error }));

  // ---- duplicate claim
  report.duplicate_claim = await sim(sponsored(budgeted(buildClaimTx(tAddr, att2)))).then((r) => ({ ok: r.ok, error: r.error }));

  // ---- P4-10 soulbound: TransferObjects needs `store`
  const tt = new Transaction(); tt.setSender(tAddr); tt.transferObjects([tt.object(current.id)], sAddr);
  report.p4_10_transfer = await sim(sponsored(budgeted(tt))).then((r) => ({ ok: r.ok, error: r.error }));

  // ---- P4-11 gate_example (simulate): passes for thresholds it meets, aborts for "calibrated" (Brier<2000, n>=10)
  const gate = (max: number, minN: number) => {
    const g = new Transaction(); g.setSender(tAddr);
    g.moveCall({ target: `${PASSPORT_PACKAGE}::gate_example::assert_calibrated`, arguments: [g.object(current!.id), g.pure.u64(max), g.pure.u64(minN)] });
    return sim(sponsored(budgeted(g))).then((r) => ({ ok: r.ok, error: r.error }));
  };
  report.p4_11_gate_lenient = await gate(10_001, 0);
  report.p4_11_gate_calibrated = await gate(2_000, 10);
}

// ---- P4-08 forgery: a payload signed by a random key, submitted by the tester (a fresh address: no passport check interferes)
const rogue = Ed25519Keypair.generate();
const forged = await signAttestation({ ...att1.fields, owner: tAddr, issued_ms: Date.now(), expires_ms: Date.now() + 600_000 }, rogue);
const u = Ed25519Keypair.generate(), uAddr = u.toSuiAddress();
const forgedForU = await signAttestation({ ...att1.fields, owner: uAddr, ns: namespaceFor(uAddr), issued_ms: Date.now(), expires_ms: Date.now() + 600_000 }, rogue);
report.p4_08_forged = await sim(sponsored(budgeted(buildClaimTx(uAddr, forgedForU)))).then((r) => ({ ok: r.ok, error: r.error }));
void forged;
// ---- P4-09 wrong owner: a fresh address submits the tester's valid attestation
report.p4_09_wrong_owner = await sim(sponsored(budgeted(buildClaimTx(uAddr, att1)))).then((r) => ({ ok: r.ok, error: r.error }));

console.log(JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
