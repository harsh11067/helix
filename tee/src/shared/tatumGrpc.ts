// tatumGrpc — Tatum's second Sui interface: plain gRPC (sui.rpc.v2) over HTTP/2 (FINAL_PUSH T2).
//
// Tatum serves Sui gRPC on its own hosts (sui-testnet-grpc / sui-mainnet-grpc.gateway.tatum.io),
// verified 10 Nov 2026 with LedgerService/GetServiceInfo on both networks. It is plain gRPC, not
// grpc-web, so the browser can't call it: the server does, through the same per-key queue as the
// GraphQL gateway (the 3 req/s limit is per key) and the same usage counters.
//
// Used where a second, independent interface adds trust:
//   • Passport "Verify": the commit transaction confirmed via Tatum GraphQL (browser, through the proxy)
//     AND via Tatum gRPC (here) → "verified via 2 Tatum interfaces ✓✓"
//   • memory proofs: the Walrus Memory account object read on mainnet via gRPC as well as GraphQL
//
// A tiny protobuf codec is enough: two requests (string + FieldMask) and a few response fields.

import http2 from 'node:http2';
import { tatumQueued } from './tatum.ts';
import { recordCall } from './tatumUsage.ts';

export type GrpcNet = 'testnet' | 'mainnet';
export const GRPC_HOSTS: Record<GrpcNet, string> = {
  testnet: process.env.TATUM_SUI_TESTNET_GRPC ?? 'sui-testnet-grpc.gateway.tatum.io',
  mainnet: process.env.TATUM_SUI_MAINNET_GRPC ?? 'sui-mainnet-grpc.gateway.tatum.io',
};

// ---------------------------------------------------------------- protobuf (wire format)
const varint = (n: number | bigint): Buffer => {
  let v = BigInt(n); const out: number[] = [];
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return Buffer.from(out);
};
const field = (no: number, bytes: Buffer): Buffer => Buffer.concat([varint((no << 3) | 2), varint(bytes.length), bytes]);
export const pbString = (no: number, s: string): Buffer => field(no, Buffer.from(s, 'utf8'));
export const pbFieldMask = (no: number, paths: string[]): Buffer => field(no, Buffer.concat(paths.map((p) => pbString(1, p))));

/** Decode one message level: field number → list of values (bigint for varints, Buffer for bytes). */
export function pbDecode(buf: Buffer): Map<number, (bigint | Buffer)[]> {
  const out = new Map<number, (bigint | Buffer)[]>();
  let i = 0;
  const rv = (): bigint => { let r = 0n, s = 0n; for (;;) { const b = buf[i++]; r |= BigInt(b & 0x7f) << s; if (!(b & 0x80)) return r; s += 7n; } };
  while (i < buf.length) {
    const tag = Number(rv()), no = tag >>> 3, wt = tag & 7;
    let v: bigint | Buffer;
    if (wt === 0) v = rv();
    else if (wt === 2) { const len = Number(rv()); v = buf.subarray(i, i + len); i += len; }
    else if (wt === 1) { v = buf.subarray(i, i + 8); i += 8; }
    else if (wt === 5) { v = buf.subarray(i, i + 4); i += 4; }
    else throw new Error(`protobuf: unsupported wire type ${wt}`);
    const a = out.get(no) ?? []; a.push(v); out.set(no, a);
  }
  return out;
}
const one = (m: Map<number, any[]>, no: number) => m.get(no)?.[0];
const str = (m: Map<number, any[]>, no: number) => { const v = one(m, no); return Buffer.isBuffer(v) ? v.toString('utf8') : null; };
const msg = (m: Map<number, any[]>, no: number) => { const v = one(m, no); return Buffer.isBuffer(v) ? pbDecode(v) : null; };
const u64 = (m: Map<number, any[]>, no: number) => { const v = one(m, no); return typeof v === 'bigint' ? Number(v) : null; };

