// rulesService — N2 Ulysses Rules HTTP API + memory writes. Flag: FEATURE_RULES=1 (else no routes → 404 and
// the Memory page shows no Rules panel; compiles return no gate).
//
//   GET  /rules/templates            the 4 templates with their parameters
//   GET  /rules/:address             current rules (from RULE / RULE_REMOVED memories) + override_record
//   POST /rules/create|pause|remove  { address, ts, signature, … }: the wallet signed ruleMessage(action, …)
//
// Rules live in the trader's own namespace, so every write needs proof of the wallet: the browser signs a
// personal message with the connected wallet and the server verifies it (verifyPersonalMessageSignature)
// before writing. Judge Mode (no wallet) reads the demo trader's rules; it cannot create any.
import { HttpError } from '../shared/http.ts';
import { namespaceFor } from './format.ts';
import { remember, recallForAddress, registerNamespace, mode as memMode } from './store.ts';
import {
  RULE_TEMPLATES, rulesFrom, activeRules, normalizeParams, formatRule, formatRuleRemoved, formatOverride, ruleMessage,
  overrideRecord, overrideLesson, OVERRIDE_LESSON_BUCKET, type Rule, type RuleHit,
} from './rules.ts';
import { formatRecord, str, type MemRecord } from './records.ts';

export const rulesEnabled = () => process.env.FEATURE_RULES === '1';
const SIGNATURE_MAX_AGE_MS = 10 * 60_000;

// ---------------------------------------------------------------- wallet proof
type Verifier = (message: Uint8Array, signature: string) => Promise<string>;   // → signer's Sui address
let verifier: Verifier | null = null;
/** Tests inject a fake; production verifies with @mysten/sui (wallet-standard personal-message signatures). */
export function __setRuleVerifier(v: Verifier | null): void { verifier = v; }
async function defaultVerifier(message: Uint8Array, signature: string): Promise<string> {
  const { verifyPersonalMessageSignature } = await import('@mysten/sui/verify');
  const pk = await verifyPersonalMessageSignature(message, signature);
  return pk.toSuiAddress().toLowerCase();
}
export async function verifyRuleRequest(action: 'create' | 'pause' | 'resume' | 'remove', b: any, payload: Record<string, unknown>): Promise<{ address: string; ts: number }> {
  const address = typeof b?.address === 'string' && /^0x[0-9a-fA-F]{64}$/.test(b.address) ? b.address.toLowerCase() : null;
  if (!address) throw new HttpError(400, { error: 'invalid Sui address (0x + 64 hex)' });
  const ts = Number(b?.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_MAX_AGE_MS) throw new HttpError(400, { error: 'ts must be the signing time in ms (within 10 minutes)' });
  if (typeof b?.signature !== 'string' || !b.signature) throw new HttpError(401, { error: 'signature required: sign the rule message with your wallet' });
  const msg = ruleMessage(action, address, payload, ts);
  let signer: string;
  try { signer = (await (verifier ?? defaultVerifier)(new TextEncoder().encode(msg), b.signature)).toLowerCase(); }
  catch (e) { throw new HttpError(401, { error: `signature does not verify (${(e as Error).message.slice(0, 80)})`, message: msg }); }
  if (signer !== address) throw new HttpError(403, { error: 'signature is from a different wallet than the namespace owner', message: msg });
  return { address, ts };
}

// ---------------------------------------------------------------- reads
export async function rulesFor(address: string) {
  const recs = await recallForAddress(address);
  return rulesView(address, recs);
}
export function rulesView(address: string, recs: MemRecord[]) {
  const rules = rulesFrom(recs);
  const rec = overrideRecord(recs);
  const overrides = recs.filter((r) => r.type === 'OVERRIDE').map((r) => ({ tx: str(r, 'tx'), rule_id: str(r, 'rule_id'), text: str(r, 'text'), blob_id: r.blob_id, ts: Number(r.f.ts ?? 0) }));
  return {
    namespace: namespaceFor(address), memory_network: memMode() === 'mainnet' ? 'walrus-mainnet' : memMode(),
    rules, active: rules.filter((r) => r.status === 'active').length, override_record: rec, overrides,
    lesson: overrideLesson(rec, recs), templates: templatesView(), min_override_chars: 10,
  };
}
export const templatesView = () => RULE_TEMPLATES.map((t) => ({ id: t.id, title: t.title, params: t.params, example: t.sentence(Object.fromEntries(t.params.map((p) => [p.key, p.default]))) }));
export async function activeRulesFor(address: string): Promise<Rule[]> {
  return activeRules(await recallForAddress(address));
}

