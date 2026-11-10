// passport/offchain/summary — the Forecaster Passport (NEXT_BIG.md §3): a public, verifiable record for
// any forecaster, human or agent. Every number comes from recalled Walrus Memory or Sui chain events.
//
// "Committed N · shown N · hidden 0" counts ConvictionCommitted events by the address (chain) against the
// CONVICTION memories that carry the same hash — a hidden losing call shows up as hidden, it can't vanish.

import { gql } from '../../shared/tatum.ts';
import { recallForAddress, recallAll } from '../../memory/store.ts';
import { settledRows, commitLedger } from '../../memory/service.ts';
import { commitsBy, commitBody } from '../../memory/commit.ts';
import { bucketStats, MIN_N } from '../../memory/calibration.ts';
import { bucketOfConviction, namespaceFor, str, num, type MemRecord } from '../../memory/format.ts';
import { council } from '../../council/state.ts';
import { badgeMask, badgeNames, pubkeyHex } from './attest.ts';

const isAddr = (a: string) => /^0x[0-9a-fA-F]{64}$/.test(a);
const nsToOwner = new Map<string, string>();
export const learnOwner = (address: string) => { nsToOwner.set(namespaceFor(address), address.toLowerCase()); };

/**
 * A passport id is an address or a namespace. A namespace resolves to its owner from public data only:
 * any CONVICTION in it carries a commit digest, and that transaction's sender is the owner.
 */
export async function resolveOwner(id: string): Promise<string | null> {
  const x = id.replace(/\.json$/i, '').trim();
  if (isAddr(x)) return x.toLowerCase();
  if (!/^[a-z0-9-]+-[0-9a-f]{12}$/.test(x)) return null;
  for (const a of [process.env.DEMO_ADDRESS, ...council.agents.map((g) => g.address)]) if (a && isAddr(a.trim())) learnOwner(a.trim());
  if (nsToOwner.has(x)) return nsToOwner.get(x)!;
  const recs = await recallAll(x).catch(() => [] as MemRecord[]);
  const tx = recs.map((r) => (r.type === 'CONVICTION' ? str(r, 'tx') : null)).find(Boolean);
  if (!tx) return null;
  const r: any = await gql('testnet', `query($d:String!){ transaction(digest:$d){ sender { address } } }`, { d: tx });
  const owner = r.data?.transaction?.sender?.address;
  if (!owner || namespaceFor(owner) !== x) return null;
  learnOwner(owner);
  return owner.toLowerCase();
}

export interface PassportCommit {
  digest: string | null; hash: string | null; market: string; expiry_ms: number; committed_ms: number;
  status: 'settled' | 'pending' | 'recording' | 'hidden';
  call?: { dir: string | null; conf: number | null; structure: string | null; order: string | null; p_you: number | null; p_mkt: number | null; origin: string | null };
  conviction_blob?: string; outcome_blob?: string; result?: string | null; payoff?: number | null; reveal_ok?: string | null;
  prices?: { settle: number | null; oracle: string; sources: { name: string; usd: number; bps: number }[] } | null;
  verified_at_settlement?: boolean;
  text?: string;                       // the remembered CONVICTION line — the browser re-hashes it against the chain
}

