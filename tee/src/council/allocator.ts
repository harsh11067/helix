// council/allocator — P3-08 (NEXT_BIG.md §4): memory buys memory. The Council's allocator is an agent with its
// own key that PAYS (MPP on Sui, HTTP 402 → pay → retry) to read a human forecaster's detailed record, then
// decides whether that forecaster may join the Council as a fifth voice: admit only if Brier ≤ 0.22 with n ≥ 8.
// The decision, the numbers it used and the payment digest are written as a VETTING memory.

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Mppx } from 'mppx/client';
import { sui } from '@suimpp/mpp/client';
import { suiClient, recordExecution } from '../shared/tatum.ts';
import { currency } from '../payments/mpp.ts';
import { remember, recallAll } from '../memory/store.ts';
import { formatRecord, str, num } from '../memory/format.ts';
import { COUNCIL_NS } from './runner.ts';

export const ADMIT_MAX_BRIER = 0.22;
export const ADMIT_MIN_N = 8;

export function decide(overall: { n?: number; brier?: { you?: number | null } } | null): { admit: boolean; reason: string } {
  const n = overall?.n ?? 0, b = overall?.brier?.you ?? null;
  if (n < ADMIT_MIN_N) return { admit: false, reason: `only ${n} settled calls (needs ${ADMIT_MIN_N})` };
  if (b == null) return { admit: false, reason: 'no Brier score yet' };
  return b <= ADMIT_MAX_BRIER
    ? { admit: true, reason: `Brier ${b.toFixed(3)} ≤ ${ADMIT_MAX_BRIER} over ${n} settled calls` }
    : { admit: false, reason: `Brier ${b.toFixed(3)} > ${ADMIT_MAX_BRIER} over ${n} settled calls — not calibrated enough to trust` };
}

export function allocatorKey(): Ed25519Keypair | null {
  const sk = process.env.COUNCIL_ALLOCATOR_KEY?.trim();
  try { return sk ? Ed25519Keypair.fromSecretKey((decodeSuiPrivateKey(sk) as any).secretKey) : null; } catch { return null; }
}

/** Pay for one forecaster's detailed record, decide, and remember the decision. */
export async function vet(candidate: string, apiBase: string): Promise<{ decision: string; reason: string; payment: string | null; n: number; brier: number | null }> {
  const kp = allocatorKey();
  if (!kp) throw new Error('COUNCIL_ALLOCATOR_KEY not configured');
  const client: any = suiClient('testnet');
  let payment: string | null = null;
  const mppx = Mppx.create({
    polyfill: false,
    methods: [sui({
      client, signer: kp, currency: currency(),
      execute: async (tx: any) => {
        const bytes = await tx.build({ client });
        const { signature } = await kp.signTransaction(bytes);
        const res = await client.executeTransaction({ transaction: bytes, signatures: [signature], include: { effects: true } });
        const t = res.Transaction ?? res.FailedTransaction ?? res;
        recordExecution('testnet', t.digest);
        if (!t.effects?.status?.success) throw new Error(t.effects?.status?.error ?? 'payment failed');
        await client.waitForTransaction({ digest: t.digest, timeout: 60_000 });
        payment = t.digest;
        return { digest: t.digest };
      },
    }) as any],
  } as any);
  const res = await (mppx as any).fetch(`${apiBase.replace(/\/+$/, '')}/api/v1/credibility/${encodeURIComponent(candidate)}`);
  if (res.status !== 200) throw new Error(`paid read failed: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  const d = decide(body.overall);
  const brier = body.overall?.brier?.you ?? null;
  await remember(COUNCIL_NS, formatRecord('VETTING', [
    ['agent', 'allocator'], ['candidate', body.namespace], ['decision', d.admit ? 'admit' : 'reject'], ['n', body.overall?.n ?? 0],
    ['brier', brier == null ? 'na' : brier.toFixed(3)], ['rule', `brier<=${ADMIT_MAX_BRIER},n>=${ADMIT_MIN_N}`], ['payment', payment ?? 'na'],
    ['text', d.reason], ['ts', Math.floor(Date.now() / 1000)],
  ]), { tx: payment, origin: 'agent:allocator' });
  console.log(`[council] allocator paid ${payment} to read ${body.namespace}: ${d.admit ? 'ADMIT' : 'REJECT'} (${d.reason})`);
  return { decision: d.admit ? 'admit' : 'reject', reason: d.reason, payment, n: body.overall?.n ?? 0, brier };
}

/** VETTING memories (newest first) for the Council page. */
export async function vettingHistory() {
  const recs = await recallAll(COUNCIL_NS).catch(() => []);
  return recs.filter((r) => r.type === 'VETTING').map((r) => ({
    candidate: str(r, 'candidate'), decision: str(r, 'decision'), n: num(r, 'n'), brier: num(r, 'brier'),
    reason: str(r, 'text'), payment: str(r, 'payment'), ts: num(r, 'ts'), blob_id: r.blob_id,
  })).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}
