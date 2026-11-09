// Judge Mode: GET /demo exposes the configured demo trader (validated), read-only.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';

process.env.OFFLINE = '1';
const { makeServer } = await import('../src/compiler/server.ts');

async function getDemo(env: string | undefined) {
  if (env === undefined) delete process.env.DEMO_ADDRESS; else process.env.DEMO_ADDRESS = env;
  const srv = makeServer().listen(0);
  await new Promise((r) => srv.once('listening', r));
  try {
    const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/demo`);
    return { status: r.status, body: await r.json() };
  } finally { srv.close(); }
}

test('GET /demo returns the configured demo address, read-only', async () => {
  const A = '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
  const r = await getDemo(A);
  assert.equal(r.status, 200);
  assert.equal(r.body.address, A);
  assert.equal(r.body.readOnly, true);
});

test('GET /demo is null when unset or malformed (never a fabricated trader)', async () => {
  assert.equal((await getDemo(undefined)).body.address, null);
  assert.equal((await getDemo('0x1234')).body.address, null);
});
