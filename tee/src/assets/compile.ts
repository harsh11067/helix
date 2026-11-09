// assets/compile — compile and commit an ETH or SUI conviction (LANES.md §3). Commit mode only:
// there is no DeepBook Predict market for these assets (R1), so the call is "price above / at-or-below
// the current Pyth price at the window's expiry", hashed on Sui with journal::commit (oracle = the
// Pyth feed id, expiry = a quarter-hour window like BTC's) and scored later against Pyth.
//
// Voices: You · HELIX model (lognormal from the asset's own Pyth prices, labeled) · Crowd (ETH only,
// when Polymarket's window matches) · Market: n/a for this asset. Nothing is invented.

import { randomBytes } from 'node:crypto';
import type { Conviction } from '../shared/types.ts';
import { formatRecord, namespaceFor, bucketKey, bucketOfConviction, dirWord, volWord, pYou, p2, p3, str, type MemRecord } from '../memory/format.ts';
import { bucketStats, bestVoice, MIN_N, VOICE_LABEL, type SettledRow } from '../memory/calibration.ts';
import { recallForAddress } from '../memory/store.ts';
import { settledRows, registerPendingCommit } from '../memory/service.ts';
import { commitTx, sha256hex, sponsorAddress, SPONSOR_GAS_BUDGET, JOURNAL_PKG } from '../memory/commit.ts';
import { suiClient, gql } from '../shared/tatum.ts';
import { PYTH_FEEDS, ASSET_NAME, type PythAsset } from './config.ts';
import { pythLatest, pythSeries, unavailableReason, type PythPrice } from './pyth.ts';
import { realized, helixDirectional, type Realized } from './model.ts';
import { assetCrowd, type AssetCrowd } from './crowd.ts';

const HORIZON_TARGET_MIN = [3, 6, 12, 20];
const MIN_LEAD_MS = 5 * 60_000;
export const MAX_PRICE_AGE_S = 300;
const fmtUsd = (x: number) => (x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(4) : x.toPrecision(6));
const pxs = (x: number) => String(+x.toPrecision(9));

/** Quarter-hour windows 5–35 min ahead; the one closest to the horizon (BTC's targets, at least 5 min). */
export function pickWindow(horizonCode: number, nowMs: number): { expiryMs: number; minutesLeft: number } {
  const target = Math.max(5, HORIZON_TARGET_MIN[Math.max(0, Math.min(3, horizonCode | 0))]);
  const first = Math.ceil(nowMs / 900_000) * 900_000;
  const cands = [0, 1, 2].map((k) => first + k * 900_000).filter((e) => e - nowMs >= MIN_LEAD_MS && e - nowMs <= 35 * 60_000);
  const e = cands.sort((a, b) => Math.abs((a - nowMs) / 60_000 - target) - Math.abs((b - nowMs) / 60_000 - target) || a - b)[0];
  return { expiryMs: e, minutesLeft: (e - nowMs) / 60_000 };
}