export async function passportFor(address: string, opts: { commits?: number } = {}) {
  const owner = address.toLowerCase();
  learnOwner(owner);
  const ns = namespaceFor(owner);
  const recs = await recallForAddress(owner);
  const rows = settledRows(recs);
  const st = bucketStats(rows);
  const ledger: any = await commitLedger(owner, recs).catch((e) => ({ error: (e as Error).message }));
  const evs = await commitsBy(owner).catch(() => []);

  // per-setup posteriors (n ≥ 3) → best and worst
  const byBucket = new Map<string, typeof rows>();
  for (const r of rows) {
    const c = recs.find((x) => x.type === 'CONVICTION' && str(x, 'tx') === r.tx);
    const b = c ? bucketOfConviction(c) : null;
    if (b) (byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(r);
  }
  const setups = [...byBucket].map(([bucket, rs]) => ({ bucket, ...bucketStats(rs) })).filter((b) => b.n >= MIN_N)
    .map((b) => ({ bucket: b.bucket, n: b.n, wins: b.wins, posterior: b.posterior, brier_you: b.brier.you }))
    .sort((a, b) => b.posterior - a.posterior);
  const lessons = recs.filter((r) => r.type === 'LESSON');
  const latestLesson = lessons.sort((a, b) => (num(a, 'ts') ?? 0) - (num(b, 'ts') ?? 0)).at(-1);

  // badges (bitmask shared with the on-chain passport)
  const convByTx = new Map(recs.filter((r) => r.type === 'CONVICTION').map((r) => [str(r, 'tx'), r]));
  // only calls the market actually priced (ETH/SUI have no market voice; a missing p_mkt must not read as 0)
  const contrarianWins = rows.filter((r) => r.won === 1 && r.p_mkt != null && r.p_mkt < 0.5).length;
  const assets = new Map<string, number>();
  for (const r of rows) { const a = str(convByTx.get(r.tx), 'asset') ?? 'BTC'; assets.set(a, (assets.get(a) ?? 0) + 1); }
  // unknown (ledger unreadable) stays null — never a default 0 that would look like an honest record
  const hidden: number | null = ledger && !ledger.error && Number.isFinite(ledger.missing_memory) ? ledger.missing_memory : null;
  const badges = badgeMask({
    n: st.n, brier: st.brier.you, losses: st.n - st.wins, hidden: hidden ?? Number.POSITIVE_INFINITY, contrarianWins,
    councilMember: council.agents.some((g) => g.address.toLowerCase() === owner), assetsWith3: [...assets.values()].filter((n) => n >= 3).length,
  });

  // every commit, newest first, with what the browser needs to verify it independently
  const byHash = new Map(recs.filter((r) => r.type === 'CONVICTION' && str(r, 'hash')).map((r) => [str(r, 'hash')!, r]));
  const outByTx = new Map(recs.filter((r) => r.type === 'OUTCOME').map((r) => [str(r, 'tx'), r]));
  const now = Date.now();
  const commits: PassportCommit[] = evs.slice().sort((a, b) => b.committed_ms - a.committed_ms).slice(0, opts.commits ?? 60).map((e) => {
    const c = e.hash ? byHash.get(e.hash) : undefined;
    // no CONVICTION returned by search, but the watcher's OUTCOME (reveal_ok=true) proves it was remembered and matched
    const vo = !c && e.digest ? outByTx.get(e.digest) : undefined;
    const verified = !!vo && str(vo, 'reveal_ok') === 'true';
    const o = c ? outByTx.get(str(c, 'tx')) : verified ? vo : undefined;
    const status: PassportCommit['status'] = !c && !verified ? (now - e.committed_ms < 120_000 ? 'recording' : 'hidden') : o ? 'settled' : 'pending';
    return {
      digest: e.digest ?? null, hash: e.hash, market: e.oracle, expiry_ms: e.expiry_ms, committed_ms: e.committed_ms, status,
      ...(c ? {
        call: { dir: str(c, 'dir'), conf: num(c, 'conf'), structure: str(c, 'structure'), order: str(c, 'order'), p_you: num(c, 'p_you'), p_mkt: num(c, 'p_mkt'), origin: str(c, 'origin') },
        conviction_blob: c.blob_id, text: commitBody(c.text),
      } : {}),
      ...(verified ? { verified_at_settlement: true } : {}),
      ...(o ? { outcome_blob: o.blob_id, result: str(o, 'result'), payoff: num(o, 'payoff'), reveal_ok: str(o, 'reveal_ok'),
        prices: priceSources(c, o) } : {}),
    };
  });

  return {
    kind: council.agents.some((g) => g.address.toLowerCase() === owner) ? 'agent' : 'forecaster',
    agent: council.agents.find((g) => g.address.toLowerCase() === owner)?.name ?? null,
    address: owner, namespace: ns,
    n_settled: st.n, wins: st.wins, win_rate: st.n ? st.wins / st.n : null, posterior: st.posterior,
    brier: st.brier.you, brier_by_voice: st.brier, gap_you: st.gap_you,
    best_setup: setups[0] ?? null, worst_setup: setups.length > 1 ? setups.at(-1)! : null, setups,
    latest_lesson: latestLesson ? { text: str(latestLesson, 'text'), bucket: str(latestLesson, 'bucket'), blob_id: latestLesson.blob_id } : null,
    // N3: signed snapshots of this passport frozen on Walrus (newest first)
    reports: recs.filter((r) => r.type === 'REPORT' && str(r, 'blob')).sort((a, b) => (num(b, 'ts') ?? 0) - (num(a, 'ts') ?? 0)).slice(0, 3)
      .map((r) => ({ blob_id: str(r, 'blob'), network: str(r, 'network'), ts: num(r, 'ts'), committed: num(r, 'committed'), hidden: num(r, 'hidden'), memory_blob: r.blob_id })),
    committed: ledger?.onchain ?? evs.length, shown: ledger?.with_memory ?? null, hidden, ledger_ok: hidden != null, recording: ledger?.recording ?? 0,
    badges, badge_names: badgeNames(badges),
    memory_count: recs.length, commits,
    issued_ms: now, attestor_pubkey_hex: pubkeyHex(),
  };
}

/** T3: every independent price recorded at settlement, as bps from the settlement price (from the OUTCOME memory). */
export function priceSources(conv: MemRecord | undefined, o: MemRecord) {
  const settle = num(o, 'settle_px');
  if (settle == null || str(o, 'result') === 'VOID') return null;
  const asset = (conv && str(conv, 'asset')) || 'BTC';
  const oracle = asset === 'BTC' ? 'DeepBook Predict oracle' : 'Pyth';
  const sources: { name: string; usd: number; bps: number }[] = [];
  const add = (name: string, usd: number | null, bps: number | null) => { if (usd != null && bps != null) sources.push({ name, usd, bps }); };
  add('Tatum', num(o, 'witness_usd'), num(o, 'witness_bps'));
  if (asset === 'BTC') add('Pyth', num(o, 'pyth_usd'), num(o, 'pyth_bps'));
  return { settle, oracle, sources };
}
