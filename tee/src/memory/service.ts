// service — Total Recall: compile with memory, record convictions, watch settlements,
// recompute calibration. Walrus Memory (mainnet) is the source of truth; Tatum is the
// only path to Sui (testnet for Predict, mainnet for memory proofs).

import { randomBytes, createHash } from 'node:crypto';
import { compile } from '../compiler/compiler.ts';
import type { Conviction, CompileResult } from '../shared/types.ts';
import * as P from '../predict/predict.ts';
import { recordForward, currentRegime, helixProbability, type RegimeView } from '../predict/regime.ts';
import {
  formatRecord, parseRecord, namespaceFor, bucketKey, bucketOfConviction, dirWord, volWord, pYou,
  num, str, p2, p3, signed2, type MemRecord,
} from './format.ts';
import {
  bucketStats, blendedProbability, suggestCommit, structureBias, bestVoice, lessonFor, oddsFromPrice,
  VOICE_LABEL, MIN_N, RANGEISH, type SettledRow, type BucketStats,
} from './calibration.ts';
import { remember, recallAll, recallForAddress, registerNamespace, registeredNamespaces, mode as memMode } from './store.ts';
import { crowdVoice, type CrowdView } from '../crowd/polymarket.ts';
import { witnessBtc } from '../shared/tatumRates.ts';

export const HELIX_PKG = process.env.HELIX_PACKAGE_ID ?? '0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3';
const FEE_APPROX = 1.12;   // indicative fee-inclusive price multiple (real fees come from the plan)

// ---------------------------------------------------------------- settled rows from memory
export function settledRows(recs: MemRecord[]): SettledRow[] {
  const outcomes = new Map<string, MemRecord>();
  for (const r of recs) if (r.type === 'OUTCOME' && str(r, 'tx')) outcomes.set(str(r, 'tx')!, r);
  const rows: SettledRow[] = [];
  for (const c of recs) {
    if (c.type !== 'CONVICTION') continue;
    const tx = str(c, 'tx'); const o = tx ? outcomes.get(tx) : undefined;
    const res = str(o, 'result');
    if (!o || (res !== 'WIN' && res !== 'LOSS')) continue;
    const pyou = num(c, 'p_you'), pm = num(c, 'p_mkt'), ph = num(c, 'p_hlx');
    if (pyou == null || pm == null || ph == null) continue;
    rows.push({
      tx: tx!, won: res === 'WIN' ? 1 : 0, p_you: pyou, p_mkt: pm, p_hlx: ph, p_crowd: num(c, 'p_crowd'),
      structure: str(c, 'structure') ?? 'directional', regime: str(c, 'regime'),
      commit: num(c, 'commit') ?? 0, payoff: num(o, 'payoff'), ts: num(c, 'ts') ?? 0,
    });
  }
  return rows;
}
const bucketOfRow = (recs: MemRecord[], tx: string) => {
  const c = recs.find((r) => r.type === 'CONVICTION' && str(r, 'tx') === tx);
  return c ? bucketOfConviction(c) : null;
};

// ---------------------------------------------------------------- compile with memory
export interface MemoryBlock {
  status: 'ok' | 'no_address' | 'unavailable';
  namespace?: string;
  bucket: string;
  n: number;
  wins?: number;
  message: string;
  voices?: Record<string, { p: number | null; brier: number | null }>;
  blended_p?: number | null;
  blend_basis?: string;
  gap_you?: number | null;
  posterior?: number;
  commit: number;
  suggested_commit: number;
  kelly?: { f_you: number; f_memory: number };
  structure_bias?: { prefer: string | null; post_range: number | null; post_dir: number | null; n_range: number; n_dir: number };
  structure_suggestion?: { kind: string; order: P.PredictOrder; reason: string } | null;
  lesson_text?: string | null;
  best_voice?: string | null;
  guardian?: string;
  blob_ids: string[];
}

interface CompileCtx {
  id: string; at: number; conv: Conviction; address: string | null;
  market: P.LiveMarket; order: P.PredictOrder; alt: P.PredictOrder | null; legacy: CompileResult;
  regime: RegimeView; voices: { you: number; market: number; helix: number; crowd: number | null; crowd_slug: string | null };
  memory: MemoryBlock;
}
const compiles = new Map<string, CompileCtx>();
const remember10min = (c: CompileCtx) => {
  compiles.set(c.id, c);
  for (const [k, v] of compiles) if (Date.now() - v.at > 10 * 60_000) compiles.delete(k);
};