// ---------------------------------------------------------------- memory block (same shape as BTC's)
export function assetMemoryBlock(recs: MemRecord[] | null, ns: string | null, conv: Conviction, asset: PythAsset, voicesNow: { you: number; helix: number | null; crowd: number | null }) {
  const conf01 = conv.confidence / 100;
  const bucket = `${asset}:${bucketKey(dirWord(conv.direction), conf01, volWord(conv.volView))}`;
  const base = { bucket, commit: conv.capital, suggested_commit: conv.capital, blob_ids: [] as string[], structure_suggestion: null };
  if (!recs) return { ...base, status: 'no_address' as const, n: 0, message: 'Connect a wallet to compile with your memory.' };
  const convByTx = new Map(recs.filter((r) => r.type === 'CONVICTION' && str(r, 'tx')).map((r) => [str(r, 'tx')!, r]));
  const rows: SettledRow[] = settledRows(recs).filter((r) => { const c = convByTx.get(r.tx); return !!c && bucketOfConviction(c) === bucket; });
  const st = bucketStats(rows);
  const lesson = recs.filter((r) => r.type === 'LESSON' && str(r, 'bucket') === bucket).pop();
  const cal = recs.filter((r) => r.type === 'CALIBRATION' && str(r, 'bucket') === bucket).pop();
  const blob_ids = [
    ...recs.filter((r) => (r.type === 'CONVICTION' || r.type === 'OUTCOME') && rows.some((x) => x.tx === str(r, 'tx'))).map((r) => r.blob_id!),
    ...(cal ? [cal.blob_id!] : []), ...(lesson ? [lesson.blob_id!] : []),
  ].filter(Boolean);
  const bv = bestVoice(st);
  const name = ASSET_NAME[asset];
  let message: string, guardian: string;
  if (st.n === 0) {
    message = `No settled ${asset} history in this setup yet — memory starts with this call.`;
    guardian = `Memory: no settled ${asset} calls in this setup yet — HELIX takes this conviction at face value.`;
  } else if (st.n < MIN_N) {
    message = `Only ${st.n} settled ${asset} conviction${st.n > 1 ? 's' : ''} in this setup — memory needs ${MIN_N} before it changes anything.`;
    guardian = `Memory: ${st.n} settled call${st.n > 1 ? 's' : ''} on ${name} in this setup (won ${st.wins}) — too few to act on yet.`;
  } else {
    const gap = st.gap_you ?? 0;
    const gapTxt = Math.abs(gap) < 0.05 ? 'your confidence has been about right here'
      : gap > 0 ? `your confidence runs ~${Math.round(gap * 100)} points hot here` : `your confidence runs ~${Math.round(-gap * 100)} points cold here`;
    message = `Learned from ${st.n} settled ${asset} convictions in ${bucket}.`;
    guardian = `Memory: last ${st.n} calls on ${name} in this setup — you won ${st.wins}; ${gapTxt}.${bv ? ` ${VOICE_LABEL[bv][0].toUpperCase()}${VOICE_LABEL[bv].slice(1)} has been most accurate (Brier ${(st.brier[bv] as number).toFixed(2)}).` : ''}`;
  }
  return {
    ...base, status: 'ok' as const, namespace: ns ?? undefined, n: st.n, wins: st.wins, message,
    voices: { you: { p: voicesNow.you, brier: st.brier.you }, market: { p: null, brier: null }, helix: { p: voicesNow.helix, brier: st.brier.helix }, crowd: { p: voicesNow.crowd, brier: st.brier.crowd } },
    gap_you: st.gap_you, posterior: st.posterior, lesson_text: lesson ? str(lesson, 'text') : null, best_voice: bv, guardian, blob_ids,
  };
}

// ---------------------------------------------------------------- compile
interface AssetCtx {
  id: string; at: number; asset: PythAsset; conv: Conviction; address: string | null; side: 'up' | 'down';
  strike: number; ref: PythPrice; window: { expiryMs: number; minutesLeft: number }; helix: number | null; m: Realized | null;
  crowd: AssetCrowd; you: number; memN: number;
}
const assetCompiles = new Map<string, AssetCtx>();

