// Minimal JSON HTTP server over node:http — no framework dependency so the TEE
// package runs on bare Node type-stripping. Adds permissive CORS for the
// untrusted frontend client (architecture.md §11.1).
import http from 'node:http';

type Handler = (body: any, url: URL) => unknown | Promise<unknown>;

export function jsonServer(routes: Record<string, Handler>): http.Server {
  return http.createServer(async (req, res) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) {
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
      const out = await handler(body, url);
      res.writeHead(200, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: (e as Error).message ?? String(e) }));
    }
  });
}