const LEGACY_KIND: Record<string, P.StructKind> = {
  'Long Call': 'directional', 'Long Put': 'directional', 'Long Straddle': 'directional',
  'Bull Call Spread': 'bracketed_range', 'Bear Put Spread': 'bracketed_range',
  'Range Binary': 'range', 'Short Strangle': 'range',
};

function altFamilyOrder(kind: P.StructKind, conv: Conviction, pv: P.PricerView, m: P.LiveMarket, band: any): P.PredictOrder {
  // the best alternative from the OTHER family (directional ↔ range-ish)
  if (kind === 'directional') {
    const lean = dirWord(conv.direction);
    return lean === 'neutral'
      ? P.buildOrder('range', 'range', conv.confidence, pv, m, band)
      : P.buildOrder('bracketed_range', lean, conv.confidence, pv, m, band);
  }
  return P.buildOrder('directional', conv.direction >= 0 ? 'up' : 'down', conv.confidence, pv, m, band);
}

export async function memoryBlockFor(
  address: string | null, conv: Conviction, order: P.PredictOrder, voicesNow: { you: number; market: number; helix: number; crowd: number | null },
  regimeWord: string, legacy: CompileResult, altOrder: P.PredictOrder | null,
): Promise<MemoryBlock> {
  const conf01 = conv.confidence / 100;
  const bucket = bucketKey(dirWord(conv.direction), conf01, volWord(conv.volView));
  const base = { bucket, commit: conv.capital, suggested_commit: conv.capital, blob_ids: [] as string[] };
  if (!address) return { ...base, status: 'no_address', n: 0, message: 'Connect a wallet to compile with your memory.' };
  let recs: MemRecord[];
  try { recs = await recallForAddress(address); }
  catch (e) {
    return { ...base, status: 'unavailable', n: 0, message: `Walrus Memory unreachable (${(e as Error).message.slice(0, 80)}) — compiled without memory.` };
  }
  const ns = namespaceFor(address);
  const rows = settledRows(recs);
  const bRows = rows.filter((r) => bucketOfRow(recs, r.tx) === bucket);
  const stats: BucketStats = bucketStats(bRows);
  const regimeRows = rows.filter((r) => r.regime === regimeWord);
  const bias = structureBias(regimeRows);
  const blended = blendedProbability({ you: voicesNow.you, market: voicesNow.market, helix: voicesNow.helix, crowd: voicesNow.crowd }, stats);
  const b = oddsFromPrice(Math.min(0.97, order.pMkt * FEE_APPROX));
  const sugg = suggestCommit(conv.capital, voicesNow.you, stats, b);

  // structure: memory may prefer the other family — only offered, never applied silently
  let structure_suggestion: MemoryBlock['structure_suggestion'] = null;
  const fam = (k: P.StructKind) => (k === 'directional' ? 'directional' : 'range');
  if (bias.prefer && altOrder && bias.prefer !== fam(order.kind) && legacy.utilities) {
    const top = Math.max(...legacy.utilities);
    const altU = Math.max(...legacy.candidates.map((c, i) =>
      fam(LEGACY_KIND[c.name] ?? 'directional') === bias.prefer ? legacy.utilities![i] : -Infinity));
    if (altU >= 0.9 * top) {
      structure_suggestion = {
        kind: altOrder.kind, order: altOrder,
        reason: `In ${regimeWord.replace('_', ' ')} markets your ${bias.prefer === 'range' ? 'ranges' : 'directional bets'} settled better ` +
          `(${Math.round((bias.prefer === 'range' ? bias.post_range! : bias.post_dir!) * 100)}% vs ${Math.round((bias.prefer === 'range' ? bias.post_dir! : bias.post_range!) * 100)}%, n=${bias.n_range}/${bias.n_dir}).`,
      };
    }
  }

  const lessons = recs.filter((r) => r.type === 'LESSON' && str(r, 'bucket') === bucket);
  const cals = recs.filter((r) => r.type === 'CALIBRATION' && str(r, 'bucket') === bucket);
  const lastLesson = lessons[lessons.length - 1], lastCal = cals[cals.length - 1];
  const blob_ids = [
    ...recs.filter((r) => (r.type === 'CONVICTION' || r.type === 'OUTCOME') && bRows.some((x) => x.tx === str(r, 'tx'))).map((r) => r.blob_id!),
    ...(lastCal ? [lastCal.blob_id!] : []), ...(lastLesson ? [lastLesson.blob_id!] : []),
  ].filter(Boolean);

  const bv = bestVoice(stats);
  const dirPhrase = { up: 'bullish', down: 'bearish', neutral: 'neutral' }[dirWord(conv.direction)];
  const confPhrase = conf01 >= 0.7 ? 'high-confidence' : conf01 >= 0.4 ? 'mid-confidence' : 'low-confidence';
  const volPhrase = volWord(conv.volView) === 'calm' ? 'calm' : 'choppy';
  let message: string, guardian: string;
  if (stats.n === 0) {
    message = "No settled history in this setup yet — using the market's view.";
    guardian = `Memory: no settled ${confPhrase} ${dirPhrase} calls in ${volPhrase} BTC yet — HELIX takes this conviction at face value.`;
  } else if (stats.n < MIN_N) {
    message = `Only ${stats.n} settled conviction${stats.n > 1 ? 's' : ''} in this setup — memory needs ${MIN_N} before it changes anything.`;
    guardian = `Memory: ${stats.n} settled ${confPhrase} ${dirPhrase} call${stats.n > 1 ? 's' : ''} in ${volPhrase} BTC (won ${stats.wins}) — too few to act on yet.`;
  } else {
    const gap = stats.gap_you ?? 0;
    const gapTxt = Math.abs(gap) < 0.05 ? 'your confidence has been about right here'
      : gap > 0 ? `your confidence runs ~${Math.round(gap * 100)} points hot here` : `your confidence runs ~${Math.round(-gap * 100)} points cold here`;
    const bvTxt = bv ? ` ${VOICE_LABEL[bv][0].toUpperCase()}${VOICE_LABEL[bv].slice(1)} has been most accurate (Brier ${(stats.brier[bv] as number).toFixed(2)}).` : '';
    message = `Learned from ${stats.n} settled convictions in ${bucket}.`;
    guardian = `Memory: last ${stats.n} ${confPhrase} ${dirPhrase} calls in ${volPhrase} BTC — you won ${stats.wins}; ${gapTxt}.${bvTxt}`;
  }
  return {
    status: 'ok', namespace: ns, bucket, n: stats.n, wins: stats.wins, message,
    voices: {
      you: { p: voicesNow.you, brier: stats.brier.you }, market: { p: voicesNow.market, brier: stats.brier.market },
      helix: { p: voicesNow.helix, brier: stats.brier.helix }, crowd: { p: voicesNow.crowd, brier: stats.brier.crowd },
    },
    blended_p: blended.p, blend_basis: blended.basis, gap_you: stats.gap_you, posterior: stats.posterior,
    commit: conv.capital, suggested_commit: sugg.suggested, kelly: { f_you: sugg.f_you, f_memory: sugg.f_memory },
    structure_bias: bias, structure_suggestion,
    lesson_text: lastLesson ? (str(lastLesson, 'text') ?? null) : null,
    best_voice: bv, guardian, blob_ids,
  };
}

