// council/runner — runs the four agents inside the compiler service (Render, kept warm), so they keep
// committing overnight without anyone's laptop. Flag FEATURE_COUNCIL=1 plus COUNCIL_KEY_<NAME> keys.
//
//  • Prices: DeepBook Predict's own MarketSettled events (a BTC market settles every minute), read via
//    Tatum — an on-chain price series that survives restarts.
//  • Every minute: recompute each agent's call on the current 15-minute window (the Polymarket-comparable one).
//  • Twice an hour (minutes 1–9 of each half hour): each agent with a call commits through the SAME commit path
//    users use (journal::commit + CONVICTION memory, origin=agent:<name>), with its OWN key and gas — never the
//    judge sponsor. Idempotent across instances: an agent that already committed this slot (chain events) skips.
//  • After agents settle: weights are recomputed from recalled memory and a COUNCIL memory is written.

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { snapStrike, getConfig } from '@mysten/deepbook-v3/predict';
import * as P from '../predict/predict.ts';
import { gql, recordExecution } from '../shared/tatum.ts';
import { crowdMarketFor } from '../crowd/polymarket.ts';
import { commitsBy } from '../memory/commit.ts';
import { remember, recallAll, recallForAddress } from '../memory/store.ts';
import { formatRecord, NS_PREFIX, num, str, type MemRecord } from '../memory/format.ts';
import { bucketStats } from '../memory/calibration.ts';
import { liveCompile, buildCommit, recordCommit, settledRows } from '../memory/service.ts';
import { AGENTS, SIGNALS, type AgentName, type AgentCall, type Sample } from './signals.ts';
import { councilWeights, councilPUp, weightsEqual, type AgentRecord } from './ensemble.ts';
import { council, onResolved } from './state.ts';

export const COUNCIL_NS = `${NS_PREFIX}-council`;
const SLOT_MS = 30 * 60_000;
const MIN_AGENT_MIST = 4_000_000n;
const PREDICT_TYPES = (getConfig('testnet') as any).predict?.packages?.predictV1 ?? (getConfig('testnet') as any).packages?.predictV1;

interface Agent { name: AgentName; kp: Ed25519Keypair; address: string }
let agents: Agent[] = [];
const lastSlot = new Map<string, number>();
let samples: Sample[] = [];
let crowdCache: { expiry: number; at: number; p: number | null } | null = null;

export function agentsFromEnv(env = process.env): Agent[] {
  const out: Agent[] = [];
  for (const name of AGENTS) {
    const sk = env[`COUNCIL_KEY_${name.toUpperCase()}`]?.trim();
    if (!sk) continue;
    try { const kp = Ed25519Keypair.fromSecretKey((decodeSuiPrivateKey(sk) as any).secretKey); out.push({ name, kp, address: kp.toSuiAddress() }); }
    catch { console.error(`[council] bad key for ${name}`); }
  }
  return out;
}

/** The last ~30 minutes of BTC settlement prices from Predict's MarketSettled events (one per expiry). */
async function settlementSeries(): Promise<Sample[]> {
  const r: any = await gql('testnet', `query($t:String!){ events(last: 40, filter:{type:$t}) { nodes { contents { json } } } }`, { t: `${PREDICT_TYPES}::config_events::MarketSettled` });
  if (r.errors?.length) throw new Error(r.errors[0].message ?? 'graphql error');
  const byT = new Map<number, number>();
  for (const n of r.data?.events?.nodes ?? []) {
    const j = n.contents?.json; const t = Number(j?.expiry), px = Number(j?.settlement_price) / 1e9;
    if (Number.isFinite(t) && px > 0) byT.set(t, px);
  }
  return [...byT].map(([t, px]) => ({ t, px })).sort((a, b) => a.t - b.t);
}

/** The Polymarket-comparable 15-minute window (ends on the quarter-hour), with runway to commit. */
async function councilWindow(now: number): Promise<P.LiveMarket | null> {
  const t = await P.tradeableMarkets(now);
  const q = t.filter((m) => m.expiryMs % 900_000 === 0 && m.expiryMs - now > 3 * 60_000 && m.expiryMs - now <= 15 * 60_000);
  return q.sort((a, b) => a.expiryMs - b.expiryMs)[0] ?? null;
}

