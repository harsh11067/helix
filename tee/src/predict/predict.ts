// predict — DeepBook Predict v4 (2026-09-12 redeployment) through the Tatum chokepoint.
//
// Predict v4 replaced the OracleSVI/immediate-mint model HELIX was first built on:
// a position is now a QUEUED order (enqueue → a keeper fills it ~1s later at Pyth's
// signed price, or refunds it), markets are expiry windows of 1–20 min, and pricing
// comes from an on-chain pricer (forward + rolled Block-Scholes SVI). This module is
// the only place HELIX talks to Predict; every read goes through Tatum GraphQL.

import { predict, snapStrike, cost } from '@mysten/deepbook-v3/predict';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from '../shared/tatum.ts';
import type { MarketSnapshot } from '../shared/mockOracle.ts';
import { horizonYears } from '../shared/mockOracle.ts';

export const NETWORK = 'testnet' as const;
const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const MIN_RUNWAY_MS = 60_000;         // time to compile → review → sign → land (trading closes ~11s pre-expiry)
const HORIZON_TARGET_MIN = [3, 6, 12, 20];

let _pc: any = null;
/** Sui v2 GraphQL client (Tatum) extended with the Predict SDK. */
export function pc(): any {
  return (_pc ??= suiClient(NETWORK).$extend(predict({ network: NETWORK })));
}
export const quoteCoinType = (): string => pc().predict.cfg.quoteCoinType;

// ---------------------------------------------------------------- markets
export interface LiveMarket {
  id: string; expiryMs: number; minutesLeft: number;
  tickSize: number; admissionTickSize: number; referencePrice: number | null; mintPaused: boolean;
}
// Stale-while-revalidate: a compile never queues behind Tatum's 3 req/s for data a few seconds old.
// Fresh → cached. Older but within the limit → cached now plus ONE background refresh. Older → wait.
// (minutesLeft is recomputed from `now` by every caller; oracle ages come from the oracle's own timestamps.)
const MARKETS_FRESH_MS = 5000, MARKETS_MAX_STALE_MS = 30_000;
let marketsCache: { at: number; list: LiveMarket[] } | null = null;
let marketsInflight: Promise<LiveMarket[]> | null = null;
function refreshMarkets(): Promise<LiveMarket[]> {
  marketsInflight ??= (async () => {
    const at = Date.now();
    const raw = await pc().predict.read.markets();
    const list: LiveMarket[] = raw.map((m: any) => ({
      id: m.id, expiryMs: Number(m.expiryMs), minutesLeft: (Number(m.expiryMs) - at) / 60000,
      tickSize: Number(m.tickSize), admissionTickSize: Number(m.admissionTickSize),
      referencePrice: m.referencePrice == null ? null : Number(m.referencePrice), mintPaused: !!m.mintPaused,
    }));
    marketsCache = { at, list };
    return list;
  })().finally(() => { marketsInflight = null; });
  return marketsInflight;
}
export async function liveMarkets(now = Date.now()): Promise<LiveMarket[]> {
  const age = marketsCache ? now - marketsCache.at : Infinity;
  if (age < MARKETS_FRESH_MS) return marketsCache!.list;
  if (age < MARKETS_MAX_STALE_MS) { refreshMarkets().catch(() => {}); return marketsCache!.list; }
  return refreshMarkets();
}

/** Open windows (reference price set), unpaused, with time to sign and land. */
export async function tradeableMarkets(now = Date.now()): Promise<LiveMarket[]> {
  const all = await liveMarkets(now);
  return all
    .filter((m) => !m.mintPaused && m.referencePrice != null && m.expiryMs > now + MIN_RUNWAY_MS)
    .map((m) => ({ ...m, minutesLeft: (m.expiryMs - now) / 60000 }))
    .sort((a, b) => a.expiryMs - b.expiryMs);
}

/** The open market whose remaining time best matches the conviction's horizon. */
export async function pickMarket(horizonCode: number, now = Date.now()): Promise<LiveMarket> {
  const t = await tradeableMarkets(now);
  if (!t.length) throw new Error('no open DeepBook Predict BTC window with enough runway — retry in a few seconds');
  const target = HORIZON_TARGET_MIN[Math.max(0, Math.min(3, horizonCode | 0))];
  return t.slice().sort((a, b) =>
    Math.abs(a.minutesLeft - target) - Math.abs(b.minutesLeft - target) || b.expiryMs - a.expiryMs)[0];
}