// ---------------------------------------------------------------- transport
const sessions = new Map<string, http2.ClientHttp2Session>();
function session(host: string): http2.ClientHttp2Session {
  const s = sessions.get(host);
  if (s && !s.closed && !s.destroyed) return s;
  const c = http2.connect(`https://${host}`);
  c.on('error', () => sessions.delete(host));
  c.on('close', () => sessions.delete(host));
  c.setTimeout(60_000, () => c.close());
  c.unref();
  sessions.set(host, c);
  return c;
}

export class GrpcError extends Error { code: number; constructor(code: number, message: string) { super(message); this.code = code; } }

/** One unary gRPC call through Tatum, retried on rate limit / unavailable with jittered backoff. */
export async function grpcUnary(net: GrpcNet, path: string, body: Buffer, timeoutMs = 10_000): Promise<Buffer> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1) + Math.random() * 200));
    try { return await grpcOnce(net, path, body, timeoutMs); }
    catch (e) { last = e; if (!(e instanceof GrpcError) || ![14, 8, 4].includes(e.code)) throw e; }
  }
  throw last;
}
/** One attempt (queued with the GraphQL traffic, counted in usage). */
async function grpcOnce(net: GrpcNet, path: string, body: Buffer, timeoutMs: number): Promise<Buffer> {
  const host = GRPC_HOSTS[net], key = process.env.TATUM_API_KEY?.trim();
  if (!key) throw new GrpcError(16, 'TATUM_API_KEY not set');
  const method = path.split('/').pop() ?? path;
  return tatumQueued(() => new Promise<Buffer>((resolve, reject) => {
    const t0 = Date.now();
    const frame = Buffer.alloc(5 + body.length); frame[0] = 0; frame.writeUInt32BE(body.length, 1); body.copy(frame, 5);
    let req: http2.ClientHttp2Stream;
    try { req = session(host).request({ ':method': 'POST', ':path': path, 'content-type': 'application/grpc', te: 'trailers', 'x-api-key': key }); }
    catch (e) { sessions.delete(host); return reject(e); }
    const chunks: Buffer[] = []; let status = 0; let grpc: { code: number; message: string } | null = null;
    const done = (err?: Error) => {
      clearTimeout(timer);
      recordCall(`grpc-${net}`, method, Date.now() - t0, err ? (status === 429 ? 429 : 500) : 200);
      if (err) return reject(err);
      const b = Buffer.concat(chunks);
      resolve(b.length >= 5 ? b.subarray(5, 5 + b.readUInt32BE(1)) : Buffer.alloc(0));
    };
    const timer = setTimeout(() => { req.close(); done(new GrpcError(4, `tatum grpc ${net} ${method}: timeout`)); }, timeoutMs);
    req.on('response', (h) => {
      status = Number(h[':status']);
      if (h['grpc-status'] != null) grpc = { code: Number(h['grpc-status']), message: String(h['grpc-message'] ?? '') };
    });
    req.on('trailers', (t) => { grpc = { code: Number(t['grpc-status'] ?? 0), message: decodeURIComponent(String(t['grpc-message'] ?? '')) }; });
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('error', (e) => done(e));
    req.on('end', () => {
      if (status !== 200) return done(new GrpcError(status === 429 ? 8 : status >= 500 ? 14 : 2, `tatum grpc ${net} ${method}: HTTP ${status}`));
      if (grpc && grpc.code !== 0) return done(new GrpcError(grpc.code, `tatum grpc ${net} ${method}: ${grpc.message || 'status ' + grpc.code}`));
      done();
    });
    req.end(frame);
  }));
}

// ---------------------------------------------------------------- sui.rpc.v2 calls
const LEDGER = '/sui.rpc.v2.LedgerService';

export async function serviceInfo(net: GrpcNet) {
  const m = pbDecode(await grpcUnary(net, `${LEDGER}/GetServiceInfo`, Buffer.alloc(0)));
  return { chain_id: str(m, 1), chain: str(m, 2), epoch: u64(m, 3), checkpoint_height: u64(m, 4), server: str(m, 8) };
}