export interface GuardianLine { cls: string; bad: boolean; t: string }

export async function liveCompile(conv: Conviction, opts: { address?: string | null; currentEpoch?: number } = {}) {
  const now = Date.now();
  const market = await P.pickMarket(conv.horizonCode, now);
  let pv: P.PricerView;
  try { pv = await P.pricerFor(market, now); }
  catch (e) {
    const msg = (e as Error).message;
    if (/Stale|Unavailable|EBlockScholes|Pyth/i.test(msg)) throw new Error(`Volatility/price oracle stale — Predict's on-chain freshness gate blocked pricing (${msg.slice(0, 80)}). Retry in a few seconds.`);
    throw e;
  }
  const band = await P.feePolicy(market);
  recordForward(pv.forward, pv.svi.rho, now);
  const regime = currentRegime(now);
  const snap = P.toSnapshot(pv, market, conv.horizonCode, now);
  const legacy = compile(conv, opts.currentEpoch ?? 0, snap);
  const k = P.kindFor(legacy.selected.name, conv.direction);
  const order = P.buildOrder(k.kind, k.side, conv.confidence, pv, market, band, k.note);
  const alt = altFamilyOrder(order.kind, conv, pv, market, band);

  const crowd: CrowdView = await crowdVoice(market, order, pv).catch((e) => {
    console.warn('[crowd]', (e as Error).message, (e as any).cause?.code ?? '');
    return { status: 'unavailable', reason: (e as Error).message } as CrowdView;
  });
  const voices = {
    you: pYou(conv.confidence),
    market: order.pMkt,
    helix: helixProbability(order.pMkt, order.kind, order.side, regime),
    crowd: crowd.status === 'ok' ? crowd.p : null,
    crowd_slug: crowd.status === 'ok' ? crowd.slug : null,
  };
  const memory = await memoryBlockFor(opts.address ?? null, conv, order, voices, regime.word, legacy, alt);

  // ---- guardian: plain-language risk classes
  const guardian: GuardianLine[] = [];
  guardian.push({ cls: 'oracle', bad: false, t: `Volatility surface and BTC price passed Predict's on-chain freshness gate (priced ${new Date(pv.asOf || now).toISOString().slice(11, 19)} UTC).` });
  const mins = market.minutesLeft;
  guardian.push(mins < 3
    ? { cls: 'time', bad: true, t: `Resolves in ${mins.toFixed(1)} min — fees rise near expiry and trading stops ~11s before it.` }
    : { cls: 'time', bad: false, t: `Resolves in ${mins.toFixed(0)} min — runway to sign and land.` });
  const edge = Math.min(order.pMkt - band.minEntry, band.maxEntry - order.pMkt);
  guardian.push(edge < 0.05
    ? { cls: 'band', bad: true, t: `Entry price ${(order.pMkt * 100).toFixed(0)}¢ is near Predict's ${Math.round(band.minEntry * 100)}–${Math.round(band.maxEntry * 100)}¢ entry band — a small move can get the order refunded.` }
    : { cls: 'band', bad: false, t: `Entry price ${(order.pMkt * 100).toFixed(0)}¢ sits inside Predict's ${Math.round(band.minEntry * 100)}–${Math.round(band.maxEntry * 100)}¢ entry band.` });
  if (memory.guardian) guardian.push({ cls: 'memory', bad: memory.n >= MIN_N && (memory.gap_you ?? 0) > 0.1, t: memory.guardian });
  if (crowd.status === 'ok' && Math.abs(order.pMkt - crowd.p) >= 0.10) {
    guardian.push({ cls: 'crowd', bad: true, t: `Sources disagree: Predict ${(order.pMkt * 100).toFixed(0)}% vs Polymarket ${(crowd.p * 100).toFixed(0)}% for this outcome.` });
  }
  const witness = await witnessBtc(pv.forward).catch(() => null);
  if (witness && witness.status === 'ok' && witness.diff_bps != null) {
    const lim = Number(process.env.WITNESS_BPS ?? 50);
    guardian.push(Math.abs(witness.diff_bps) > lim
      ? { cls: 'witness', bad: true, t: `Price sources disagree by ${Math.abs(witness.diff_bps).toFixed(0)} bps: Predict forward ${P.fmtUsd(pv.forward)} vs Tatum ${P.fmtUsd(witness.tatum_usd!)} (Tatum price ${witness.tatum_age_s}s old).` }
      : { cls: 'witness', bad: false, t: `Independent check: Tatum BTC/USD ${P.fmtUsd(witness.tatum_usd!)} is within ${Math.abs(witness.diff_bps).toFixed(0)} bps of Predict (${witness.tatum_age_s}s old).` });
  }

  const ctx: CompileCtx = {
    id: 'cmp_' + randomBytes(8).toString('hex'), at: now, conv, address: opts.address ?? null,
    market, order, alt, legacy, regime, voices, memory,
  };
  remember10min(ctx);
  return {
    ...legacy,
    compileId: ctx.id,
    spot: pv.forward,
    ivAtm: P.atmIvReal(pv, market, now),
    predict: {
      network: P.NETWORK, market: { id: market.id, expiryMs: market.expiryMs, minutesLeft: market.minutesLeft, referencePrice: market.referencePrice, admissionTickSize: market.admissionTickSize },
      forward: pv.forward, band, order, alt, quoteCoinType: P.quoteCoinType(),
    },
    regime: { name: regime.regime, word: regime.word, confidence: regime.confidence, features: regime.features, label: 'HELIX regime model (heuristic)' },
    voices: { ...voices, crowd_detail: crowd },
    witness,
    memory,
    guardian,
  };
}