// ---------------------------------------------------------------- pricer
export interface PricerView {
  forward: number;
  svi: { a: number; b: number; rho: number; m: number; sigma: number };
  sources: { pythSpotMs: number; blockScholesSpotMs: number; blockScholesForwardMs: number; blockScholesSviMs: number } | null;
  asOf: number;
  bp: any;   // BoardPricer: up/down/probability/range/strikeAtProbability
}
const PRICER_FRESH_MS = 3000, PRICER_MAX_STALE_MS = 15_000;
const pricerCache = new Map<string, { at: number; v: PricerView }>();
const pricerInflight = new Map<string, Promise<PricerView>>();
export async function pricerFor(m: LiveMarket, now = Date.now()): Promise<PricerView> {
  const hit = pricerCache.get(m.id);
  const age = hit ? now - hit.at : Infinity;
  if (age < PRICER_FRESH_MS) return hit!.v;
  let p = pricerInflight.get(m.id);
  if (!p) { p = readPricer(m).finally(() => pricerInflight.delete(m.id)); pricerInflight.set(m.id, p); }
  if (age < PRICER_MAX_STALE_MS) { p.catch(() => {}); return hit!.v; }   // the view carries its own source timestamps
  return p;
}
async function readPricer(m: LiveMarket): Promise<PricerView> {
  const now = Date.now();
  const p = await pc().predict.read.pricer({ underlying: 'BTC', expiryMs: m.expiryMs, marketId: m.id });
  // SDK 2.11: `asOf` is the per-source timestamp record {pythSpotMs, blockScholesSpotMs, blockScholesForwardMs, blockScholesSviMs}
  const src = p.sources ?? (p.asOf && typeof p.asOf === 'object' ? p.asOf : null);
  const ts = src ? Object.values(src).map(Number).filter(Number.isFinite) : [];
  const v: PricerView = { forward: p.forward, svi: p.svi, sources: src, asOf: ts.length ? Math.min(...ts) : Number(p.asOf ?? now), bp: p };
  pricerCache.set(m.id, { at: now, v });
  if (pricerCache.size > 50) pricerCache.clear();
  return v;
}

const feeCache = new Map<string, any>();
export async function feePolicy(m: LiveMarket): Promise<{ minEntry: number; maxEntry: number }> {
  let f = feeCache.get(m.id);
  if (!f) {
    f = await pc().predict.read.feePolicy({ underlying: 'BTC', expiryMs: m.expiryMs, marketId: m.id });
    feeCache.set(m.id, f);
  }
  return { minEntry: Number(f.minEntryProbability) / 1e9, maxEntry: Number(f.maxEntryProbability) / 1e9 };
}

/** Freshest SVI source age in seconds — a real, on-chain-sourced staleness figure. */
export function sviAgeSeconds(pv: PricerView, now = Date.now()): number | null {
  const ts = pv.sources?.blockScholesSviMs;
  return ts ? Math.max(0, Math.round((now - ts) / 1000)) : null;
}

/**
 * Legacy MarketSnapshot for the tested compiler core: spot = Predict's forward,
 * SVI = the pricer's rolled surface restated to the compiler's horizon T so
 * sviIV(svi, k) reproduces the real annualized IV.
 */
export function toSnapshot(pv: PricerView, m: LiveMarket, horizonCode: number, now = Date.now()): MarketSnapshot {
  const tReal = Math.max((m.expiryMs - now) / YEAR_MS, 1 / (365 * 24 * 60 * 2));
  const tUsed = horizonYears(horizonCode);
  const sc = tUsed / tReal;
  const age = sviAgeSeconds(pv, now);
  return {
    spot: pv.forward,
    svi: { a: pv.svi.a * sc, b: pv.svi.b * sc, rho: pv.svi.rho, m: pv.svi.m, sigma: pv.svi.sigma, T: tUsed },
    plpUtilizationBps: 0,
    orderbookDepth: 0,
    stale: age != null && age > 120,
  };
}

