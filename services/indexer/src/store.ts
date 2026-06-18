// store — denormalized read-models the Indexer maintains from chain events
// (architecture.md §10.2). In-memory here behind a narrow interface so the
// production Postgres store is a drop-in swap (plan.md: SQLite/PG acceptable).

export type HelixEvent =
  | { type: 'StrategyCreated'; strategyId: string; owner: string; creator: string; generation: number; initialCapital: number; parents?: string[] }
  | { type: 'StrategyActivated'; strategyId: string }
  | { type: 'StrategyClosed'; strategyId: string; pnl: number }
  | { type: 'StrategyDied'; strategyId: string; reason: number }
  | { type: 'BreedingExecuted'; parentA: string; parentB: string; child: string; breeder: string; feePaid: number; childGeneration: number }
  | { type: 'StrategyCopied'; original: string; derived: string; copier: string; feePaid: number }
  | { type: 'PerformanceSnapshot'; strategyId: string; fitness: number; pnl: number; ts: number }
  | { type: 'GreeksUpdated'; portfolioId: string; netDelta: number; netVega: number; breached: boolean };

export interface StrategyRow {
  strategyId: string;
  owner: string;
  creator: string;
  generation: number;
  initialCapital: number;
  fitness: number;
  status: 'pending' | 'active' | 'closed' | 'dead';
  parents: string[];
  copiesCount: number;
  offspringCount: number;
}

export interface LineageEdge { child: string; parent: string; kind: 'bred' | 'copied' | 'declared' }
export interface BreedingRow { parentA: string; parentB: string; child: string; breeder: string; feePaid: number }
export interface CopyRow { original: string; derived: string; copier: string; feePaid: number }
export interface Snapshot { strategyId: string; fitness: number; pnl: number; ts: number }

export class Store {
  strategies = new Map<string, StrategyRow>();
  lineageEdges: LineageEdge[] = [];
  breedingEvents: BreedingRow[] = [];
  copyRelationships: CopyRow[] = [];
  performanceSnapshots: Snapshot[] = [];

  ingest(e: HelixEvent): void {
    switch (e.type) {
      case 'StrategyCreated': {
        this.strategies.set(e.strategyId, {
          strategyId: e.strategyId, owner: e.owner, creator: e.creator,
          generation: e.generation, initialCapital: e.initialCapital, fitness: e.initialCapital,
          status: 'pending', parents: e.parents ?? [], copiesCount: 0, offspringCount: 0,
        });
        for (const p of e.parents ?? []) this.lineageEdges.push({ child: e.strategyId, parent: p, kind: 'declared' });
        break;
      }
      case 'StrategyActivated': this.setStatus(e.strategyId, 'active'); break;
      case 'StrategyClosed': this.setStatus(e.strategyId, 'closed'); break;
      case 'StrategyDied': this.setStatus(e.strategyId, 'dead'); break;
      case 'BreedingExecuted': {
        this.breedingEvents.push({ parentA: e.parentA, parentB: e.parentB, child: e.child, breeder: e.breeder, feePaid: e.feePaid });
        this.lineageEdges.push({ child: e.child, parent: e.parentA, kind: 'bred' });
        this.lineageEdges.push({ child: e.child, parent: e.parentB, kind: 'bred' });
        this.bumpOffspring(e.parentA); this.bumpOffspring(e.parentB);
        break;
      }
      case 'StrategyCopied': {
        this.copyRelationships.push({ original: e.original, derived: e.derived, copier: e.copier, feePaid: e.feePaid });
        this.lineageEdges.push({ child: e.derived, parent: e.original, kind: 'copied' });
        const o = this.strategies.get(e.original); if (o) o.copiesCount++;
        break;
      }
      case 'PerformanceSnapshot': {
        this.performanceSnapshots.push({ strategyId: e.strategyId, fitness: e.fitness, pnl: e.pnl, ts: e.ts });
        const s = this.strategies.get(e.strategyId); if (s) s.fitness = e.fitness;
        break;
      }
      case 'GreeksUpdated': /* portfolio read-model omitted for brevity */ break;
    }
  }

  private setStatus(id: string, status: StrategyRow['status']) {
    const s = this.strategies.get(id); if (s) s.status = status;
  }
  private bumpOffspring(id: string) {
    const s = this.strategies.get(id); if (s) s.offspringCount++;
  }

  // top-N by fitness (test 3.30)
  leaderboard(n = 10): StrategyRow[] {
    return [...this.strategies.values()].sort((a, b) => b.fitness - a.fitness).slice(0, n);
  }

  // ancestors of a strategy, walking child→parent edges (test 3.31)
  ancestors(strategyId: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const visit = (id: string) => {
      for (const edge of this.lineageEdges) {
        if (edge.child === id && !seen.has(edge.parent)) {
          seen.add(edge.parent); out.push(edge.parent); visit(edge.parent);
        }
      }
    };
    visit(strategyId);
    return out;
  }

  descendants(strategyId: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const visit = (id: string) => {
      for (const edge of this.lineageEdges) {
        if (edge.parent === id && !seen.has(edge.child)) {
          seen.add(edge.child); out.push(edge.child); visit(edge.child);
        }
      }
    };
    visit(strategyId);
    return out;
  }

  getStrategy(id: string): StrategyRow | undefined { return this.strategies.get(id); }
}
