// assets/pyth — signed, timestamped Pyth prices for ETH and SUI (LANES.md §3).
//
// Two sources, same rule ("the first Pyth price with publish_time >= t", Hermes' own definition for
// GET /v2/updates/price/{publish_time}):
//   1. Hermes (pyth-hermes): exact, when PYTH_API_KEY is set (Hermes answers 401 without a key).
//   2. Pyth on Sui (pyth-sui): every PriceFeedUpdateEvent emitted by Pyth's Sui contract, which verifies
//      the Wormhole-signed update on-chain before storing it. Keyless, read through Tatum. Updates land
//      every ~2 min for SUI/USD on testnet; ETH/USD is not pushed there (0 updates in 300 events checked),
//      so ETH needs the Hermes key. Each on-chain price carries the digest of the tx that verified it.

import { gql } from '../shared/tatum.ts';
import { PYTH_FEEDS, PYTH_SUI_EVENT, hermesBase, hermesKey, type PythAsset } from './config.ts';

export interface PythPrice {
  feed_id: string;             // 0x-hex
  price: number;               // USD
  conf: number;                // USD
  publish_time: number;        // unix seconds
  source: 'pyth-hermes' | 'pyth-sui';
  digest?: string | null;      // Sui tx that verified this update on-chain (pyth-sui)
}

const toNum = (mag: string | number, exp: number) => Number(mag) * 10 ** exp;
const hex0x = (h: string) => (h.startsWith('0x') ? h : `0x${h}`).toLowerCase();

// ---------------------------------------------------------------- Hermes (key-gated)
/** One `parsed[]` entry of a Hermes PriceUpdate (schema: RpcPrice {price, conf, expo, publish_time}). */
export function parseHermesUpdate(json: any, feed: string): PythPrice | null {
  const want = hex0x(feed).slice(2);
  const p = (json?.parsed ?? []).find((x: any) => String(x?.id ?? '').toLowerCase().replace(/^0x/, '') === want);
  const r = p?.price;
  if (!r || r.price == null || r.expo == null || r.publish_time == null) return null;
  return { feed_id: hex0x(want), price: toNum(r.price, Number(r.expo)), conf: toNum(r.conf ?? 0, Number(r.expo)), publish_time: Number(r.publish_time), source: 'pyth-hermes', digest: null };
}

type Fetch = typeof fetch;
let transport: Fetch = (...a) => fetch(...a);
/** Test hook. */
export function __setPythTransport(f: Fetch | null): void { transport = f ?? ((...a) => fetch(...a)); }

