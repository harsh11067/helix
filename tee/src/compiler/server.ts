// Compiler Agent HTTP API (architecture.md §10.3):
//   POST /compile  → full compile (DNA + PTB + attestation)
//   POST /preview  → payoff/Greeks only, no attestation (cheap canvas refresh)
//   GET  /health
import { jsonServer } from '../shared/http.ts';
import { compileLive } from './compiler.ts';
import { MOCK_TEE } from '../shared/attestation.ts';
import type { Conviction } from '../shared/types.ts';

function asConviction(b: any): Conviction {
  const num = (v: any, lo: number, hi: number, name: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`invalid ${name}: ${v}`);
    return n;
  };
  return {
    direction: num(b.direction, -100, 100, 'direction'),
    confidence: num(b.confidence, 0, 100, 'confidence'),
    horizonCode: num(b.horizonCode ?? 0, 0, 3, 'horizonCode'),
    volView: num(b.volView, 0, 100, 'volView'),
    capital: num(b.capital, 0, 1e12, 'capital'),
  };
}

export function makeServer() {
  return jsonServer({
    'POST /compile': (b) => compileLive(asConviction(b), Number(b.currentEpoch ?? 0)),
    'POST /preview': async (b) => {
      const r = await compileLive(asConviction(b), Number(b.currentEpoch ?? 0));
      return {
        selected: r.selected,
        candidates: r.candidates,
        spot: r.spot, ivAtm: r.ivAtm, plpUtilizationBps: r.plpUtilizationBps,
      };
    },
    'GET /health': () => ({ ok: true, agent: 'compiler', mockTee: MOCK_TEE }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.COMPILER_PORT ?? 8081);
  makeServer().listen(port, () => console.log(`[compiler] listening on :${port} (mockTee=${MOCK_TEE})`));
}