export interface GrpcCommitEvent { event_type: string | null; owner: string; hash: string; oracle: string; expiry_ms: number; committed_ms: number }
export interface GrpcTxView {
  digest: string | null; checkpoint: number | null; timestamp_ms: number | null; success: boolean | null; sender: string | null;
  events: GrpcCommitEvent[];
}

const hex = (b: Buffer) => '0x' + b.toString('hex');
/** BCS of journal::ConvictionCommitted { owner: address, hash: vector<u8>, oracle: address, expiry_ms: u64, committed_ms: u64 }. */
export function decodeCommitBcs(b: Buffer): Omit<GrpcCommitEvent, 'event_type'> | null {
  try {
    let i = 0;
    const owner = hex(b.subarray(i, i + 32)); i += 32;
    let len = 0, shift = 0; for (;;) { const x = b[i++]; len |= (x & 0x7f) << shift; if (!(x & 0x80)) break; shift += 7; }
    const hash = b.subarray(i, i + len).toString('hex'); i += len;
    const oracle = hex(b.subarray(i, i + 32)); i += 32;
    const expiry_ms = Number(b.readBigUInt64LE(i)); i += 8;
    const committed_ms = Number(b.readBigUInt64LE(i)); i += 8;
    if (i !== b.length) return null;
    return { owner, hash, oracle, expiry_ms, committed_ms };
  } catch { return null; }
}

/** LedgerService/GetTransaction: sender, status, checkpoint, time, and every ConvictionCommitted it emitted. */
export async function getTransaction(digest: string, net: GrpcNet = 'testnet'): Promise<GrpcTxView> {
  const req = Buffer.concat([pbString(1, digest), pbFieldMask(2, ['digest', 'transaction.sender', 'effects.status', 'events.events.event_type', 'events.events.contents', 'checkpoint', 'timestamp'])]);
  const tx = msg(pbDecode(await grpcUnary(net, `${LEDGER}/GetTransaction`, req)), 1);
  if (!tx) throw new GrpcError(5, 'transaction not found');
  const ts = msg(tx, 7), status = msg(msg(tx, 4) ?? new Map(), 4);
  const events: GrpcCommitEvent[] = [];
  for (const ev of (msg(tx, 5)?.get(3) ?? []) as Buffer[]) {
    const e = pbDecode(ev), type = str(e, 4), contents = msg(e, 5), bcs = contents ? one(contents, 2) : null;
    if (!type?.endsWith('::journal::ConvictionCommitted') || !Buffer.isBuffer(bcs)) continue;
    const c = decodeCommitBcs(bcs); if (c) events.push({ event_type: type, ...c });
  }
  return {
    digest: str(tx, 1), checkpoint: u64(tx, 6),
    timestamp_ms: ts ? (u64(ts, 1) ?? 0) * 1000 + Math.floor((u64(ts, 2) ?? 0) / 1e6) : null,
    success: status ? (one(status, 1) === 1n) : null,
    sender: str(msg(tx, 2) ?? new Map(), 5), events,
  };
}

/** LedgerService/GetObject: id, version, digest, type and owner of one object. */
export async function getObject(objectId: string, net: GrpcNet = 'mainnet') {
  const req = Buffer.concat([pbString(1, objectId), pbFieldMask(3, ['object_id', 'version', 'digest', 'owner', 'object_type'])]);
  const o = msg(pbDecode(await grpcUnary(net, `${LEDGER}/GetObject`, req)), 1);
  if (!o) throw new GrpcError(5, 'object not found');
  const ow = msg(o, 5);
  const KIND = ['unknown', 'address', 'object', 'shared', 'immutable', 'consensus_address'];
  return { object_id: str(o, 2), version: u64(o, 3), digest: str(o, 4), object_type: str(o, 6),
    owner: ow ? { kind: KIND[u64(ow, 1) ?? 0] ?? String(u64(ow, 1)), address: str(ow, 2) } : null };
}
