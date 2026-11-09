// routes — "Ask your memory" (P6, LANES.md §4). Flag: FEATURE_ASK=1 (else no routes → 404).
//
//   GET  /ask/suggestions                      suggested questions + whether Walrus ask is available
//   POST /ask { address | ns, question, mode? } → { answer, mode: 'walrus-ask'|'stats', memories_used,
//                                                  memories_total, template, n, check?, note? }
//
// mode 'auto' (default): Walrus Memory's own `ask` (Plan A) answers from the namespace's memories and
// cites them; the deterministic stats answer (Plan B) is attached as `check`. Plan B answers instead
// when Walrus ask is unavailable, errors, cites nothing, says it has no memories, or quotes a number
// that is not in the cited memories. mode 'stats' skips Walrus entirely.
// Grounding: no cited memories → "I don't have memories about that yet." Read-only: works for any
// HELIX namespace, like GET /memory/:address (Judge Mode needs no wallet).

import { HttpError } from '../shared/http.ts';
import { namespaceFor, NS_PREFIX } from '../memory/format.ts';
import { recallAll, recallForAddress } from '../memory/store.ts';
import { commitLedger } from '../memory/service.ts';
import { resolveOwner } from '../passport/offchain/summary.ts';
import { council } from '../council/state.ts';
import { answerFromStats, matchTemplate, NO_DATA, SUGGESTED, type AskData, type Cited, type StatsAnswer } from './templates.ts';
import { walrusAsk, walrusUnavailable, saysNoData, unverifiedNumbers } from './walrus.ts';

export const ASK_PER_MIN = Number(process.env.ASK_PER_MIN ?? 10);
const ASK_GLOBAL_PER_MIN = Number(process.env.ASK_GLOBAL_PER_MIN ?? 120);

/** Public Council addresses (Lane A), used when the runner is not active in this process. */
const COUNCIL_FALLBACK = [
  { name: 'momentum', address: '0x92608f0b7b1f5872fa0b3a314b7aba05f228e45b24e19d197914a2e2949f7d31' },
  { name: 'reversion', address: '0xe89018db81101846e5526e56d7c758cf95d8e6099eb664f0386f9282097d5d58' },
  { name: 'surface', address: '0x97dd8db5d9e2c5a88fd64ec36e6bcebecc97a561f265156100b54eed9be2fa3f' },
  { name: 'crowd', address: '0x392a02dbb7829a518da3522feb621a9c2706f8010b0c4822aa29ed9a4df1a746' },
];

// ---------------------------------------------------------------- rate limit (per forecaster + global)
const hits = new Map<string, number[]>();
const globalHits: number[] = [];
/** Throws a polite 429 when `key` asked more than ASK_PER_MIN times in the last minute. */
export function rateLimit(key: string, now = Date.now()): void {
  while (globalHits.length && now - globalHits[0] > 60_000) globalHits.shift();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= ASK_PER_MIN || globalHits.length >= ASK_GLOBAL_PER_MIN) {
    const wait = Math.max(1, Math.ceil((60_000 - (now - (recent[0] ?? globalHits[0] ?? now))) / 1000));
    throw new HttpError(429, { error: `Easy there: up to ${ASK_PER_MIN} questions a minute per forecaster. Try again in ${wait}s.`, retry_after_s: wait }, { 'retry-after': String(wait) });
  }
  recent.push(now); hits.set(key, recent); globalHits.push(now);
  if (hits.size > 5000) hits.clear();
}
/** Test hook. */
export function __resetAskLimits(): void { hits.clear(); globalHits.length = 0; }

// ---------------------------------------------------------------- inputs
const NS_RE = new RegExp(`^${NS_PREFIX.replace(/[-]/g, '\\-')}-[0-9a-f]{12}$`);
export function resolveTarget(b: any): { ns: string; address: string | null } {
  const address = typeof b?.address === 'string' && /^0x[0-9a-fA-F]{64}$/.test(b.address) ? b.address.toLowerCase() : null;
  if (b?.address != null && !address) throw new HttpError(400, { error: 'invalid Sui address (0x + 64 hex)' });
  const ns = typeof b?.ns === 'string' ? b.ns : null;
  if (ns != null && !NS_RE.test(ns)) throw new HttpError(400, { error: 'invalid HELIX namespace' });
  if (!address && !ns) throw new HttpError(400, { error: 'address or ns required' });
  if (address && ns && namespaceFor(address) !== ns) throw new HttpError(400, { error: 'that namespace does not belong to that address' });
  return { ns: ns ?? namespaceFor(address!), address };
}
export function cleanQuestion(q: unknown): string {
  const s = typeof q === 'string' ? q.replace(/\s+/g, ' ').trim() : '';
  if (!s) throw new HttpError(400, { error: 'question required' });
  if (s.length > 400) throw new HttpError(400, { error: 'question too long (400 characters max)' });
  return s;
}

