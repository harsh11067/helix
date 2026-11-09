#!/usr/bin/env node
// HELIX MCP server — your trading memory inside Claude Code / Cursor / any MCP client.
//
// It calls ONLY the public HELIX compiler HTTP API (HELIX_API). No keys, no Walrus
// Memory credentials, no Tatum key live here: the compiler recalls from Walrus Memory
// (mainnet) and reads Sui through Tatum; this server just exposes those reads as tools.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = (process.env.HELIX_API ?? 'https://helix-compiler.onrender.com').replace(/\/+$/, '');
const address = z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe('Sui address of the trader (0x + 64 hex)');

async function call(path, body) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 90_000);
  try {
    const r = await fetch(API + path, {
      method: body ? 'POST' : 'GET', signal: c.signal,
      headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  } finally { clearTimeout(t); }
}
const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: `HELIX API error: ${e.message}` }] });
const r2 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

const server = new McpServer({ name: 'helix-memory', version: '1.0.0' });

server.registerTool('helix_memory', {
  title: 'HELIX memory timeline',
  description: "A trader's HELIX memory recalled from Walrus Memory (mainnet): every conviction, outcome, calibration and lesson, each with its Walrus blob id and the testnet tx it came from.",
  inputSchema: { address, limit: z.number().int().min(1).max(100).optional().describe('most recent N records (default 25)') },
}, async ({ address, limit }) => {
  try {
    const t = await call(`/memory/${address}`);
    const recent = t.timeline.slice(-(limit ?? 25)).map((r) => ({ type: r.type, blob_id: r.blob_id, tx: r.fields.tx ?? null, text: r.text }));
    return text({ namespace: t.namespace, memory_network: t.memory_network, total: t.count, settled: t.overall.n, wins: t.overall.wins, recent });
  } catch (e) { return fail(e); }
});

server.registerTool('helix_credibility', {
  title: 'HELIX credibility (who has been right)',
  description: 'Calibration per voice (you / Predict market / HELIX model / Polymarket crowd) as Brier scores (lower = better), overall and per setup bucket (direction/confidence/vol), with posterior win rates and n.',
  inputSchema: { address },
}, async ({ address }) => {
  try {
    const t = await call(`/memory/${address}`);
    const fmt = (s) => ({ n: s.n, wins: s.wins, posterior: r2(s.posterior), gap_you: r2(s.gap_you), brier: Object.fromEntries(Object.entries(s.brier).map(([k, v]) => [k, r2(v)])) });
    return text({ namespace: t.namespace, overall: fmt(t.overall), buckets: t.buckets.map((b) => ({ bucket: b.bucket, ...fmt(b) })), note: 'Scores firm up at n >= 3; Beta(2,2) prior on win rates.' });
  } catch (e) { return fail(e); }
});

server.registerTool('helix_lessons', {
  title: 'HELIX lessons',
  description: 'Plain-language lessons HELIX learned from settled outcomes (only written once a setup has n >= 3), optionally for one bucket like "up/high/choppy".',
  inputSchema: { address, bucket: z.string().optional().describe('e.g. up/high/choppy, down/mid/calm') },
}, async ({ address, bucket }) => {
  try {
    const t = await call(`/memory/${address}`);
    const lessons = t.timeline.filter((r) => r.type === 'LESSON' && (!bucket || r.fields.bucket === bucket))
      .map((r) => ({ bucket: r.fields.bucket, n: r.fields.n, text: r.fields.text, blob_id: r.blob_id }));
    return text(lessons.length ? lessons : `No lessons yet${bucket ? ' for ' + bucket : ''} — HELIX writes one only after 3+ settled convictions in a setup.`);
  } catch (e) { return fail(e); }
});

server.registerTool('helix_preview', {
  title: 'HELIX preview (what memory would change)',
  description: "Compile a BTC conviction against the live DeepBook Predict market AND the trader's memory, without trading: the order HELIX would place, the four voices, memory's suggested commit/structure, and the risk guardian.",
  inputSchema: {
    address: address.optional(),
    direction: z.number().min(-100).max(100).describe('-100 strong bear … +100 strong bull'),
    confidence: z.number().min(0).max(100),
    volView: z.number().min(0).max(100).describe('0 calm … 100 explosive'),
    horizonCode: z.number().int().min(0).max(3).optional().describe('0 shortest window … 3 longest (Predict windows are 1–15 min)'),
    commit: z.number().min(1).max(10000).describe('dUSDC to commit'),
  },
}, async (a) => {
  try {
    const r = await call('/preview', { address: a.address, direction: a.direction, confidence: a.confidence, volView: a.volView, horizonCode: a.horizonCode ?? 1, capital: a.commit });
    const m = r.memory ?? {};
    return text({
      order: r.predict?.order?.label, structure: r.predict?.order?.kind, resolves_in_min: r.predict?.market?.minutesLeft && Math.round(r.predict.market.minutesLeft * 10) / 10,
      voices: { you: r2(r.voices?.you), market: r2(r.voices?.market), helix: r2(r.voices?.helix), crowd: r.voices?.crowd ?? r.voices?.crowd_detail?.status },
      memory: { n: m.n, message: m.message, you_set: m.commit, memory_suggests: m.suggested_commit, structure_suggestion: m.structure_suggestion?.order?.label ?? null, lesson: m.lesson_text ?? null, blob_ids: m.blob_ids },
      guardian: (r.guardian ?? []).map((g) => g.t),
    });
  } catch (e) { return fail(e); }
});

await server.connect(new StdioServerTransport());
