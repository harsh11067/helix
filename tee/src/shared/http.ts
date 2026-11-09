// Minimal JSON HTTP server over node:http — no framework dependency so the TEE
// package runs on bare Node type-stripping. Adds permissive CORS for the
// untrusted frontend client (architecture.md §11.1).
//
// Routes are `"METHOD /path"`; a path segment starting with `:` is a parameter
// (`"GET /memory/:address"`), passed to the handler as its third argument.
// A handler may throw `HttpError` to choose the status code (403, 402, …).
import http from 'node:http';

type Handler = (body: any, url: URL, params: Record<string, string>, req: http.IncomingMessage) => unknown | Promise<unknown>;

export class HttpError extends Error {
  status: number; body: unknown; headers: Record<string, string>;
  constructor(status: number, body: unknown, headers: Record<string, string> = {}) {
    super(typeof body === 'object' && body && 'error' in (body as any) ? String((body as any).error) : `HTTP ${status}`);
    this.status = status; this.body = body; this.headers = headers;
  }
}

function match(routes: Record<string, Handler>, method: string, path: string): { h: Handler; params: Record<string, string> } | null {
  const exact = routes[`${method} ${path}`];
  if (exact) return { h: exact, params: {} };
  const segs = path.split('/');
  for (const [key, h] of Object.entries(routes)) {
    const sp = key.indexOf(' ');
    if (key.slice(0, sp) !== method) continue;
    const pat = key.slice(sp + 1).split('/');
    if (pat.length !== segs.length || !pat.some((p) => p.startsWith(':'))) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      if (pat[i].startsWith(':')) { if (!segs[i]) { ok = false; break; } params[pat[i].slice(1)] = decodeURIComponent(segs[i]); }
      else if (pat[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { h, params };
  }
  return null;
}

export function jsonServer(routes: Record<string, Handler>): http.Server {
  return http.createServer(async (req, res) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-payment,authorization,payment-signature',
      'access-control-expose-headers': 'x-payment-response,www-authenticate,payment-required,payment-response',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const m = match(routes, req.method ?? 'GET', url.pathname);
      if (!m) {
        res.writeHead(404, { 'content-type': 'application/json', ...cors });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }
      let body: any = {};
      if (req.method !== 'GET') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const raw = Buffer.concat(chunks).toString('utf8');
        body = raw ? JSON.parse(raw) : {};
      }
      const out = await m.h(body, url, m.params, req);
      res.writeHead(200, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    } catch (e) {
      if (e instanceof HttpError) {
        res.writeHead(e.status, { 'content-type': 'application/json', ...cors, ...e.headers });
        res.end(JSON.stringify(e.body));
        return;
      }
      res.writeHead(400, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: (e as Error).message ?? String(e), code: (e as any)?.code, plan: (e as any)?.plan }));
    }
  });
}