// ---------------------------------------------------------------- writes (each one a memory)
const newId = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');
export async function createRule(b: any) {
  const template = String(b?.template ?? '');
  let params: Record<string, string | number>;
  try { params = normalizeParams(template, b?.params); } catch (e) { throw new HttpError(400, { error: (e as Error).message }); }
  const { address, ts } = await verifyRuleRequest('create', b, { template, params });
  const ns = namespaceFor(address);
  const rule = { id: typeof b.id === 'string' && /^[0-9a-f]{8}$/.test(b.id) ? b.id : newId(), template, params, status: 'active' as const, ts: Math.floor(ts / 1000) };
  const mem = await remember(ns, formatRule(rule), { origin: 'rules' });
  await registerNamespace(ns).catch(() => {});
  return { ok: true, rule: { ...rule, blob_id: mem.blob_id }, blob_id: mem.blob_id, namespace: ns };
}
export async function pauseRule(b: any) {
  const id = String(b?.id ?? ''), paused = b?.paused !== false;
  const { address, ts } = await verifyRuleRequest(paused ? 'pause' : 'resume', b, { id });
  const ns = namespaceFor(address);
  const cur = rulesFrom(await recallForAddress(address)).find((r) => r.id === id);
  if (!cur) throw new HttpError(404, { error: 'no such rule' });
  const rule = { id, template: cur.template, params: cur.params, status: paused ? 'paused' as const : 'active' as const, ts: Math.floor(ts / 1000) };
  const mem = await remember(ns, formatRule(rule), { origin: 'rules' });
  return { ok: true, rule: { ...rule, blob_id: mem.blob_id }, blob_id: mem.blob_id };
}
export async function removeRule(b: any) {
  const id = String(b?.id ?? '');
  const { address, ts } = await verifyRuleRequest('remove', b, { id });
  const ns = namespaceFor(address);
  if (!rulesFrom(await recallForAddress(address)).some((r) => r.id === id)) throw new HttpError(404, { error: 'no such rule' });
  // memory is append-only: a RULE_REMOVED memory retires the rule; the RULE blob stays as history
  const mem = await remember(ns, formatRuleRemoved(id, Math.floor(ts / 1000)), { origin: 'rules' });
  return { ok: true, id, blob_id: mem.blob_id };
}

/** After a commit made through the gate lands: remember the override sentence next to the conviction. */
export async function writeOverride(ns: string, o: { tx: string; hits: RuleHit[]; text: string; ts: number; origin?: string }) {
  return remember(ns, formatOverride({ tx: o.tx, rule_ids: o.hits.map((h) => h.rule_id), templates: o.hits.map((h) => h.template), text: o.text.trim().slice(0, 280), ts: o.ts }), { tx: o.tx, origin: o.origin ?? 'rules' });
}

/** After an OUTCOME: once 3+ overrides have settled, write (or update) the override LESSON. */
export async function overrideLessonIfDue(ns: string, recs: MemRecord[], tx: string, ts: number): Promise<string | null> {
  const rec = overrideRecord(recs);
  const text = overrideLesson(rec, recs);
  if (!text) return null;
  const prev = recs.filter((r) => r.type === 'LESSON' && str(r, 'bucket') === OVERRIDE_LESSON_BUCKET).pop();
  if (str(prev, 'text') === text) return null;
  await remember(ns, formatRecord('LESSON', [['tx', tx], ['bucket', OVERRIDE_LESSON_BUCKET], ['n', rec.n], ['text', text], ['ts', ts]]), { tx, origin: 'watcher' });
  return text;
}

export function rulesRoutes(): Record<string, (...a: any[]) => unknown> {
  if (!rulesEnabled()) return {};
  const needAddr = (a: unknown) => {
    if (typeof a === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a)) return a.toLowerCase();
    throw new HttpError(400, { error: 'invalid Sui address (0x + 64 hex)' });
  };
  return {
    'GET /rules/templates': () => ({ templates: templatesView(), min_override_chars: 10, message_format: 'HELIX rule <action> | <address> | <payload> | ts=<ms>' }),
    'GET /rules/:address': (_b: any, _u: URL, p: Record<string, string>) => rulesFor(needAddr(p.address)),
    // the message to sign, so a client never has to reimplement ruleMessage()
    'POST /rules/message': (b: any) => {
      const action = ['create', 'pause', 'resume', 'remove'].includes(b?.action) ? b.action : 'create';
      const payload = action === 'create' ? { template: String(b?.template ?? ''), params: normalizeParams(String(b?.template ?? ''), b?.params) } : { id: String(b?.id ?? '') };
      const ts = Number(b?.ts) || Date.now();
      return { message: ruleMessage(action, needAddr(b?.address), payload, ts), ts };
    },
    'POST /rules/create': (b: any) => createRule(b),
    'POST /rules/pause': (b: any) => pauseRule(b),
    'POST /rules/remove': (b: any) => removeRule(b),
  };
}