/** Recompute every agent's call (each minute). */
export async function refreshCalls(now = Date.now()): Promise<{ window: P.LiveMarket | null; pv: P.PricerView | null; calls: AgentCall[] }> {
  samples = await settlementSeries().catch((e) => { council.lastError = `prices: ${(e as Error).message}`; return samples; });
  const window = await councilWindow(now).catch(() => null);
  let pv: P.PricerView | null = null, pMktUp: number | null = null, crowdUp: number | null = null;
  if (window?.referencePrice) {
    pv = await P.pricerFor(window, now).catch(() => null);
    if (pv) pMktUp = pv.bp.up(window.referencePrice);
    if (!crowdCache || crowdCache.expiry !== window.expiryMs || now - crowdCache.at > 120_000) {
      const cm = await crowdMarketFor(window.expiryMs).catch(() => null);
      crowdCache = { expiry: window.expiryMs, at: now, p: cm && !cm.closed && Number.isFinite(cm.p_up) ? cm.p_up : null };
    }
    crowdUp = crowdCache.p;
  }
  const inputs = { samples, now, pMktUp, crowdUp };
  // every agent's current call, keys or not (the Council page shows them live); only committing needs a key
  const calls = AGENTS.map((n) => SIGNALS[n](inputs)).filter((c): c is AgentCall => !!c);
  const ens = councilPUp(calls, council.weights);
  Object.assign(council, {
    calls, callsAt: now, pMktUp, pUp: ens?.pUp ?? null,
    edge: ens && pMktUp != null ? ens.pUp - pMktUp : null,
    window: window ? { marketId: window.id, expiryMs: window.expiryMs, ref: window.referencePrice } : null,
  });
  return { window, pv, calls };
}

async function suiBalance(owner: string): Promise<bigint> {
  const r: any = await gql('testnet', `query($a:SuiAddress!){ address(address:$a){ balance(coinType:"0x2::sui::SUI"){ totalBalance } } }`, { a: owner });
  return BigInt(r.data?.address?.balance?.totalBalance ?? 0);
}

/** One agent commits its current call on the Council window, through the user commit path, with its own key. */
async function commitAgent(a: Agent, call: AgentCall, window: P.LiveMarket, pv: P.PricerView): Promise<string> {
  if ((await suiBalance(a.address)) < MIN_AGENT_MIST) throw new Error(`${a.name} is out of testnet SUI (${a.address})`);
  const strike = snapStrike(window.referencePrice!, window.admissionTickSize, 'nearest');
  const order = P.directionalAt(call.side, strike, pv, `${a.name}: ${call.reason}`);
  const conv = { direction: call.side === 'up' ? 60 : -60, confidence: call.confidence, horizonCode: 3, volView: 50, capital: 5 };
  const c = await liveCompile(conv as any, { address: a.address, forceOrder: order, market: window, skipCouncil: true });
  const b = await buildCommit({ address: a.address, compileId: c.compileId, commit: 5, origin: `agent:${a.name}`, noSponsor: true });
  const { signature } = await a.kp.signTransaction(Uint8Array.from(Buffer.from(b.txBytes, 'base64')));
  const res = await P.executeSigned(b.txBytes, [signature]);
  const tx = res.Transaction ?? res.FailedTransaction ?? res;
  if (tx?.digest) recordExecution('testnet', tx.digest);
  if (!tx?.effects?.status?.success) throw new Error(`commit failed: ${tx?.effects?.status?.error ?? 'unknown'}`);
  await recordCommit({ address: a.address, text: b.text, digest: tx.digest, origin: `agent:${a.name}` });
  council.lastCommitAt = Date.now();
  return tx.digest;
}

/** Twice-hourly slot: minutes 1–9 of each half hour, agents staggered 40s apart, one at a time. */
let ticking = false;
export async function tick(now = Date.now()): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const { window, pv, calls } = await refreshCalls(now);
    const slot = Math.floor(now / SLOT_MS), into = now % SLOT_MS;
    for (const [i, a] of agents.entries()) {
      if (lastSlot.get(a.name) === slot || into < 60_000 + i * 40_000 || into > 9 * 60_000) continue;
      const mine = (await commitsBy(a.address).catch(() => [])).some((e) => e.committed_ms >= slot * SLOT_MS);
      if (mine) { lastSlot.set(a.name, slot); continue; }                          // another instance already did it
      const call = calls.find((c) => c.agent === a.name);
      if (!call || !window || !pv) { lastSlot.set(a.name, slot); console.log(`[council] ${a.name} abstains this slot${window ? '' : ' (no window)'}`); continue; }
      lastSlot.set(a.name, slot);
      try { const d = await commitAgent(a, call, window, pv); console.log(`[council] ${a.name} ${call.side} p=${call.pUp.toFixed(3)} → ${d}`); }
      catch (e) { council.lastError = `${a.name}: ${(e as Error).message}`; console.error('[council]', a.name, (e as Error).message); }
    }
  } catch (e) { council.lastError = (e as Error).message; console.error('[council] tick', (e as Error).message); }
  finally { ticking = false; }
}

// ---------------------------------------------------------------- learning: weights from memory
export async function agentRecords(fresh = false): Promise<AgentRecord[]> {
  const out: AgentRecord[] = [];
  for (const a of agents) {
    const st = bucketStats(settledRows(await recallForAddress(a.address, { fresh }).catch(() => [] as MemRecord[])));
    out.push({ agent: a.name, n: st.n, wins: st.wins, brier: st.brier.you });
  }
  return out;
}