// ---------------------------------------------------------------- mint: build → execute → remember
interface MintCtx {
  id: string; at: number; compileId: string; address: string; order: P.PredictOrder; market: P.LiveMarket;
  commit: number; followed_memory: boolean; usedMemoryStructure: boolean; plan: P.MintBuild['plan']; origin: string;
}
const mints = new Map<string, MintCtx>();

export async function buildMint(body: { address: string; compileId: string; commit?: number; useMemoryStructure?: boolean; origin?: string }) {
  const c = compiles.get(body.compileId);
  if (!c) throw new Error('compile expired — recompile and try again');
  if (!/^0x[0-9a-f]{64}$/i.test(body.address || '')) throw new Error('invalid address');
  const commit = Number(body.commit ?? c.conv.capital);
  if (!Number.isFinite(commit) || commit < 1 || commit > 10_000) throw new Error('invalid commit');
  const useAlt = !!body.useMemoryStructure && !!c.memory.structure_suggestion;
  const order = useAlt ? c.memory.structure_suggestion!.order : c.order;
  const followed = useAlt || (c.memory.n >= MIN_N && Math.abs(commit - c.memory.suggested_commit) < 0.005 && c.memory.suggested_commit !== c.conv.capital);
  const built = await P.buildMintTx(body.address, c.market, order, commit, {
    pkg: HELIX_PKG, dna: c.legacy.dna, attestationHex: c.legacy.attestation.signature, capital: commit,
  });
  const id = 'mint_' + randomBytes(8).toString('hex');
  mints.set(id, { id, at: Date.now(), compileId: c.id, address: body.address, order, market: c.market, commit, followed_memory: followed, usedMemoryStructure: useAlt, plan: built.plan, origin: body.origin ?? 'browser' });
  return { mintId: id, txBytes: built.txBytes, plan: built.plan, order, market: { id: c.market.id, expiryMs: c.market.expiryMs } };
}