export async function assetCompile(conv: Conviction, asset: PythAsset, address: string | null, nowMs = Date.now()) {
  const why = unavailableReason(asset);
  if (why) throw new Error(why);
  const dir = dirWord(conv.direction);
  if (dir === 'neutral') throw new Error(`${asset} calls are directional (there is no ${asset} range market): move Direction toward bullish or bearish.`);
  const side: 'up' | 'down' = dir;
  const ref = await pythLatest(asset, nowMs);
  if (!ref) throw new Error(`no Pyth ${asset}/USD price available right now`);
  const age = Math.round(nowMs / 1000 - ref.publish_time);
  if (age > MAX_PRICE_AGE_S) throw new Error(`the latest Pyth ${asset}/USD price is ${age}s old — too stale to set a reference; retry shortly`);
  const window = pickWindow(conv.horizonCode, nowMs);
  const horizonS = (window.expiryMs - nowMs) / 1000;
  const series = await pythSeries(asset, nowMs / 1000 - 2 * 3600, nowMs).catch(() => []);
  const m = realized(series);
  const strike = ref.price;
  const helix = helixDirectional(side, ref.price, strike, horizonS, m);
  const crowd = await assetCrowd(asset, window.expiryMs, side, ref.price, strike);
  const you = pYou(conv.confidence);
  const recs = address ? await recallForAddress(address).catch(() => null) : null;
  const memory = address && !recs
    ? { bucket: `${asset}:?`, status: 'unavailable' as const, n: 0, commit: conv.capital, suggested_commit: conv.capital, blob_ids: [], message: 'Walrus Memory unreachable — compiled without memory.' }
    : assetMemoryBlock(recs, address ? namespaceFor(address) : null, conv, asset, { you, helix, crowd: crowd.status === 'ok' ? crowd.p : null });

  const expiryTxt = new Date(window.expiryMs).toISOString().slice(11, 16) + ' UTC';
  const call = { kind: 'directional', side, strike, label: `${asset} ${side === 'up' ? 'above' : 'at or below'} $${fmtUsd(strike)} at ${expiryTxt}`, rule: `binary,${side},${pxs(strike)},1` };
  const guardian: { cls: string; bad: boolean; t: string }[] = [
    age > 150
      ? { cls: 'oracle', bad: true, t: `Pyth ${asset}/USD price is ${age}s old — your reference may be off the market by now.` }
      : { cls: 'oracle', bad: false, t: `Reference: Pyth ${asset}/USD $${fmtUsd(ref.price)} ±${ref.conf.toPrecision(2)}, ${age}s old${ref.source === 'pyth-sui' ? ', verified on Sui by Pyth\'s contract' : ' (Pyth Hermes)'}.` },
    window.minutesLeft < 6
      ? { cls: 'time', bad: true, t: `Resolves in ${window.minutesLeft.toFixed(1)} min — commit soon; a commit after expiry is rejected on-chain.` }
      : { cls: 'time', bad: false, t: `Resolves at ${expiryTxt}, in ${window.minutesLeft.toFixed(0)} min.` },
    { cls: 'mode', bad: false, t: `${ASSET_NAME[asset]} has no DeepBook Predict market: this is a commit-mode call (its hash goes on Sui before expiry), scored against the first Pyth price at or after expiry${ref.source === 'pyth-sui' ? ' (on-chain Pyth updates land every ~2 min; the lag is recorded)' : ''}.` },
  ];
  if ((memory as any).guardian) guardian.push({ cls: 'memory', bad: memory.n >= MIN_N && ((memory as any).gap_you ?? 0) > 0.1, t: (memory as any).guardian });
  if (crowd.status === 'ok' && helix != null && Math.abs(helix - crowd.p) >= 0.15)
    guardian.push({ cls: 'crowd', bad: true, t: `Sources disagree: HELIX model ${(helix * 100).toFixed(0)}% vs Polymarket ${(crowd.p * 100).toFixed(0)}% for this outcome.` });

  const ctx: AssetCtx = { id: 'acmp_' + randomBytes(8).toString('hex'), at: nowMs, asset, conv, address, side, strike, ref, window, helix, m, crowd, you, memN: memory.n };
  assetCompiles.set(ctx.id, ctx);
  for (const [k, v] of assetCompiles) if (nowMs - v.at > 10 * 60_000) assetCompiles.delete(k);
  return {
    asset, mode: 'commit', compileId: ctx.id, spot: ref.price, window, call,
    price: { source: ref.source, feed_id: ref.feed_id, publish_time: ref.publish_time, age_s: age, conf: ref.conf, tx: ref.digest ?? null },
    voices: {
      you, market: null, helix, crowd: crowd.status === 'ok' ? crowd.p : null, crowd_slug: crowd.status === 'ok' ? crowd.slug : null, council: null,
      market_detail: { status: 'na', reason: `n/a for this asset (no DeepBook Predict ${asset} market)` },
      helix_detail: m
        ? { status: 'ok', label: `HELIX model: lognormal, realized vol ${(m.sigma_annual * 100).toFixed(0)}%/yr over ${m.n} Pyth prices (${Math.round(m.span_s / 60)} min)`, sigma_annual: m.sigma_annual, n: m.n }
        : { status: 'na', reason: `not enough ${asset} price history yet (needs 10 Pyth prices)` },
      crowd_detail: crowd,
      council_detail: { status: 'off' },
    },
    memory,
    guardian,
  };
}

// ---------------------------------------------------------------- commit (journal::commit with the Pyth feed as the oracle)
async function suiBalance(owner: string): Promise<bigint> {
  const r: any = await gql('testnet', `query($a:SuiAddress!){ address(address:$a){ balance(coinType:"0x2::sui::SUI"){ totalBalance } } }`, { a: owner });
  return BigInt(r.data?.address?.balance?.totalBalance ?? 0);
}

