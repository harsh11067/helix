// records — the pure half of the Walrus Memory record format (TOTAL_RECALL.md §1): serialize, parse,
// bucket. No Node imports: this file is also bundled for the browser (tistu/js/vendor/memory.js) so the
// Memory Time Machine replays memories with the SAME code the server runs. `format.ts` re-exports it and
// adds the Node-only pieces (hashed namespaces).
//
// One fact per memory, plain text, `TYPE v1 | key=value | …`. Plain text keeps the memory semantically
// recallable by the relayer's embedding search; the versioned key=value body keeps it machine-parseable.
// The parser ignores unknown keys and missing keys default to `na`, so records written by older code stay valid.

export const RECORD_TYPES = [
  'CONVICTION', 'OUTCOME', 'CALIBRATION', 'LESSON', 'REASON', 'VETTING', 'USER', 'COUNCIL', 'PAYMENT',
  // N2 Ulysses Rules: a promise to your future self, its retirement, and every time you broke one
  'RULE', 'RULE_REMOVED', 'OVERRIDE',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export interface MemRecord {
  type: RecordType;
  version: number;
  f: Record<string, string>;   // raw key → value (strings; use num()/str() helpers)
  text: string;
  blob_id?: string;
  created_at?: string;
}

// ---------------------------------------------------------------- write side
const clean = (v: unknown): string => {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return 'na';
  const s = String(v);
  return s.replace(/[|\n\r]/g, ' ').trim() || 'na';
};
export const p2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? 'na' : x.toFixed(2));
export const p3 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? 'na' : x.toFixed(3));
export const signed2 = (x: number | null | undefined) =>
  (x == null || !Number.isFinite(x) ? 'na' : (x >= 0 ? '+' : '') + x.toFixed(2));

/** Serialize a record. `text` fields are quoted so they may contain spaces. */
export function formatRecord(type: RecordType, fields: [string, unknown][]): string {
  const parts = fields.map(([k, v]) => {
    if (k === 'text') return `text="${clean(v).replace(/"/g, "'")}"`;
    return `${k}=${clean(v)}`;
  });
  return `${type} v1 | ${parts.join(' | ')}`;
}

// ---------------------------------------------------------------- read side
/** Parse one memory line. Returns null for anything that isn't a HELIX v1+ record. */
export function parseRecord(text: string, meta: { blob_id?: string; created_at?: string } = {}): MemRecord | null {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  const head = /^([A-Z_]+)\s+v(\d+)\s*\|/.exec(t);
  if (!head) return null;
  const type = head[1] as RecordType;
  if (!(RECORD_TYPES as readonly string[]).includes(type)) return null;
  const body = t.slice(head[0].length);
  const f: Record<string, string> = {};
  // key=value pairs separated by `|`; text="..." may contain anything but a double quote
  const re = /\s*([a-z_][a-z0-9_]*)\s*=\s*("([^"]*)"|[^|]*)\s*(\||$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    f[m[1].toLowerCase()] = (m[3] !== undefined ? m[3] : m[2]).trim();
  }
  return { type, version: Number(head[2]), f, text: t, blob_id: meta.blob_id, created_at: meta.created_at };
}

export function num(r: MemRecord | undefined, k: string): number | null {
  const v = r?.f[k];
  if (v == null || v === 'na' || v === '') return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
export function str(r: MemRecord | undefined, k: string): string | null {
  const v = r?.f[k];
  return v == null || v === 'na' || v === '' ? null : v;
}

/** When a record happened, in seconds: its own `ts`, else the relayer's created_at, else 0. */
export function recordTs(r: MemRecord): number {
  const t = num(r, 'ts');
  if (t != null) return t;
  const c = r.created_at ? Date.parse(r.created_at) : NaN;
  return Number.isFinite(c) ? Math.floor(c / 1000) : 0;
}

// ---------------------------------------------------------------- buckets
export type DirWord = 'up' | 'down' | 'neutral';
export const dirWord = (direction: number): DirWord => (direction >= 20 ? 'up' : direction <= -20 ? 'down' : 'neutral');
export const confBand = (conf01: number) => (conf01 < 0.4 ? 'low' : conf01 < 0.7 ? 'mid' : 'high');
export const volWord = (volView: number) => (volView < 50 ? 'calm' : 'choppy');
export const bucketKey = (dir: string, conf01: number, vol: string) => `${dir}/${confBand(conf01)}/${vol}`;
/** The asset a record is about. Records written before multi-asset (P5) carry none and are BTC. */
export const assetOf = (r: MemRecord | undefined): string => (str(r, 'asset') ?? 'BTC').toUpperCase();
/** Calibration bucket. BTC keeps its original keys (`up/high/choppy`); other assets are scoped (`ETH:up/high/choppy`). */
export function bucketOfConviction(r: MemRecord): string | null {
  const dir = str(r, 'dir'), conf = num(r, 'conf'), vol = str(r, 'vol');
  if (!dir || conf == null || !vol) return null;
  const a = assetOf(r), k = bucketKey(dir, conf, vol);
  return a === 'BTC' ? k : `${a}:${k}`;
}

/** "you" voice: confidence 0–100 mapped to a win probability in [0.5, 0.95]. */
export const pYou = (confidence: number) => 0.5 + 0.45 * Math.max(0, Math.min(100, confidence)) / 100;