async function hermes(path: string, feed: string): Promise<PythPrice | null> {
  const key = hermesKey();
  if (!key) throw new Error('Pyth Hermes needs an API key (set PYTH_API_KEY)');
  const r = await transport(`${hermesBase()}${path}?ids[]=${hex0x(feed).slice(2)}&parsed=true`, {
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 404) return null;                   // no update at/after that time yet
  if (!r.ok) throw new Error(`Pyth Hermes HTTP ${r.status}`);
  return parseHermesUpdate(await r.json(), feed);
}
export const hermesPriceAt = (feed: string, tSec: number) => hermes(`/v2/updates/price/${Math.floor(tSec)}`, feed);
export const hermesLatest = (feed: string) => hermes('/v2/updates/price/latest', feed);

// ---------------------------------------------------------------- Pyth on Sui (keyless)
/** One PriceFeedUpdateEvent's JSON (Sui GraphQL `contents.json`) → a price. */
export function parseSuiPythEvent(json: any, digest: string | null = null): PythPrice | null {
  const pf = json?.price_feed, pr = pf?.price;
  const id = pf?.price_identifier?.bytes;
  if (!pr || id == null) return null;
  const idHex = Array.isArray(id) ? Buffer.from(id).toString('hex') : Buffer.from(String(id), 'base64').toString('hex');
  const sign = pr.price?.negative ? -1 : 1, esign = pr.expo?.negative ? -1 : 1;
  const exp = esign * Number(pr.expo?.magnitude ?? 0);
  return {
    feed_id: hex0x(idHex), price: sign * toNum(pr.price?.magnitude ?? 0, exp), conf: toNum(pr.conf ?? 0, exp),
    publish_time: Number(pr.timestamp), source: 'pyth-sui', digest,
  };
}

/** Recent on-chain Pyth prices per feed, filled by paging PriceFeedUpdateEvents backwards through Tatum. */
type PageQuery = (before: string | null) => Promise<{ nodes: any[]; startCursor: string | null; hasPrevious: boolean }>;
export class SuiPythTape {
  obs = new Map<string, PythPrice[]>();           // feed → ascending by publish_time
  seen = new Set<string>();
  oldestCursor: string | null = null;
  oldestEventTs = Infinity;                       // seconds; contiguous coverage back to here
  toppedAt = 0;
  maxPages = 12;
  query: PageQuery;
  constructor(query?: PageQuery) { this.query = query ?? defaultQuery; }

  /** Adds an event; returns [alreadyKnown, eventTimestampSec]. */
  private add(n: any): [boolean, number] {
    const ts = Date.parse(n?.timestamp ?? '') / 1000;
    const p = parseSuiPythEvent(n?.contents?.json, n?.transaction?.digest ?? null);
    if (!p) return [false, ts];
    const key = `${p.feed_id}|${p.publish_time}|${p.digest ?? ''}`;
    if (this.seen.has(key)) return [true, ts];
    this.seen.add(key);
    const arr = this.obs.get(p.feed_id) ?? this.obs.set(p.feed_id, []).get(p.feed_id)!;
    arr.push(p); arr.sort((a, b) => a.publish_time - b.publish_time);
    return [false, ts];
  }

  /** Make sure prices from `sinceSec` up to now are loaded (top-up from the newest, then extend back). */
  async ensure(sinceSec: number, nowMs = Date.now()): Promise<void> {
    let pages = 0;
    if (nowMs - this.toppedAt > 20_000) {
      const fresh = this.seen.size === 0;
      let before: string | null = null, connected = false, topOldest = Infinity;
      while (pages < this.maxPages) {
        const pg = await this.query(before); pages++;
        let hitKnown = false;
        for (const n of [...pg.nodes].reverse()) {
          const [known, ts] = this.add(n);
          if (known) hitKnown = true;
          if (Number.isFinite(ts)) topOldest = Math.min(topOldest, ts);
        }
        before = pg.startCursor;
        if (hitKnown) { connected = true; break; }
        if (!pg.hasPrevious || !pg.nodes.length) { before = null; break; }
        if (fresh && topOldest <= sinceSec) break;
      }
      if (fresh || !connected) {                   // new tape, or a gap: coverage is what we just read
        this.oldestCursor = before;
        this.oldestEventTs = topOldest;
      }
      this.toppedAt = nowMs;
    }
    while (this.oldestEventTs > sinceSec && this.oldestCursor && pages < this.maxPages) {
      const pg = await this.query(this.oldestCursor); pages++;
      for (const n of pg.nodes) { const [, ts] = this.add(n); if (Number.isFinite(ts)) this.oldestEventTs = Math.min(this.oldestEventTs, ts); }
      this.oldestCursor = pg.hasPrevious && pg.nodes.length ? pg.startCursor : null;
    }
    const keep = nowMs / 1000 - 12 * 3600;
    for (const [f, arr] of this.obs) this.obs.set(f, arr.filter((p) => p.publish_time >= keep));
  }

  latest(feed: string): PythPrice | null { const a = this.obs.get(hex0x(feed)); return a?.length ? a[a.length - 1] : null; }
  series(feed: string, sinceSec: number): PythPrice[] { return (this.obs.get(hex0x(feed)) ?? []).filter((p) => p.publish_time >= sinceSec); }
  /** The first price with publish_time >= t (Pyth's benchmark rule). */
  atOrAfter(feed: string, tSec: number): PythPrice | null { return (this.obs.get(hex0x(feed)) ?? []).find((p) => p.publish_time >= tSec) ?? null; }
}

async function defaultQuery(before: string | null) {
  const r: any = await gql('testnet', `query($t:String!,$b:String){ events(last:50, before:$b, filter:{type:$t}) {
    pageInfo { hasPreviousPage startCursor } nodes { timestamp contents { json } transaction { digest } } } }`, { t: PYTH_SUI_EVENT, b: before });
  if (r.errors?.length) throw new Error(r.errors[0].message ?? 'graphql error');
  const ev = r.data?.events;
  return { nodes: ev?.nodes ?? [], startCursor: ev?.pageInfo?.startCursor ?? null, hasPrevious: !!ev?.pageInfo?.hasPreviousPage };
}

export const tape = new SuiPythTape();

// ---------------------------------------------------------------- the API the rest of HELIX uses
// SUI/USD is pushed on-chain by Pyth on Sui testnet: read it there (keyless, each price verified by Pyth's Sui
// contract) even when a Hermes key is set — Hermes keys are entitled per feed, and ours is refused for SUI ("Not
// entitled", HTTP 403). ETH/USD isn't pushed on testnet, so ETH needs Hermes.
export const priceSource = (asset: PythAsset): 'pyth-hermes' | 'pyth-sui' | null =>
  asset === 'SUI' ? 'pyth-sui' : hermesKey() ? 'pyth-hermes' : null;
/** Why `asset` can't be priced/resolved right now, or null. */
export const unavailableReason = (asset: PythAsset): string | null =>
  priceSource(asset) ? null : `${asset}/USD is not pushed to Pyth on Sui testnet; resolving ${asset} needs a Pyth Hermes API key (PYTH_API_KEY)`;

/** The latest Pyth price for `asset`. */
export async function pythLatest(asset: PythAsset, nowMs = Date.now()): Promise<PythPrice | null> {
  const feed = PYTH_FEEDS[asset];
  if (priceSource(asset) === 'pyth-hermes') return hermesLatest(feed);
  if (priceSource(asset) !== 'pyth-sui') return null;
  await tape.ensure(nowMs / 1000 - 600, nowMs);
  return tape.latest(feed);
}

/** Pyth prices for `asset` since `sinceSec` (Hermes: sampled every `stepSec`). */
export async function pythSeries(asset: PythAsset, sinceSec: number, nowMs = Date.now(), stepSec = 600): Promise<PythPrice[]> {
  const feed = PYTH_FEEDS[asset];
  if (priceSource(asset) === 'pyth-hermes') {
    const out: PythPrice[] = [];
    for (let t = sinceSec; t < nowMs / 1000 - 5; t += stepSec) { const p = await hermesPriceAt(feed, t).catch(() => null); if (p) out.push(p); }
    return out;
  }
  if (priceSource(asset) !== 'pyth-sui') return [];
  await tape.ensure(sinceSec, nowMs);
  return tape.series(feed, sinceSec);
}

/** The first Pyth price for `asset` with publish_time >= tSec, or null if none is published yet. */
export async function pythPriceAtOrAfter(asset: PythAsset, tSec: number, nowMs = Date.now()): Promise<PythPrice | null> {
  const feed = PYTH_FEEDS[asset];
  if (priceSource(asset) === 'pyth-hermes') return hermesPriceAt(feed, tSec);
  if (priceSource(asset) !== 'pyth-sui') return null;
  await tape.ensure(tSec - 60, nowMs);
  return tape.atOrAfter(feed, tSec);
}