/** The CONVICTION body hashed on-chain (hash/tx/commit_tx are appended after signing, as for BTC). */
export function assetCommitBody(c: Pick<AssetCtx, 'asset' | 'conv' | 'side' | 'strike' | 'ref' | 'window' | 'helix' | 'crowd' | 'you' | 'memN'>, o: { commit: number; origin: string; at: number; nonce: string }): string {
  const feed = PYTH_FEEDS[c.asset];
  return formatRecord('CONVICTION', [
    ['mode', 'commit'], ['asset', c.asset], ['dir', c.side], ['conf', p2(c.conv.confidence / 100)],
    ['vol', volWord(c.conv.volView)], ['vol_view', Math.round(c.conv.volView)], ['horizon', `${Math.max(1, Math.round(c.window.minutesLeft))}m`],
    ['regime', 'na'], ['structure', 'directional'], ['side', c.side], ['order', `binary,${c.side},${pxs(c.strike)},1`],
    ['commit', p2(o.commit)], ['sugg_commit', p2(o.commit)], ['followed_memory', false], ['mem_n', c.memN],
    ['p_you', p3(c.you)], ['p_mkt', 'na'], ['p_hlx', c.helix == null ? 'na' : p3(c.helix)],
    ['p_crowd', c.crowd.status === 'ok' ? p3(c.crowd.p) : 'na'], ['crowd_slug', c.crowd.status === 'ok' ? c.crowd.slug : 'na'], ['p_council', 'na'],
    ['market', feed], ['expiry', Math.floor(c.window.expiryMs / 1000)], ['expiry_ms', c.window.expiryMs],
    ['fill', 'paper'], ['price', 'na'], ['qty', 'na'], ['cost', p2(o.commit)],
    ['alt_struct', 'na'], ['alt_cost', 'na'], ['alt_rule', 'na'],
    ['oracle', 'pyth'], ['feed_id', feed], ['ref_px', pxs(c.ref.price)], ['ref_publish_time', c.ref.publish_time], ['ref_source', c.ref.source], ['ref_tx', c.ref.digest ?? 'na'],
    ['origin', o.origin], ['ts', Math.floor(o.at / 1000)], ['nonce', o.nonce],
  ]);
}

export async function buildAssetCommit(body: { address: string; compileId: string; commit?: number; origin?: string; noSponsor?: boolean }) {
  const c = assetCompiles.get(body.compileId);
  if (!c) throw new Error('compile expired — recompile and try again');
  if (!/^0x[0-9a-f]{64}$/i.test(body.address || '')) throw new Error('invalid address');
  if (c.window.expiryMs < Date.now() + 60_000) throw new Error('this window settles too soon to commit — recompile for the next one');
  const commit = Number(body.commit ?? c.conv.capital);
  if (!Number.isFinite(commit) || commit < 1 || commit > 10_000) throw new Error('invalid commit');
  const at = Date.now();
  const origin = body.origin === 'cli' ? 'cli' : body.origin ?? 'browser';
  const text = assetCommitBody(c, { commit, origin, at, nonce: randomBytes(4).toString('hex') });
  const hash = sha256hex(text);
  const feed = PYTH_FEEDS[c.asset];
  const tx = commitTx(body.address, hash, feed, c.window.expiryMs);
  const sp = sponsorAddress();
  let sponsored = false;
  if (sp && !body.noSponsor && (await suiBalance(body.address).catch(() => 0n)) < 10_000_000n) { tx.setGasOwner(sp); tx.setGasBudget(SPONSOR_GAS_BUDGET); sponsored = true; }
  const txBytes = Buffer.from(await tx.build({ client: suiClient('testnet') as any })).toString('base64');
  const id = 'cmt_' + randomBytes(8).toString('hex');
  registerPendingCommit({ id, at, address: body.address.toLowerCase(), body: text, hash, market: { id: feed, expiryMs: c.window.expiryMs }, origin, reason: null });
  const order = { kind: 'directional', side: c.side, strike: c.strike, label: `${c.asset} ${c.side === 'up' ? 'above' : 'at or below'} $${fmtUsd(c.strike)}`, rule: `binary,${c.side},${pxs(c.strike)},1` };
  return { commitId: id, txBytes, text, hash, order, market: { id: feed, expiryMs: c.window.expiryMs }, journal: JOURNAL_PKG, sponsored, asset: c.asset };
}
