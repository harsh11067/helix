// walrus — "Ask your memory", Plan A (docs/ASK.md): the Walrus Memory relayer's `POST /api/ask`.
//
// The relayer recalls the namespace's most relevant memories (vector search), SEAL-decrypts them, and
// asks an LLM (openai/gpt-4o-mini via the relayer operator's key) to answer from them. It returns the
// answer plus the memories it used, each with its Walrus blob id. The JS SDK has no `ask()` (only the
// Python SDK does), so this calls the same route through the SDK's own signed-request path: Ed25519
// delegate-key headers over "{ts}.{method}.{path}.{sha256(body)}.{nonce}.{account}" + a SEAL session.
//
// Guards: an hourly cap (the relayer's per-account budget is shared with every memory write; ask
// weighs 2), a 5-minute back-off after a relayer error, and a number check: every number in the answer
// must appear in the cited memories (or the question), otherwise the caller falls back to the stats.

import { memwal, mode as memMode } from '../memory/store.ts';

export interface WalrusMemory { blob_id: string; text: string; distance: number | null }
export interface WalrusAnswer { answer: string; memories: WalrusMemory[]; memories_used: number; ms: number }

export const ASK_WALRUS_PER_HOUR = Number(process.env.ASK_WALRUS_PER_HOUR ?? 30);
const BACKOFF_MS = 5 * 60_000;
const calls: number[] = [];
let backoffUntil = 0;
export const walrusAskStats = { ok: 0, errors: 0, lastError: null as string | null };

/** Why Walrus ask can't be used right now, or null when it can. */
export function walrusUnavailable(now = Date.now()): string | null {
  if (process.env.ASK_WALRUS === '0') return 'disabled (ASK_WALRUS=0)';
  if (memMode() !== 'mainnet') return 'Walrus Memory not configured on this server';
  if (now < backoffUntil) return 'the Walrus Memory relayer errored recently; answering from your stats';
  while (calls.length && now - calls[0] > 3_600_000) calls.shift();
  if (calls.length >= ASK_WALRUS_PER_HOUR) return `hourly Walrus ask budget reached (${ASK_WALRUS_PER_HOUR}); answering from your stats`;
  return null;
}
/** Test hook. */
export function __resetWalrusAsk(): void { calls.length = 0; backoffUntil = 0; walrusAskStats.ok = 0; walrusAskStats.errors = 0; walrusAskStats.lastError = null; }

/** The relayer's system prompt is fixed; this keeps the answer short and tied to the retrieved memories. */
export const shapeQuestion = (q: string) =>
  `${q.trim()}\n\n(Answer in at most 3 sentences, only from the retrieved memories. Quote numbers exactly as they appear in them. If they do not answer the question, reply exactly: "I don't have memories about that yet.")`;

/** Signed `POST /api/ask` through the delegate key. `client` is injectable for tests. */
export async function walrusAsk(ns: string, question: string, opts: { limit?: number; client?: any; now?: number } = {}): Promise<WalrusAnswer> {
  const t0 = opts.now ?? Date.now();
  calls.push(t0);
  try {
    const c = opts.client ?? memwal();
    const r = await c.signedRequest('POST', '/api/ask', { question: shapeQuestion(question), limit: opts.limit ?? 6, namespace: ns }, [200], { timeoutMs: 60_000 });
    if (typeof r?.answer !== 'string') throw new Error('relayer /api/ask returned no answer');
    const memories: WalrusMemory[] = (Array.isArray(r.memories) ? r.memories : [])
      .filter((m: any) => m && typeof m.blob_id === 'string' && typeof m.text === 'string')
      .map((m: any) => ({ blob_id: m.blob_id, text: m.text, distance: Number.isFinite(m.distance) ? m.distance : null }));
    walrusAskStats.ok++;
    return { answer: r.answer.trim(), memories, memories_used: Number(r.memories_used ?? memories.length), ms: Date.now() - t0 };
  } catch (e) {
    walrusAskStats.errors++; walrusAskStats.lastError = String((e as Error).message ?? e).slice(0, 200);
    backoffUntil = Date.now() + BACKOFF_MS;
    throw e;
  }
}

/** The model said it has nothing to go on. */
export const saysNoData = (answer: string) => /\b(don'?t|do not) have (any )?(relevant )?memor|\bno (relevant )?memor|\bnot (in|mentioned in) (the|your) memor/i.test(answer);

// ---------------------------------------------------------------- number grounding
const NUM = /(?<![\w.])-?\d+(?:[.,]\d+)?%?/g;
const parse = (tok: string) => Number(tok.replace(/%$/, '').replace(',', '.'));
const decimals = (tok: string) => (tok.replace(/%$/, '').split(/[.,]/)[1] ?? '').length;

/** Numbers in `answer` that appear in none of `sources` (allowing rounding and 0.42 ↔ 42%). */
export function unverifiedNumbers(answer: string, sources: string[]): string[] {
  const known: number[] = [];
  for (const s of sources) for (const tok of String(s).match(NUM) ?? []) {
    const v = parse(tok);
    if (!Number.isFinite(v)) continue;
    known.push(v);
    if (Math.abs(v) <= 1) known.push(v * 100);       // 0.42 → 42 (%)
    if (tok.endsWith('%')) known.push(v / 100);
  }
  const out: string[] = [];
  for (const tok of answer.match(NUM) ?? []) {
    const v = parse(tok);
    if (!Number.isFinite(v)) continue;
    const tol = 0.5 * 10 ** -decimals(tok) + 1e-9;
    if (!known.some((k) => Math.abs(k - v) <= tol)) out.push(tok);
  }
  return [...new Set(out)];
}
