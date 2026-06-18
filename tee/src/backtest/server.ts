// Backtest Engine HTTP API: POST /backtest → performance report + equity blob id.
import { jsonServer } from '../shared/http.ts';
import { backtest } from './backtest.ts';
import { uploadBlob } from '../shared/walrus.ts';
import type { StrategyDNA } from '../shared/types.ts';

export function makeServer() {
  return jsonServer({
    'POST /backtest': async (b) => {
      if (!b || !b.dna) throw new Error('missing dna');
      const report = backtest({ dna: b.dna as StrategyDNA, seed: Number(b.seed ?? 1), days: Number(b.days ?? 90) });
      // live path: persist the equity curve to real Walrus, attach the real blob
      // id (OFFLINE=1 keeps the deterministic mock id only → tests unaffected).
      if (process.env.OFFLINE !== '1') {
        try {
          report.walrusBlobId = await uploadBlob({ kind: 'backtest-equity', seed: report.trades, equity: report.equityCurve });
        } catch (e) {
          (report as any).walrusNote = `walrus upload skipped: ${(e as Error).message}`;
        }
      }
      return report;
    },
    'GET /health': () => ({ ok: true, agent: 'backtest' }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.BACKTEST_PORT ?? 8082);
  makeServer().listen(port, () => console.log(`[backtest] listening on :${port}`));
}