export async function buildFund(body: { address: string; amount: number }) {
  if (!/^0x[0-9a-f]{64}$/i.test(body.address || '')) throw new Error('invalid address');
  const amt = Number(body.amount);
  if (!Number.isFinite(amt) || amt < 1 || amt > 100_000) throw new Error('invalid amount');
  return P.buildFundTx(body.address, amt);
}

/** Called after a mint lands: wait for the keeper's fill, then write the CONVICTION memory. */
export async function onMintExecuted(mintId: string, digest: string, result: any): Promise<{ recordId: string | null }> {
  const mc = mints.get(mintId);
  const enq = P.decodeEnqueue(result);
  if (!mc) return { recordId: enq?.recordId ?? null };
  const c = compiles.get(mc.compileId);
  void (async () => {
    try {
      let fill = { outcome: 'unknown', orderId: null as string | null, quantity: null as number | null, detail: null as any };
      if (enq) fill = await P.orderOutcome({ expiryMs: mc.market.expiryMs, marketId: mc.market.id }, enq.recordId).catch(() => fill);
      await writeConviction(mc, c, digest, enq?.recordId ?? null, fill);
    } catch (e) { console.error('[memory] conviction write failed', digest, (e as Error).message); }
  })();
  return { recordId: enq?.recordId ?? null };
}

