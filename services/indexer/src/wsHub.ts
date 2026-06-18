// wsHub — broadcasts live HELIX events to connected frontend clients
// (architecture.md §10.2 WebSocket Hub). Wraps a ws.Server.
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { HelixEvent } from './store.ts';

export class WsHub {
  private wss: WebSocketServer;
  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/stream' });
    this.wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'Hello', ts: Date.now() }));
    });
  }
  broadcast(e: HelixEvent): void {
    const msg = JSON.stringify(e);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }
  get clientCount(): number { return this.wss.clients.size; }
  close(): void { this.wss.close(); }
}
