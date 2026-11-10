// rules — N2 Ulysses Rules: promises to your future self, kept by memory. Pure (no Node imports).
//
//  • A rule is a `RULE v1` memory: a template id + parameters (no free-text rule parsing), status active|paused.
//    Memory is append-only: a later RULE with the same id supersedes (pause/resume); `RULE_REMOVED v1` retires it.
//  • At compile the active rules are evaluated against the conviction, the order and the trader's own
//    calibration. A match turns the guardian line into a GATE: to proceed the trader types an override sentence
//    (≥ 10 characters). The commit then carries `override=true` + `rule_id`, and an `OVERRIDE v1` memory keeps
//    the sentence. Settlement later scores the overrides: "You broke your own rules 4 times and lost 3."

import { type MemRecord, str, num, recordTs, formatRecord, dirWord, confBand, volWord, bucketKey } from './records.ts';
import { settledRows } from './rows.ts';
import { bucketStats, MIN_N } from './calibration.ts';

export const OVERRIDE_MIN_CHARS = 10;

export type ParamSpec = { key: string; label: string; type: 'number'; default: number; min: number; max: number; step?: number }
  | { key: string; label: string; type: 'choice'; default: string; choices: string[] };
export interface RuleTemplate { id: string; title: string; params: ParamSpec[]; sentence: (p: Record<string, string | number>) => string }

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'cap_commit', title: 'Cap my size when my record says I run hot',
    params: [{ key: 'max', label: 'cap (dUSDC)', type: 'number', default: 2, min: 1, max: 50, step: 0.5 }, { key: 'gap_pts', label: 'gap over (points)', type: 'number', default: 30, min: 5, max: 60, step: 5 }],
    sentence: (p) => `Cap my commit at ${p.max} dUSDC when my over-confidence gap in this setup is over ${p.gap_pts} points`,
  },
  {
    id: 'cooldown_after_losses', title: 'Cool down after a losing streak',
    params: [{ key: 'losses', label: 'straight losses', type: 'number', default: 3, min: 2, max: 10, step: 1 }, { key: 'hours', label: 'for (hours)', type: 'number', default: 24, min: 1, max: 168, step: 1 },
      { key: 'conf', label: 'confidence', type: 'choice', default: 'high', choices: ['high', 'mid', 'low', 'any'] }, { key: 'vol', label: 'market', type: 'choice', default: 'choppy', choices: ['choppy', 'calm', 'any'] }],
    sentence: (p) => `Block ${p.conf === 'any' ? 'all' : p.conf + '-confidence'} calls in ${p.vol === 'any' ? 'all' : p.vol} markets for ${p.hours} h after ${p.losses} straight losses`,
  },
  {
    id: 'justify_against_market', title: 'Make me justify calls against the market',
    params: [{ key: 'below', label: 'market gives my outcome under (%)', type: 'number', default: 50, min: 10, max: 60, step: 5 }],
    sentence: (p) => `Ask me to justify any call the market prices under ${p.below}% (against the market's lean)`,
  },
  {
    id: 'max_per_day', title: 'Limit how often I trade',
    params: [{ key: 'n', label: 'commits per 24 h', type: 'number', default: 3, min: 1, max: 50, step: 1 }],
    sentence: (p) => `No more than ${p.n} commit${Number(p.n) === 1 ? '' : 's'} in any 24 hours`,
  },
];
export const templateById = (id: string) => RULE_TEMPLATES.find((t) => t.id === id) ?? null;

export interface Rule { id: string; template: string; params: Record<string, string | number>; status: 'active' | 'paused'; ts: number; blob_id?: string; sentence: string }

/** Validate + normalise params for a template (numbers clamped to their range, choices checked). Throws on garbage. */
export function normalizeParams(templateId: string, raw: Record<string, unknown> | undefined): Record<string, string | number> {
  const t = templateById(templateId);
  if (!t) throw new Error(`unknown rule template: ${templateId}`);
  const out: Record<string, string | number> = {};
  for (const p of t.params) {
    const v = raw?.[p.key];
    if (p.type === 'number') {
      const n = v === undefined || v === '' ? p.default : Number(v);
      if (!Number.isFinite(n)) throw new Error(`rule param ${p.key} must be a number`);
      out[p.key] = Math.max(p.min, Math.min(p.max, n));
    } else {
      const s = v === undefined || v === '' ? p.default : String(v);
      if (!p.choices.includes(s)) throw new Error(`rule param ${p.key} must be one of ${p.choices.join('/')}`);
      out[p.key] = s;
    }
  }
  return out;
}
const encodeParams = (p: Record<string, string | number>) => Object.entries(p).map(([k, v]) => `${k}:${String(v).replace(/[,:|]/g, '')}`).join(',');
function decodeParams(templateId: string, s: string | null): Record<string, string | number> {
  const raw: Record<string, string> = {};
  for (const kv of (s ?? '').split(',').filter(Boolean)) { const i = kv.indexOf(':'); if (i > 0) raw[kv.slice(0, i)] = kv.slice(i + 1); }
  try { return normalizeParams(templateId, raw); } catch { return raw; }
}
export const ruleSentence = (templateId: string, params: Record<string, string | number>) => templateById(templateId)?.sentence(params) ?? `${templateId} ${encodeParams(params)}`;

