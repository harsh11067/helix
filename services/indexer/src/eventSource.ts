// eventSource — abstracts where HELIX events come from.
//
//   * MockEventSource: dev/test feed — push events directly.
//   * SuiEventSource:  production — polls the package's events over Sui GraphQL
//     through Tatum's gateway and maps them to HelixEvents.
//
// The real source is guarded behind a dynamic import of @mysten/sui so the
// indexer runs offline in dev (plan.md: mockable interfaces).
import type { HelixEvent } from './store.ts';

export interface EventSource {
  start(onEvent: (e: HelixEvent) => void): Promise<void> | void;
  stop(): Promise<void> | void;
}

export class MockEventSource implements EventSource {
  private cb: ((e: HelixEvent) => void) | null = null;
  start(onEvent: (e: HelixEvent) => void) { this.cb = onEvent; }
  stop() { this.cb = null; }
  /** dev/test: inject an event as if it came from chain */
  emit(e: HelixEvent) { this.cb?.(e); }
}

// Maps a raw Sui event (parsedJson + type) into a HelixEvent. Exported so it can
// be unit-tested without a live RPC connection.
export function mapSuiEvent(suiType: string, parsed: Record<string, any>): HelixEvent | null {
  const name = suiType.split('::').pop() ?? '';
  switch (name) {
    case 'StrategyCreated':
      return { type: 'StrategyCreated', strategyId: parsed.strategy_id, owner: parsed.owner,
        creator: parsed.creator, generation: Number(parsed.generation),
        initialCapital: Number(parsed.initial_capital) };
    case 'BreedingExecuted':
      return { type: 'BreedingExecuted', parentA: parsed.parent_a, parentB: parsed.parent_b,
        child: parsed.child, breeder: parsed.breeder, feePaid: Number(parsed.fee_paid),
        childGeneration: Number(parsed.child_generation) };
    case 'StrategyCopied':
      return { type: 'StrategyCopied', original: parsed.original, derived: parsed.derived,
        copier: parsed.copier, feePaid: Number(parsed.fee_paid) };
    case 'StrategyClosed':
      return { type: 'StrategyClosed', strategyId: parsed.strategy_id,
        pnl: (parsed.realized_pnl_negative ? -1 : 1) * Number(parsed.realized_pnl_magnitude) };
    case 'StrategyDied':
      return { type: 'StrategyDied', strategyId: parsed.strategy_id, reason: Number(parsed.reason_code) };
    default:
      return null;
  }
}

export interface ModuleFilter { package: string; module: string }

// Production source — polls Sui GraphQL `events` through Tatum's Sui gateway (Sui
// retired JSON-RPC on public fullnodes in 2026; Tatum is HELIX's single chokepoint).
// Filtered by DEFINING module type prefix (`pkg::events`, `pkg::predict`, …) — the
// emitting module differs (helix::strategy emits helix::events::StrategyCreated) —
// de-duplicated by (txDigest, sequenceNumber), and backfilled once on start.
export class SuiEventSource implements EventSource {
  private url: string;
  private filters: ModuleFilter[];
  private pollMs: number;
  private seen = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(graphqlUrl: string, filters: ModuleFilter[], pollMs = 6000) {
    this.url = graphqlUrl.endsWith('/graphql') ? graphqlUrl : graphqlUrl.replace(/\/+$/, '') + '/graphql';
    this.filters = filters;
    this.pollMs = pollMs;
  }

  private async queryModule(f: ModuleFilter): Promise<any[]> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (process.env.TATUM_API_KEY) headers['x-api-key'] = process.env.TATUM_API_KEY.trim();
    const r = await fetch(this.url, {
      method: 'POST', headers,
      body: JSON.stringify({
        query: `query($t: String!) { events(last: 50, filter: { type: $t }) {
          nodes { sequenceNumber contents { type { repr } json } transaction { digest } } } }`,
        variables: { t: `${f.package}::${f.module}` },
      }),
    });
    if (!r.ok) throw new Error(`graphql ${r.status}`);
    const j: any = await r.json();
    if (j.errors?.length) throw new Error(j.errors[0].message ?? 'graphql error');
    return j.data?.events?.nodes ?? [];
  }

  private async poll(onEvent: (e: HelixEvent) => void): Promise<void> {
    for (const f of this.filters) {
      let rows: any[];
      try { rows = await this.queryModule(f); } catch { continue; } // transient → skip round
      for (const ev of rows) {                                      // `last:` returns oldest-first
        const key = `${ev.transaction?.digest}:${ev.sequenceNumber}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        const m = mapSuiEvent(ev.contents?.type?.repr ?? '', ev.contents?.json ?? {});
        if (m) onEvent(m);
      }
    }
  }

  async start(onEvent: (e: HelixEvent) => void) {
    await this.poll(onEvent);                                   // initial backfill
    this.timer = setInterval(() => { void this.poll(onEvent); }, this.pollMs);
    if (typeof (this.timer as any)?.unref === 'function') (this.timer as any).unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