async function writeConviction(mc: MintCtx, c: CompileCtx | undefined, digest: string, recordId: string | null, fill: { outcome: string; orderId: string | null; quantity: number | null }) {
  const conv = c?.conv;
  if (!conv) throw new Error('compile context lost');
  const ns = namespaceFor(mc.address);
  const o = mc.order;
  const pHlx = mc.usedMemoryStructure ? helixProbability(o.pMkt, o.kind, o.side, c!.regime) : c!.voices.helix;
  const alt = mc.usedMemoryStructure ? c!.order : c!.alt;
  const fillWord = fill.outcome === 'filled' || fill.outcome === 'closed' || fill.outcome === 'gone' ? 'filled' : fill.outcome;
  const text = formatRecord('CONVICTION', [
    ['tx', digest], ['asset', 'BTC'], ['dir', dirWord(conv.direction)], ['conf', p2(conv.confidence / 100)],
    ['vol', volWord(conv.volView)], ['vol_view', Math.round(conv.volView)], ['horizon', `${Math.max(1, Math.round(mc.market.minutesLeft))}m`],
    ['regime', c!.regime.word], ['structure', o.kind], ['side', o.side], ['order', o.rule],
    ['commit', p2(mc.commit)], ['sugg_commit', p2(c!.memory.suggested_commit)], ['followed_memory', mc.followed_memory],
    ['mem_n', c!.memory.n],
    ['p_you', p3(c!.voices.you)], ['p_mkt', p3(o.pMkt)], ['p_hlx', p3(pHlx)],
    ['p_crowd', c!.voices.crowd == null ? 'na' : p3(c!.voices.crowd)], ['crowd_slug', c!.voices.crowd_slug ?? 'na'],
    ['market', mc.market.id], ['expiry', Math.floor(mc.market.expiryMs / 1000)], ['record', recordId ?? 'na'],
    ['fill', fillWord], ['order_id', fill.orderId ?? 'na'], ['qty', fill.quantity ?? mc.plan.potentialPayout],
    ['cost', p2(mc.plan.totalDebit)],
    ['alt_struct', alt?.kind ?? 'na'], ['alt_cost', alt ? p3(Math.min(0.97, alt.pMkt * FEE_APPROX)) : 'na'], ['alt_rule', alt?.rule ?? 'na'],
    ['origin', mc.origin], ['ts', Math.floor(mc.at / 1000)],
  ]);
  await remember(ns, text, { tx: digest, origin: mc.origin });
  await registerNamespace(ns).catch((e) => console.error('[memory] registry write failed', (e as Error).message));
  if (fillWord === 'filled') pending.set(digest, { ns, rec: parseRecord(text)! });
}

// ---------------------------------------------------------------- settlement watcher
const pending = new Map<string, { ns: string; rec: MemRecord }>();
let watcherStarted = false;

export async function rebuildPending(): Promise<number> {
  const nss = await registeredNamespaces();
  for (const ns of nss) {
    const recs = await recallAll(ns, { fresh: true });
    const done = new Set(recs.filter((r) => r.type === 'OUTCOME').map((r) => str(r, 'tx')));
    for (const r of recs) {
      const tx = str(r, 'tx');
      if (r.type === 'CONVICTION' && tx && str(r, 'fill') === 'filled' && !done.has(tx)) pending.set(tx, { ns, rec: r });
    }
  }
  return pending.size;
}

function orderFromRule(rule: string | null): Pick<P.PredictOrder, 'side' | 'strike' | 'lower' | 'upper'> | null {
  if (!rule) return null;
  const [type, a, b] = rule.split(',');
  if (type === 'binary') return { side: a as 'up' | 'down', strike: Number(b) };
  if (type === 'range') return { side: 'range', lower: Number(a), upper: Number(b) };
  return null;
}

