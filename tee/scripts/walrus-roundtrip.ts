// Task C acceptance: upload a real backtest blob to Walrus testnet, fetch it back
// by id, confirm the id is a real Walrus id (verifiable via the aggregator URL).
// Run live (no OFFLINE): node tee/scripts/walrus-roundtrip.ts
import { strict as assert } from 'node:assert';
import { backtest } from '../src/backtest/backtest.ts';
import { uploadBlob, fetchJson, isRealWalrusId, blobIdBytes } from '../src/shared/walrus.ts';

const dna = {
  dirNegative: false, dirMagnitude: 60, confidence: 70, horizonDays: 1, volView: 45,
  legCount: 2, assetPairCode: 0, usesOptions: true, usesSpot: false, usesMargin: false,
  leverageX100: 100, entrySignalType: 0, entryThreshold: 40, exitSignalType: 3, exitThreshold: 60,
  regimeSensitivity: 45, maxDrawdownBps: 900, hedgeNeg: false, hedgeDeltaMag: 0,
  mutationCount: 0, crossoverPoints: [],
} as any;

const r = backtest({ dna, seed: 7, days: 60 });
const payload = { kind: 'backtest-equity', sharpe: r.sharpe, maxDrawdown: r.maxDrawdown, equity: r.equityCurve };

const id = await uploadBlob(payload);
console.log('uploaded blob id :', id);
console.log('real walrus id?  :', isRealWalrusId(id));
console.log('aggregator URL   : https://aggregator.walrus-testnet.walrus.space/v1/blobs/' + id);

const back = await fetchJson(id);
const ok = Array.isArray(back.equity)
  && back.equity.length === r.equityCurve.length
  && back.equity[0] === r.equityCurve[0]
  && back.equity[back.equity.length - 1] === r.equityCurve[r.equityCurve.length - 1];
console.log('round-trip match :', ok);
console.log('BlobRef bytes    :', blobIdBytes(id).length, 'bytes (walrus_adapter::new_blob_ref input, kind 0=backtest)');

assert.ok(isRealWalrusId(id), 'id must be a real Walrus testnet id, not the mock sha256');
assert.ok(ok, 'fetched blob must equal what we uploaded');
console.log('WALRUS ROUNDTRIP: PASS');