let reweighTimer: ReturnType<typeof setTimeout> | null = null;
/** Recompute weights from recalled memory; write a COUNCIL memory when any agent's n changed. */
export async function reweigh(write = true): Promise<void> {
  const records = await agentRecords(true);
  const weights = councilWeights(records);
  const prevN = JSON.stringify(council.records.map((r) => [r.agent, r.n]));
  Object.assign(council, { records, weights });
  if (!write || !records.some((r) => r.n > 0) || JSON.stringify(records.map((r) => [r.agent, r.n])) === prevN) return;
  const fmt = (f: (r: AgentRecord) => string) => records.map((r) => `${r.agent}:${f(r)}`).join(',');
  await remember(COUNCIL_NS, formatRecord('COUNCIL', [
    ['weights', fmt((r) => (weights[r.agent] ?? 0).toFixed(3))], ['n', fmt((r) => String(r.n))],
    ['wins', fmt((r) => String(r.wins))], ['brier', fmt((r) => (r.brier == null ? 'na' : r.brier.toFixed(3)))],
    ['equal', weightsEqual(weights)], ['ts', Math.floor(Date.now() / 1000)],
  ]), { origin: 'council' });
}

/** COUNCIL memories, oldest first, as weight snapshots for the weights-over-time chart. */
export async function councilHistory(): Promise<{ ts: number; weights: Record<string, number>; n: Record<string, number>; brier: Record<string, number | null>; blob_id?: string }[]> {
  const recs = (await recallAll(COUNCIL_NS).catch(() => [] as MemRecord[])).filter((r) => r.type === 'COUNCIL');
  const map = (s: string | null, f: (v: string) => any) => Object.fromEntries((s ?? '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split(':'); return [k, f(v)]; }));
  return recs.map((r) => ({
    ts: num(r, 'ts') ?? 0, weights: map(str(r, 'weights'), Number), n: map(str(r, 'n'), Number),
    brier: map(str(r, 'brier'), (v) => (v === 'na' ? null : Number(v))), blob_id: r.blob_id,
  })).sort((a, b) => a.ts - b.ts);
}

// ---------------------------------------------------------------- on-chain passports (P4)
/**
 * Each agent claims its own soulbound ForecasterPassport with its own key and gas; afterwards it refreshes
 * at most every 6 hours, and only when its settled count changed (each refresh costs gas).
 */
async function agentPassports(): Promise<void> {
  if (process.env.FEATURE_ONCHAIN_PASSPORT !== '1') return;
  const { claimOrRefreshAs } = await import('../passport/onchain/routes.ts');
  const { passportOf } = await import('../passport/onchain/chain.ts');
  const { namespaceFor } = await import('../memory/format.ts');
  for (const a of agents) {
    try {
      const rec = council.records.find((r) => r.agent === a.name);
      if (!rec || rec.n < 1) continue;
      const cur: any = await passportOf(a.address, true).catch(() => null);
      if (cur && Number(cur.n_settled) === rec.n) continue;
      const r = await claimOrRefreshAs(a.kp, namespaceFor(a.address));
      console.log(`[council] ${a.name} passport ${r.action}${r.digest ? ' ' + r.digest : ''}${r.error ? ' error ' + r.error : ''}`);
    } catch (e) { console.error('[council] passport', a.name, (e as Error).message); }
  }
}

export function startCouncil(): void {
  if (process.env.FEATURE_COUNCIL !== '1' || process.env.OFFLINE === '1' || process.env.WATCHER === '0') return;
  agents = agentsFromEnv();
  if (!agents.length) { console.warn('[council] FEATURE_COUNCIL=1 but no COUNCIL_KEY_* set'); return; }
  council.enabled = true;
  council.agents = agents.map((a) => ({ name: a.name, address: a.address }));
  council.weights = Object.fromEntries(agents.map((a) => [a.name, 1 / agents.length]));
  onResolved((origin) => {
    if (!origin?.startsWith('agent:')) return;
    if (reweighTimer) clearTimeout(reweighTimer);                       // one reweigh per settled window
    reweighTimer = setTimeout(() => { reweigh().catch((e) => console.error('[council] reweigh', (e as Error).message)); }, 90_000);
  });
  reweigh(false).catch((e) => console.error('[council] initial weights', (e as Error).message));
  console.log(`[council] ${agents.length} agents: ${agents.map((a) => `${a.name}=${a.address.slice(0, 10)}…`).join(' ')}`);
  void tick();
  setInterval(() => { void tick(); }, 60_000).unref?.();
  setTimeout(() => { void agentPassports(); setInterval(() => { void agentPassports(); }, 6 * 3_600_000).unref?.(); }, 5 * 60_000).unref?.();
  // keep GET /council warm for visitors (its recalls and chain reads take ~10s cold)
  setTimeout(() => { import('./routes.ts').then((m) => { void m.warmCouncil(); setInterval(() => { void m.warmCouncil(); }, 45_000).unref?.(); }); }, 20_000).unref?.();
}