/** Annualized ATM IV straight from the rolled surface at the real remaining time. */
export function atmIvReal(pv: PricerView, m: LiveMarket, now = Date.now()): number {
  const tReal = Math.max((m.expiryMs - now) / YEAR_MS, 1e-9);
  const w = pv.svi.a + pv.svi.b * (pv.svi.rho * (0 - pv.svi.m) + Math.sqrt(pv.svi.m ** 2 + pv.svi.sigma ** 2));
  return Math.sqrt(Math.max(w, 1e-12) / tReal);
}

// ---------------------------------------------------------------- structure mapping
export type StructKind = 'directional' | 'bracketed_range' | 'range';
export interface PredictOrder {
  kind: StructKind;
  side: 'up' | 'down' | 'range';
  strike?: number; lower?: number; upper?: number;
  pMkt: number;                // market-implied win probability (the "Market" voice)
  ppcEst: number;              // indicative all-in price per $1 contract (fees estimated; exact at signing)
  label: string;
  rule: string;                // compact payout rule for memory (type,lo,hi,payout)
  note?: string;
}

/** The tested compiler picks a shape; Predict v4 can hold three. Map honestly. */
export function kindFor(selectedName: string, direction: number): { kind: StructKind; side: 'up' | 'down' | 'range'; note?: string } {
  const lean: 'up' | 'down' = direction >= 0 ? 'up' : 'down';
  switch (selectedName) {
    case 'Long Call': return { kind: 'directional', side: 'up' };
    case 'Long Put': return { kind: 'directional', side: 'down' };
    case 'Bull Call Spread': return { kind: 'bracketed_range', side: 'up' };
    case 'Bear Put Spread': return { kind: 'bracketed_range', side: 'down' };
    case 'Short Strangle':
    case 'Range Binary': return { kind: 'range', side: 'range' };
    case 'Long Straddle':
      return { kind: 'directional', side: lean, note: 'a two-sided bet needs two orders; expressed as one directional bet on your lean' };
    default: return { kind: 'directional', side: lean };
  }
}

/** A directional order at an exact (already snapped) strike — the Council asks "above the window's open?". */
export function directionalAt(side: 'up' | 'down', strike: number, pv: PricerView, note?: string): PredictOrder {
  const p = pv.bp.probability(strike, side);
  return {
    kind: 'directional', side, strike, pMkt: p, note, ppcEst: indicativePrice(p, [pv.bp.up(strike)]),
    label: `BTC ${side === 'up' ? 'above' : 'at or below'} ${fmtUsd(strike)} at expiry`,
    rule: `binary,${side},${strike},1`,
  };
}

