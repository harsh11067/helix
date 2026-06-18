// Indexer HTTP query API + WebSocket hub (architecture.md §10.3).
//   GET  /strategies/leaderboard?n=10
//   GET  /strategies/:id
//   GET  /lineage/:id            → { ancestors, descendants }
//   POST /ingest                 → dev/mock event feed (chain in prod)
//   WSS  /stream                 → live event broadcast
import http from 'node:http';
import { Store, type HelixEvent } from './store.ts';
import { WsHub } from './wsHub.ts';
import { MockEventSource, SuiEventSource, type EventSource } from './eventSource.ts';

// Live chain config (CLAUDE.md). OFFLINE=1 → deterministic MockEventSource so the
// indexer tests stay green; otherwise the live SuiEventSource filtered on the
// HELIX + Predict package IDs.
const OFFLINE = process.env.OFFLINE === '1';
const RPC = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';
const HELIX_PKG = process.env.HELIX_PACKAGE_ID ?? '0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3';
const PREDICT_PKG = process.env.PREDICT_PACKAGE_ID ?? '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';

export interface Indexer {
  server: http.Server;
  store: Store;
  hub: WsHub;
  source: EventSource;
  ingest(e: HelixEvent): void;
}

export function createIndexer(): Indexer {
  const store = new Store();
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (code: number, body: unknown) => { res.writeHead(code, cors); res.end(JSON.stringify(body)); };
    try {
      if (req.method === 'GET' && url.pathname === '/strategies/leaderboard') {
        return send(200, store.leaderboard(Number(url.searchParams.get('n') ?? 10)));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/lineage/')) {
        const id = decodeURIComponent(url.pathname.slice('/lineage/'.length));
        return send(200, { ancestors: store.ancestors(id), descendants: store.descendants(id) });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/strategies/')) {
        const id = decodeURIComponent(url.pathname.slice('/strategies/'.length));
        const s = store.getStrategy(id);
        return s ? send(200, s) : send(404, { error: 'not found' });
      }
      if (req.method === 'POST' && url.pathname === '/ingest') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const e = JSON.parse(Buffer.concat(chunks).toString('utf8')) as HelixEvent;
        ingest(e);
        return send(200, { ok: true });
      }
      send(404, { error: 'not found' });
    } catch (err) {
      send(400, { error: (err as Error).message });
    }
  });

  const hub = new WsHub(server);
  const source: EventSource = OFFLINE
    ? new MockEventSource()
    : new SuiEventSource(RPC, [
        { package: HELIX_PKG, module: 'events' },     // StrategyCreated / Breeding / Copied / Closed / Died
        { package: PREDICT_PKG, module: 'predict' },  // Predict mints/redeems (mapped as they gain mappers)
        { package: PREDICT_PKG, module: 'oracle' },   // oracle lifecycle
      ]);

  function ingest(e: HelixEvent) {
    store.ingest(e);
    hub.broadcast(e);
  }
  // start the source; a live RPC hiccup must not crash the indexer
  Promise.resolve(source.start(ingest)).catch((err) => console.error('[indexer] event source error:', (err as Error).message));

  return { server, store, hub, source, ingest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.INDEXER_PORT ?? 8090);
  const ix = createIndexer();
  ix.server.listen(port, () => console.log(`[indexer] http+ws on :${port} (/stream)`));
}
