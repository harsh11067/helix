// T2: Tatum's gRPC interface — the tiny protobuf codec and the BCS decode of journal::ConvictionCommitted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbString, pbFieldMask, pbDecode, decodeCommitBcs } from '../src/shared/tatumGrpc.ts';

test('protobuf: GetTransactionRequest round-trips (digest = 1, read_mask.paths = 2.1)', () => {
  const req = Buffer.concat([pbString(1, 'D1gest'), pbFieldMask(2, ['digest', 'effects.status'])]);
  const m = pbDecode(req);
  assert.equal((m.get(1)![0] as Buffer).toString(), 'D1gest');
  const mask = pbDecode(m.get(2)![0] as Buffer);
  assert.deepEqual(mask.get(1)!.map((b) => (b as Buffer).toString()), ['digest', 'effects.status']);
});

test('BCS: ConvictionCommitted { owner, hash, oracle, expiry_ms, committed_ms } decodes exactly; trailing bytes refuse', () => {
  const owner = Buffer.alloc(32, 0xab), oracle = Buffer.alloc(32, 0x0c), hash = Buffer.alloc(32, 0x5f);
  const u64 = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
  const bcs = Buffer.concat([owner, Buffer.from([32]), hash, oracle, u64(1_794_275_100_000), u64(1_794_274_976_079)]);
  assert.deepEqual(decodeCommitBcs(bcs), {
    owner: '0x' + 'ab'.repeat(32), hash: '5f'.repeat(32), oracle: '0x' + '0c'.repeat(32), expiry_ms: 1_794_275_100_000, committed_ms: 1_794_274_976_079,
  });
  assert.equal(decodeCommitBcs(Buffer.concat([bcs, Buffer.from([0])])), null);
});