/** Build a concrete Predict order for a structure kind, inside the market's entry band. */
export function buildOrder(
  kind: StructKind, side: 'up' | 'down' | 'range', confidence: number,
  pv: PricerView, m: LiveMarket, band: { minEntry: number; maxEntry: number }, note?: string,
): PredictOrder {
  const F = pv.forward, bp = pv.bp, adm = m.admissionTickSize;
  const lo = band.minEntry + 0.03, hi = band.maxEntry - 0.03;
  const clampP = (p: number) => Math.max(lo, Math.min(hi, p));
  if (kind === 'directional') {
    const s = side === 'down' ? 'down' : 'up';
    // a confident call takes a slightly out-of-the-money strike (bigger payout multiple)
    const pTarget = clampP(confidence >= 70 ? 0.42 : 0.5);
    const upTarget = s === 'up' ? pTarget : 1 - pTarget;
    let k = bp.strikeAtProbability(upTarget) ?? F;
    k = snapStrike(k, adm, 'nearest');
    const p = bp.probability(k, s);
    return {
      kind, side: s, strike: k, pMkt: p, note, ppcEst: indicativePrice(p, [bp.up(k)]),
      label: `BTC ${s === 'up' ? 'above' : 'at or below'} ${fmtUsd(k)} at expiry`,
      rule: `binary,${s},${k},1`,
    };
  }
  // Ranges. Predict admits a range only if the range's own probability AND each bound's
  // binary probability P(BTC > bound) sit inside the entry band (verified by on-chain dry
  // runs: a bracket anchored exactly at spot needs p = 0.25 exactly, so it can't be used).
  // So ranges are chosen by their bounds' probabilities, kept 3 points inside the band:
  // The high bound needs extra room: the chain's check includes fees, and a bound at
  // P≈0.70 was refused while 0.60 passed (dry runs, 2026-11-09).
  //   symmetric range  P(>lower)=0.64, P(>upper)=0.30  → p ≈ 0.34, centred on the forward
  //   upside bracket   0.59 / 0.29                       → p ≈ 0.30, centred above the forward
  //   downside bracket 0.64 / 0.34                       → p ≈ 0.30, centred below the forward
  const hiCap = band.maxEntry - 0.11, loCap = band.minEntry + 0.04;
  const [uLo0, uHi0] = kind === 'bracketed_range'
    ? (side === 'up' ? [0.59, 0.29] : [0.64, 0.34])
    : [0.64, 0.30];
  const uLo = Math.min(uLo0, hiCap), uHi = Math.max(uHi0, loCap);
  const strikeAt = (u: number) => bp.strikeAtProbability(clampP(u)) ?? F;
  const lower = snapStrike(strikeAt(uLo), adm, 'up');                       // round inward: keeps P(>lower) ≤ target
  const upper = Math.max(lower + adm, snapStrike(strikeAt(uHi), adm, 'down'));
  const p = bp.range(lower, upper);
  return {
    kind, side: 'range', lower, upper, pMkt: p, note, ppcEst: indicativePrice(p, [bp.up(lower), bp.up(upper)]),
    label: kind === 'bracketed_range'
      ? `BTC between ${fmtUsd(lower)} and ${fmtUsd(upper)} at expiry (${side === 'up' ? 'upside' : 'downside'} bracket)`
      : `BTC between ${fmtUsd(lower)} and ${fmtUsd(upper)} at expiry`,
    rule: `range,${lower},${upper},1`,
  };
}

/**
 * Indicative all-in price per $1 contract. Predict charges a Bernoulli trading fee per
 * order BOUND, so ranges (two bounds) cost far more than binaries. Fitted to on-chain
 * dry-run quotes (2026-11-09, 5–15 min windows): fee/premium ≈ 0.22 · Σ √(u(1−u)) / p,
 * u = P(BTC > bound). An estimate for display and Kelly odds only — the exact cost and
 * fees come from Predict's own plan when the user signs.
 */
export function indicativePrice(p: number, boundUps: number[]): number {
  const s = boundUps.reduce((a, u) => a + Math.sqrt(Math.max(u * (1 - u), 0)), 0);
  const feeRatio = 0.22 * s / Math.max(p, 0.05);
  return Math.min(0.99, p * (1 + feeRatio));
}

/** The same admission test the chain applies at placement (minus price drift until τ). */
export const fmtUsd = (x: number) => '$' + Number(x).toLocaleString('en-US', { maximumFractionDigits: 0 });

export function descriptorFor(m: LiveMarket, o: Pick<PredictOrder, 'side' | 'strike' | 'lower' | 'upper'>): any {
  const base = { underlying: 'BTC', expiryMs: m.expiryMs, marketId: m.id };
  return o.side === 'range'
    ? { ...base, side: 'range', lower: o.lower, upper: o.upper }
    : { ...base, side: o.side, strike: o.strike };
}

/** Did a settled order win? Mirrors the chain: payout iff settlement in (lower, upper]. */
export function orderWon(o: Pick<PredictOrder, 'side' | 'strike' | 'lower' | 'upper'>, settle: number): boolean {
  if (o.side === 'up') return settle > (o.strike as number);
  if (o.side === 'down') return settle <= (o.strike as number);
  return settle > (o.lower as number) && settle <= (o.upper as number);
}

// ---------------------------------------------------------------- accounts + tx
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

export async function accountState(owner: string): Promise<{ wrapperId: string; exists: boolean; balance: number }> {
  const wrapperId = pc().predict.wrapperIdFor(owner);
  try {
    const balance = await pc().predict.read.balance(owner);
    return { wrapperId, exists: true, balance: Number(balance) };
  } catch (e) {
    if (/not found/i.test((e as Error).message)) return { wrapperId, exists: false, balance: 0 };
    throw e;
  }
}

export async function walletQuoteBalance(owner: string): Promise<number> {
  const r = await suiClient(NETWORK).getBalance({ owner, coinType: quoteCoinType() });
  const raw = (r as any).balance?.balance ?? (r as any).balance?.totalBalance ?? (r as any).totalBalance ?? 0;
  return Number(raw) / 1e6;
}