export async function resolveConviction(ns: string, conv: MemRecord): Promise<{ status: string; outcome?: string }> {
  const tx = str(conv, 'tx')!;
  const expiry = num(conv, 'expiry'), marketId = str(conv, 'market');
  if (!expiry || !marketId) return { status: 'bad_record' };
  if (Date.now() < expiry * 1000 + 4000) return { status: 'not_expired' };
  const s = await P.settlementOf({ expiryMs: expiry * 1000, marketId });
  if (!s.settled || s.price == null) return { status: 'not_settled' };
  // dedupe across restarts / multiple watchers: Walrus Memory is the record of what was written
  const recs = await recallAll(ns, { fresh: true });
  if (recs.some((r) => r.type === 'OUTCOME' && str(r, 'tx') === tx)) { pending.delete(tx); return { status: 'already_resolved' }; }

  const order = orderFromRule(str(conv, 'order'));
  if (!order) return { status: 'bad_record' };
  const qty = num(conv, 'qty') ?? 0;
  const costPaid = num(conv, 'cost') ?? num(conv, 'commit') ?? 0;
  const orderId = str(conv, 'order_id');
  let payout: number;
  if (orderId && s.priceRaw != null) payout = P.payoutFromOrderId(orderId, s.priceRaw, s.tickSizeRaw);
  else payout = P.orderWon(order, s.price) ? qty : 0;
  const won = payout > 0;
  const payoff = payout - costPaid;

  // W3 counterfactual: what following memory's size (and its structure, if it preferred another) would have made
  const sugg = num(conv, 'sugg_commit'), commit = num(conv, 'commit') ?? costPaid, memN = num(conv, 'mem_n') ?? 0;
  const altRule = orderFromRule(str(conv, 'alt_rule')), altCost = num(conv, 'alt_cost');
  let alt_payoff: number | null = null, memory_pnl: number | null = null;
  if (altRule && altCost && sugg) alt_payoff = (P.orderWon(altRule, s.price) ? sugg / altCost : 0) - sugg;
  if (sugg && commit) memory_pnl = payoff * (sugg / commit);

  const witness = await witnessBtc(s.price).catch(() => null);
  const strikeTxt = order.side === 'range' ? `${order.lower}-${order.upper}` : String(order.strike);
  const text = formatRecord('OUTCOME', [
    ['tx', tx], ['result', won ? 'WIN' : 'LOSS'], ['payout', p2(payout)], ['cost', p2(costPaid)], ['payoff', signed2(payoff)],
    ['settle_px', p2(s.price)], ['strike_px', strikeTxt],
    ['witness_usd', witness?.status === 'ok' ? p2(witness.tatum_usd) : 'na'],
    ['alt_payoff', signed2(alt_payoff)], ['memory_pnl', signed2(memory_pnl)], ['mem_n', memN],
    ['ts', expiry],
  ]);
  await remember(ns, text, { tx, origin: 'watcher' });
  pending.delete(tx);

  // recompute the bucket's calibration from memory (plus the record just written)
  const after = [...recs, parseRecord(text)!];
  const bucket = bucketOfConviction(conv);
  if (bucket) {
    const rows = settledRows(after).filter((r) => bucketOfRow(after, r.tx) === bucket);
    const st = bucketStats(rows);
    const cal = formatRecord('CALIBRATION', [
      ['bucket', bucket], ['n', st.n], ['wins', st.wins], ['mean_p_you', p3(st.mean_p_you)], ['realized', p3(st.realized)],
      ['gap_you', signed2(st.gap_you)], ['brier_you', p3(st.brier.you)], ['brier_mkt', p3(st.brier.market)],
      ['brier_hlx', p3(st.brier.helix)], ['brier_crowd', p3(st.brier.crowd)], ['n_crowd', st.n_crowd],
      ['posterior', p3(st.posterior)], ['pnl', signed2(st.pnl)], ['ts', expiry],
    ]);
    await remember(ns, cal, { tx, origin: 'watcher' });
    const regimeWord = str(conv, 'regime');
    const bias = structureBias(settledRows(after).filter((r) => r.regime === regimeWord));
    const lesson = lessonFor(bucket, st, bias);
    const prevLesson = after.filter((r) => r.type === 'LESSON' && str(r, 'bucket') === bucket).pop();
    if (lesson && str(prevLesson, 'text') !== lesson) {
      await remember(ns, formatRecord('LESSON', [['bucket', bucket], ['n', st.n], ['text', lesson], ['ts', expiry]]), { tx, origin: 'watcher' });
    }
  }
  return { status: 'resolved', outcome: won ? 'WIN' : 'LOSS' };
}

