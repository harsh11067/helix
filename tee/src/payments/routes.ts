// payments/routes — the paid Credibility API (P3). Flag FEATURE_PAYMENTS=1.
import type { IncomingMessage } from 'node:http';
import { HttpError, RawResponse } from '../shared/http.ts';
import { timelineFor } from '../memory/service.ts';
import { str } from '../memory/format.ts';
import { resolveOwner } from '../passport/offchain/summary.ts';
import { enabled, charge, pricing, paidCalls } from './mpp.ts';

/** The paid detail: per-setup posteriors, Brier per voice, lessons with blob ids, reliability. */
export async function credibilityDetail(id: string, bucket: string | null) {
  const owner = await resolveOwner(id);
  if (!owner) throw new HttpError(404, { error: 'unknown forecaster' });
  const t: any = await timelineFor(owner);
  const buckets = (t.buckets ?? []).filter((b: any) => !bucket || b.bucket === bucket);
  const lessons = (t.timeline ?? []).filter((r: any) => r.type === 'LESSON' && (!bucket || r.fields?.bucket === bucket))
    .map((r: any) => ({ bucket: r.fields?.bucket, text: r.fields?.text, n: Number(r.fields?.n), blob_id: r.blob_id }));
  return {
    owner, namespace: t.namespace, bucket: bucket ?? 'all',
    overall: t.overall, buckets, lessons, reliability: t.reliability, reasons: t.reasons, commits: t.commits,
    source: 'recalled from Walrus Memory (mainnet); commits counted from Sui events via Tatum',
  };
}

export function paymentRoutes() {
  return {
    'GET /api/v1': () => ({ ...pricing(), enabled: enabled(), paid_calls: paidCalls.length, recent: paidCalls.slice(-10).reverse() }),
    'GET /api/v1/credibility/:id': async (_b: any, u: URL, p: Record<string, string>, req: IncomingMessage) => {
      if (!enabled()) throw new HttpError(404, { error: 'not found' });
      const bucket = u.searchParams.get('bucket');
      if (bucket && !/^(up|down|neutral)\/(low|mid|high)\/(calm|choppy)$/.test(bucket)) throw new HttpError(400, { error: 'bucket must look like up/high/choppy' });
      const r = await charge(req, u, `HELIX credibility detail for ${p.id}${bucket ? ' · ' + bucket : ''}`, () => credibilityDetail(p.id, bucket));
      const ct = r.headers['content-type'] ?? 'application/json';
      const { 'content-type': _ct, 'content-length': _cl, ...rest } = r.headers;
      return new RawResponse(r.body, ct, rest, r.status);
    },
  };
}