/** Unsigned deposit tx (creates the Predict account on first use). */
export async function buildFundTx(owner: string, amountUsdc: number): Promise<{ txBytes: string; created: boolean }> {
  const acct = await accountState(owner);
  const tx: Transaction = pc().predict.tx.deposit(owner, amountUsdc, acct.exists ? undefined : { create: true });
  tx.setSenderIfNotSet(owner);
  const bytes = await tx.build({ client: suiClient(NETWORK) });
  return { txBytes: b64(bytes), created: !acct.exists };
}

export interface MintBuild {
  txBytes: string;
  plan: {
    accepting: boolean; refusal: string | null; cost: number; totalDebit: number; orderFee: number;
    potentialPayout: number; minPayout: number; pricePerContract: number; entryProbability: number;
    payoutMultiple: number; tauMs: string; lowerTick: string; higherTick: string; slippageCents: number;
  };
}

/**
 * Plan + enqueue a queued Predict mint, then append HELIX's own conviction object
 * (dna::new → strategy::create_strategy) to the SAME PTB, so one signature both
 * places the real Predict order and records the strategy on-chain.
 */
export async function buildMintTx(
  owner: string, m: LiveMarket, order: PredictOrder, amountUsdc: number,
  helix: { pkg: string; dna: any; attestationHex: string; capital: number },
): Promise<MintBuild> {
  const desc = descriptorFor(m, order);
  // Slippage ladder. Near expiry the SDK's 'auto' band widens to ~13-15¢ and the chain
  // refuses orders whose limit band spills outside the entry band (EOrderFailsLimits);
  // an explicit 6¢ passed every order shape in dry runs. Each attempt is simulated by
  // tx.build, so a refused attempt costs nothing on-chain.
  let lastErr: any = null;
  for (const slippageCents of [6, 'auto', 10] as const) {
    try {
      return await planAndBuild(owner, desc, order, amountUsdc, slippageCents, helix);
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error).message ?? '');
      const retryable = /EOrderFailsLimits|entry-band|MoveAbort|abort code/i.test(msg) || (e as any).code === 'entry-band';
      if (!retryable) throw e;
    }
  }
  throw lastErr;
}

async function planAndBuild(owner: string, desc: any, order: PredictOrder, amountUsdc: number, slippageCents: number | 'auto',
  helix: { pkg: string; dna: any; attestationHex: string; capital: number }): Promise<MintBuild> {
  const plan = await pc().predict.read.planMint(owner, desc, { amount: amountUsdc, slippageCents });
  const summary = {
    accepting: !!plan.accepting, refusal: plan.refusal ?? null,
    cost: Number(plan.quote?.cost ?? plan.budget), totalDebit: Number(plan.totalDebit), orderFee: Number(plan.orderFee),
    potentialPayout: Number(plan.potentialPayout), minPayout: Number(plan.minPayout),
    pricePerContract: Number(plan.pricePerContract), entryProbability: Number(plan.quote?.entryProbability ?? order.pMkt),
    payoutMultiple: Number(plan.payoutMultiple), tauMs: String(plan.timing?.tauMs ?? ''),
    lowerTick: String(plan.target?.lowerTick ?? ''), higherTick: String(plan.target?.higherTick ?? ''),
    slippageCents: Number(plan.slippage?.cents ?? (typeof slippageCents === 'number' ? slippageCents : NaN)),
  };
  if (!plan.accepting) {
    const err: any = new Error(`Predict refused the order now: ${plan.refusal}`);
    err.code = plan.refusal; err.plan = summary;
    throw err;
  }
  const { transaction } = await pc().predict.tx.enqueuePlan(owner, desc, plan);
  const tx: Transaction = transaction;
  appendHelixStrategy(tx, helix);
  tx.setSenderIfNotSet(owner);
  const bytes = await tx.build({ client: suiClient(NETWORK) });
  return { txBytes: b64(bytes), plan: summary };
}

