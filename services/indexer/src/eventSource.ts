// eventSource — abstracts where HELIX events come from.
//
//   * MockEventSource: dev/test feed — push events directly.
//   * SuiEventSource:  production — subscribes to the package's events over the
//     Sui RPC `suix_subscribeEvent` websocket and maps them to HelixEvents.
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

// Production source — polls `suix_queryEvents` over the JSON-RPC fullnode via
// plain fetch (no SDK dependency; fullnode event websockets are deprecated).
// Filtered on the given package/module pairs (HELIX events + Predict modules),
// de-duplicated by (txDigest, eventSeq), and backfilled once on start.
export class SuiEventSource implements EventSource {
  private rpcUrl: string;
  private filters: ModuleFilter[];
  private pollMs: number;
  private seen = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(rpcUrl: string, filters: ModuleFilter[], pollMs = 4000) {
    this.rpcUrl = rpcUrl;
    this.filters = filters;
    this.pollMs = pollMs;
  }

  private async queryModule(f: ModuleFilter): Promise<any[]> {
    const r = await fetch(this.rpcUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'suix_queryEvents',
        // MoveEventModule = the module that DEFINES the event struct (helix::events,
        // predict::predict/oracle) — not the emitting/entry module.
        params: [{ MoveEventModule: { package: f.package, module: f.module } }, null, 50, true],
      }),
    });
    if (!r.ok) throw new Error(`rpc ${r.status}`);
    const j: any = await r.json();
    if (j.error) throw new Error(j.error.message ?? 'rpc error');
    return j.result?.data ?? [];
  }

  private async poll(onEvent: (e: HelixEvent) => void): Promise<void> {
    for (const f of this.filters) {
      let rows: any[];
      try { rows = await this.queryModule(f); } catch { continue; } // transient → skip round
      for (const ev of rows.reverse()) { // RPC returns newest-first → emit oldest-first
        const key = `${ev.id?.txDigest}:${ev.id?.eventSeq}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        const m = mapSuiEvent(ev.type, ev.parsedJson ?? {});
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