export async function watcherTick(): Promise<void> {
  for (const [tx, { ns, rec }] of [...pending]) {
    try {
      const r = await resolveConviction(ns, rec);
      if (r.status === 'resolved') console.log(`[watcher] ${tx} → ${r.outcome}`);
    } catch (e) { console.error('[watcher]', tx, (e as Error).message); }
  }
}

export function startWatcher(intervalMs = 20_000): void {
  if (watcherStarted || process.env.OFFLINE === '1' || memMode() !== 'mainnet') return;
  watcherStarted = true;
  rebuildPending().then((n) => console.log(`[watcher] started; ${n} pending conviction(s) rebuilt from Walrus Memory`))
    .catch((e) => console.error('[watcher] rebuild failed', (e as Error).message));
  setInterval(() => { void watcherTick(); }, intervalMs).unref?.();
}
export const pendingCount = () => pending.size;

/** Manual recovery: resolve one conviction by digest. */
export async function resolveByDigest(address: string, digest: string) {
  const ns = namespaceFor(address);
  const recs = await recallAll(ns, { fresh: true });
  const c = recs.find((r) => r.type === 'CONVICTION' && str(r, 'tx') === digest);
  if (!c) throw new Error('no CONVICTION memory for that digest in this namespace');
  return resolveConviction(ns, c);
}

// ---------------------------------------------------------------- read APIs
export async function timelineFor(address: string) {
  const ns = namespaceFor(address);
  const recs = await recallForAddress(address);
  const rows = settledRows(recs);
  const buckets = new Map<string, SettledRow[]>();
  for (const r of rows) { const b = bucketOfRow(recs, r.tx); if (b) (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(r); }
  const overall = bucketStats(rows);
  return {
    namespace: ns,
    memory_network: memMode() === 'mainnet' ? 'walrus-mainnet' : memMode(),
    count: recs.length,
    timeline: recs.map((r) => ({ type: r.type, blob_id: r.blob_id, created_at: r.created_at, fields: r.f, text: r.text })),
    overall,
    buckets: [...buckets].map(([bucket, rs]) => ({ bucket, ...bucketStats(rs) })),
    reliability: reliability(rows),
  };
}

/** Stated-confidence bins vs realized win rate (reliability diagram). */
function reliability(rows: SettledRow[]) {
  const bins = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0001]];
  return bins.map(([lo, hi]) => {
    const rs = rows.filter((r) => r.p_you >= lo && r.p_you < hi);
    return { lo, hi, n: rs.length, stated: rs.length ? rs.reduce((a, r) => a + r.p_you, 0) / rs.length : null, realized: rs.length ? rs.filter((r) => r.won).length / rs.length : null };
  });
}

export async function dividendFor(address: string) {
  const recs = await recallForAddress(address);
  const outs = new Map(recs.filter((r) => r.type === 'OUTCOME').map((r) => [str(r, 'tx'), r]));
  const rows: any[] = [];
  for (const c of recs.filter((r) => r.type === 'CONVICTION')) {
    const o = outs.get(str(c, 'tx'));
    if (!o || (num(c, 'mem_n') ?? 0) < MIN_N) continue;     // only while memory had enough history
    const actual = num(o, 'payoff'), mem = num(o, 'memory_pnl');
    if (actual == null || mem == null) continue;
    rows.push({ tx: str(c, 'tx'), ts: num(c, 'ts'), actual_pnl: actual, memory_pnl: mem, commit: num(c, 'commit'), sugg_commit: num(c, 'sugg_commit') });
  }
  rows.sort((a, b) => a.ts - b.ts);
  const actual_pnl = rows.reduce((a, r) => a + r.actual_pnl, 0), memory_pnl = rows.reduce((a, r) => a + r.memory_pnl, 0);
  return { n: rows.length, actual_pnl, memory_pnl, dividend: memory_pnl - actual_pnl, rows, caveat: 'counterfactual; ignores fills and slippage' };
}

export async function credibilityFor(address: string) {
  const t = await timelineFor(address);
  const lessons = t.timeline.filter((r) => r.type === 'LESSON').map((r) => ({ bucket: r.fields.bucket, text: r.fields.text, blob_id: r.blob_id }));
  return { namespace: t.namespace, n: t.overall.n, overall: t.overall, buckets: t.buckets, lessons, memory_network: t.memory_network };
}

export const hashTx = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