export function appendHelixStrategy(tx: Transaction, h: { pkg: string; dna: any; attestationHex: string; capital: number }): void {
  const d = h.dna;
  const dna = tx.moveCall({
    target: `${h.pkg}::dna::new`,
    arguments: [
      tx.pure.bool(!!d.dirNegative), tx.pure.u8(d.dirMagnitude | 0), tx.pure.u8(d.confidence | 0),
      tx.pure.u16(d.horizonDays | 0), tx.pure.u8(d.volView | 0), tx.pure.u8(d.legCount | 0),
      tx.pure.u8(d.assetPairCode | 0), tx.pure.bool(!!d.usesOptions), tx.pure.bool(!!d.usesSpot),
      tx.pure.bool(!!d.usesMargin), tx.pure.u16(d.leverageX100 | 0),
      tx.pure.u8(d.entrySignalType | 0), tx.pure.u8(d.entryThreshold | 0),
      tx.pure.u8(d.exitSignalType | 0), tx.pure.u8(d.exitThreshold | 0),
      tx.pure.u8(d.regimeSensitivity | 0), tx.pure.u16(d.maxDrawdownBps | 0),
      tx.pure.bool(!!d.hedgeNeg), tx.pure.u16(d.hedgeDeltaMag | 0), tx.pure.u8(d.mutationCount | 0),
      tx.pure.vector('u8', (d.crossoverPoints || []).map((x: number) => x & 0xff)),
    ],
  });
  const att = Array.from(Buffer.from((h.attestationHex || '00').replace(/^0x/, ''), 'hex'));
  tx.moveCall({
    target: `${h.pkg}::strategy::create_strategy`,
    arguments: [dna, tx.pure.u64(BigInt(Math.max(1, Math.round(h.capital)))), tx.pure.vector('u8', att.length ? att : [0])],
  });
}

/** Execute signed bytes through Tatum and return effects + events. */
export async function executeSigned(txBytesB64: string, signatures: string[]): Promise<any> {
  const client: any = suiClient(NETWORK);
  const res = await client.executeTransaction({
    transaction: Uint8Array.from(Buffer.from(txBytesB64, 'base64')),
    signatures,
    include: { effects: true, events: true, objectTypes: true },
  });
  return res;
}

export async function waitTx(digest: string): Promise<any> {
  const client: any = suiClient(NETWORK);
  return client.waitForTransaction({ digest, include: { effects: true, events: true, objectTypes: true }, timeout: 60_000 });
}

export function decodeEnqueue(result: any): { recordId: string; marketId: string } | null {
  try {
    const tx = result?.Transaction ?? result?.transaction ?? result;
    const r = pc().predict.decode.enqueue({ events: tx?.events ?? [] });
    return { recordId: r.recordId.toString(), marketId: r.marketId };
  } catch { return null; }
}

export async function orderOutcome(m: { expiryMs: number; marketId: string }, recordId: string, timeoutMs = 45_000): Promise<{ outcome: string; orderId: string | null; quantity: number | null; detail: any }> {
  const r = await pc().predict.read.waitForOutcome(
    { underlying: 'BTC', expiryMs: m.expiryMs, marketId: m.marketId }, BigInt(recordId), { timeoutMs, pollMs: 1500 });
  const v: any = r.order?.view ?? null;
  const pos: any = v?.position ?? r.order?.record?.position ?? null;
  const orderId = pos?.orderId != null ? String(pos.orderId) : null;
  const quantity = pos?.quantity != null ? Number(pos.quantity) : (v?.quantity != null ? Number(v.quantity) : null);
  return { outcome: r.outcome, orderId, quantity, detail: v ? JSON.parse(JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? x.toString() : x)) : null };
}

export async function settlementOf(m: { expiryMs: number; marketId: string }): Promise<{ settled: boolean; price: number | null; priceRaw: bigint | null; tickSizeRaw: bigint }> {
  const s = await pc().predict.read.settlement({ underlying: 'BTC', expiryMs: m.expiryMs, marketId: m.marketId });
  return { settled: !!s.settled, price: s.settlementPrice, priceRaw: s.settlementPriceRaw, tickSizeRaw: s.tickSizeRaw };
}

export function payoutFromOrderId(orderId: string, priceRaw: bigint, tickSizeRaw: bigint): number {
  return Number(cost.settledPayout(BigInt(orderId), priceRaw, tickSizeRaw)) / 1e6;
}