// ---------------------------------------------------------------- records
export const formatRule = (r: { id: string; template: string; params: Record<string, string | number>; status: 'active' | 'paused'; ts: number }) =>
  formatRecord('RULE', [['id', r.id], ['template', r.template], ['params', encodeParams(r.params)], ['status', r.status], ['text', ruleSentence(r.template, r.params)], ['ts', r.ts]]);
export const formatRuleRemoved = (id: string, ts: number) => formatRecord('RULE_REMOVED', [['id', id], ['ts', ts]]);
export const formatOverride = (o: { tx: string; rule_ids: string[]; templates: string[]; text: string; ts: number }) =>
  formatRecord('OVERRIDE', [['tx', o.tx], ['rule_id', o.rule_ids.join(',')], ['template', o.templates.join(',')], ['text', o.text], ['ts', o.ts]]);

/** Fold RULE / RULE_REMOVED memories into the current rule set (latest per id wins; removed ones drop out). */
export function rulesFrom(recs: MemRecord[]): Rule[] {
  const sorted = [...recs].filter((r) => r.type === 'RULE' || r.type === 'RULE_REMOVED').sort((a, b) => recordTs(a) - recordTs(b));
  const by = new Map<string, Rule | null>();
  for (const r of sorted) {
    const id = str(r, 'id'); if (!id) continue;
    if (r.type === 'RULE_REMOVED') { by.set(id, null); continue; }
    const template = str(r, 'template') ?? '';
    if (!templateById(template)) continue;
    const params = decodeParams(template, str(r, 'params'));
    by.set(id, { id, template, params, status: str(r, 'status') === 'paused' ? 'paused' : 'active', ts: recordTs(r), blob_id: r.blob_id, sentence: ruleSentence(template, params) });
  }
  return [...by.values()].filter((r): r is Rule => !!r).sort((a, b) => a.ts - b.ts);
}
export const activeRules = (recs: MemRecord[]) => rulesFrom(recs).filter((r) => r.status === 'active');

// ---------------------------------------------------------------- evaluation
export interface RuleContext {
  conv: { direction: number; confidence: number; volView: number; capital: number };
  commit: number;                 // the size about to be committed
  pMkt: number | null;            // the market's probability for the order winning
  memory: { n: number; gap_you: number | null; suggested_commit: number } | null;
  recs: MemRecord[];              // the trader's memories (losing streaks, daily counts)
  now: number;                    // ms
}
export interface RuleHit { rule_id: string; template: string; sentence: string; reason: string }

/** The rules that bind this conviction right now, each with a plain-language reason. Pure, deterministic. */
export function evaluateRules(rules: Rule[], ctx: RuleContext): RuleHit[] {
  const hits: RuleHit[] = [];
  const conf = confBand(ctx.conv.confidence / 100), vol = volWord(ctx.conv.volView);
  const bucket = bucketKey(dirWord(ctx.conv.direction), ctx.conv.confidence / 100, vol);
  for (const r of rules) {
    if (r.status !== 'active') continue;
    const p = r.params;
    let reason: string | null = null;
    if (r.template === 'cap_commit') {
      const m = ctx.memory;
      const gapPts = m?.gap_you == null ? null : Math.round(m.gap_you * 100);
      if (m && m.n >= MIN_N && gapPts != null && gapPts > Number(p.gap_pts) && ctx.commit > Number(p.max))
        reason = `Your gap in ${bucket} is ${gapPts} points over ${m.n} settled calls (rule: over ${p.gap_pts}) and you are committing ${ctx.commit} dUSDC (cap ${p.max}).`;
    } else if (r.template === 'cooldown_after_losses') {
      if ((p.conf === 'any' || p.conf === conf) && (p.vol === 'any' || p.vol === vol)) {
        const settled = settledRows(ctx.recs).sort((a, b) => a.ts - b.ts);
        const outcomeTs = new Map(ctx.recs.filter((x) => x.type === 'OUTCOME' && str(x, 'tx')).map((x) => [str(x, 'tx')!, recordTs(x)]));
        const k = Number(p.losses);
        const last = settled.slice(-k);
        if (last.length === k && last.every((x) => x.won === 0)) {
          const lastTs = Math.max(...last.map((x) => outcomeTs.get(x.tx) ?? x.ts)) * 1000;
          const hrs = (ctx.now - lastTs) / 3_600_000;
          if (hrs >= 0 && hrs < Number(p.hours))
            reason = `${k} straight losses, the last ${hrs < 1 ? Math.round(hrs * 60) + ' min' : hrs.toFixed(1) + ' h'} ago — your rule blocks ${p.conf === 'any' ? '' : p.conf + '-confidence '}calls in ${p.vol === 'any' ? 'all' : p.vol} markets for ${p.hours} h.`;
        }
      }
    } else if (r.template === 'justify_against_market') {
      if (ctx.pMkt != null && ctx.pMkt * 100 < Number(p.below))
        reason = `The market prices your outcome at ${Math.round(ctx.pMkt * 100)}% — against its lean (rule: under ${p.below}%). Say why you know better.`;
    } else if (r.template === 'max_per_day') {
      const dayAgo = Math.floor(ctx.now / 1000) - 86_400;
      const recent = ctx.recs.filter((x) => x.type === 'CONVICTION' && recordTs(x) >= dayAgo && recordTs(x) <= Math.floor(ctx.now / 1000) + 60).length;
      if (recent >= Number(p.n)) reason = `You have committed ${recent} time${recent === 1 ? '' : 's'} in the last 24 h (rule: at most ${p.n}).`;
    }
    if (reason) hits.push({ rule_id: r.id, template: r.template, sentence: r.sentence, reason });
  }
  return hits;
}