// ---------------------------------------------------------------- data for the stats answer (only what the template needs)
async function statsData(ns: string, address: string | null, question: string): Promise<AskData> {
  const t = matchTemplate(question)?.id ?? null;
  const recs = await recallAll(ns);
  const d: AskData = { recs, now: Date.now() };
  if (t === 'hidden') {
    const owner = address ?? (await resolveOwner(ns).catch(() => null));
    const L: any = owner ? await commitLedger(owner, recs).catch(() => null) : null;
    d.ledger = L && typeof L.onchain === 'number' ? L : null;
  }
  if (t === 'council') {
    const agents = council.agents.length ? council.agents : COUNCIL_FALLBACK;
    d.council = await Promise.all(agents.map(async (a) => ({ name: a.name, recs: await recallForAddress(a.address).catch(() => []) })));
  }
  return d;
}

export interface AskResponse {
  answer: string; mode: 'walrus-ask' | 'stats'; memories_used: Cited[]; memories_total: number; template: string | null;
  n: number | null; ns: string; check?: StatsAnswer | null; note?: string; unverified_numbers?: string[]; ms?: number;
}

/** The whole answer pipeline (exported for tests; `walrus` and `data` are injectable). */
export async function ask(target: { ns: string; address: string | null }, question: string, opts: {
  mode?: string; walrus?: typeof walrusAsk; data?: (ns: string, address: string | null, q: string) => Promise<AskData>; walrusReady?: () => string | null;
} = {}): Promise<AskResponse> {
  const { ns, address } = target;
  const load = opts.data ?? statsData;
  const statsP = load(ns, address, question).then((d) => answerFromStats(question, d));
  const fromStats = async (note?: string): Promise<AskResponse> => {
    const s = await statsP;
    return { ...s, mode: 'stats', ns, ...(note ? { note } : {}) };
  };
  if (opts.mode === 'stats') return fromStats();
  const why = (opts.walrusReady ?? walrusUnavailable)();
  if (why) return fromStats(why);
  let w;
  try { w = await (opts.walrus ?? walrusAsk)(ns, question); }
  catch (e) { return fromStats(`Walrus ask failed (${String((e as Error).message ?? e).slice(0, 80)}); answered from your stats`); }
  const cited: Cited[] = w.memories.map((m) => ({ text: m.text, blob_id: m.blob_id, type: m.text.split(' ')[0] ?? '' }));
  if (!cited.length || saysNoData(w.answer)) {
    const s = await statsP;
    return s.memories_used.length ? { ...s, mode: 'stats', ns, note: 'Walrus ask found no relevant memories; answered from your stats' }
      : { answer: NO_DATA, mode: 'walrus-ask', memories_used: [], memories_total: 0, template: s.template, n: null, ns };
  }
  const unverified = unverifiedNumbers(w.answer, [...w.memories.map((m) => m.text), question]);
  const check = await statsP.catch(() => null);
  if (unverified.length && check?.memories_used.length)
    return { ...check, mode: 'stats', ns, unverified_numbers: unverified, note: `Walrus ask quoted ${unverified.join(', ')}, which is not in the memories it cited; answered from your stats instead` };
  return {
    answer: w.answer, mode: 'walrus-ask', memories_used: cited, memories_total: cited.length, template: check?.template ?? null,
    n: null, ns, check: check && check.memories_used.length ? check : null, ms: w.ms, ...(unverified.length ? { unverified_numbers: unverified } : {}),
  };
}

export function askRoutes(): Record<string, (...a: any[]) => unknown> {
  if (process.env.FEATURE_ASK !== '1') return {};
  return {
    'GET /ask/suggestions': () => ({ questions: SUGGESTED, walrus_ask: walrusUnavailable() == null, per_minute: ASK_PER_MIN }),
    'POST /ask': async (b: any) => {
      const target = resolveTarget(b);
      const question = cleanQuestion(b?.question);
      rateLimit(target.ns);
      return ask(target, question, { mode: b?.mode === 'stats' ? 'stats' : 'auto' });
    },
  };
}