/** Guardian line for the Canvas: the gate. */
export const ruleGuardianLine = (h: RuleHit) => ({ cls: 'rule', bad: true, t: `Your rule: "${h.sentence}". ${h.reason} Type an override to proceed; it is remembered and scored.` });

/** An override sentence is valid when it has substance (≥ 10 characters, not just whitespace). */
export const overrideOk = (text: unknown): text is string => typeof text === 'string' && text.trim().length >= OVERRIDE_MIN_CHARS;

// ---------------------------------------------------------------- scoring
export interface OverrideRecord { n: number; wins: number; losses: number; pending: number; pnl: number }

/** Every conviction committed through an override (CONVICTION override=true, or an OVERRIDE memory for its tx), scored by its OUTCOME. */
export function overrideRecord(recs: MemRecord[]): OverrideRecord {
  const overridden = new Set<string>();
  for (const r of recs) {
    const tx = str(r, 'tx'); if (!tx) continue;
    if (r.type === 'OVERRIDE' || (r.type === 'CONVICTION' && str(r, 'override') === 'true')) overridden.add(tx);
  }
  const outcomes = new Map(recs.filter((r) => r.type === 'OUTCOME' && str(r, 'tx')).map((r) => [str(r, 'tx')!, r]));
  let n = 0, wins = 0, losses = 0, pending = 0, pnl = 0;
  for (const tx of overridden) {
    const o = outcomes.get(tx), res = str(o, 'result');
    if (res === 'WIN' || res === 'LOSS') { n++; if (res === 'WIN') wins++; else losses++; pnl += num(o, 'payoff') ?? 0; }
    else if (!o || res !== 'VOID') pending++;
  }
  return { n, wins, losses, pending, pnl: Math.round(pnl * 100) / 100 };
}

/** The lesson memory writes once you have broken your rules 3+ times and the calls settled. */
export function overrideLesson(rec: OverrideRecord, recs: MemRecord[] = []): string | null {
  if (rec.n < MIN_N) return null;
  const rows = settledRows(recs);
  const overall = bucketStats(rows);
  const kept = overall.n - rec.n;
  const base = `You broke your own rules ${rec.n} times and lost ${rec.losses}.`;
  if (kept >= MIN_N) {
    const keptWins = overall.wins - rec.wins;
    return `${base} Calls that kept your rules won ${keptWins}/${kept}; overrides won ${rec.wins}/${rec.n}.` +
      (rec.wins / rec.n < keptWins / kept ? ' Your rules know better than your exceptions.' : ' Your exceptions have paid so far; watch that this holds.');
  }
  return `${base} Overrides won ${rec.wins}/${rec.n} (PnL ${rec.pnl >= 0 ? '+' : ''}${rec.pnl.toFixed(2)} dUSDC).`;
}
export const OVERRIDE_LESSON_BUCKET = 'rules/override';

/** Canonical message the wallet signs for a rule action; the server rebuilds it from the request and verifies. */
export function ruleMessage(action: 'create' | 'pause' | 'resume' | 'remove', address: string, payload: Record<string, unknown>, ts: number): string {
  const keys = Object.keys(payload).sort();
  const body = keys.map((k) => `${k}=${typeof payload[k] === 'object' ? encodeParams(payload[k] as any) : String(payload[k])}`).join(' ');
  return `HELIX rule ${action} | ${address.toLowerCase()} | ${body} | ts=${ts}`;
}
