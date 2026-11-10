// Pull the live numbers the video speaks and shows, then write the narration manifests from them.
// Every number in the voiceover comes from the production API at recording time (FINAL_CHECK §7).
//   node gen-live.mjs
import { writeFileSync } from 'node:fs';
const API = 'https://helix-compiler.onrender.com';
const DEMO = '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
const get = async (p) => { const r = await fetch(API + p, { signal: AbortSignal.timeout(120_000) }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); };

const [ticker, mem, pass, council, audit, ops, div] = await Promise.all([
  get('/proof/ticker'), get(`/memory/${DEMO}`), get('/passport/helix-v1-4d922636976d'), get('/council'), get('/proof/audit'), get('/ops/tatum'), get(`/memory/${DEMO}/dividend`),
]);
const o = mem.overall, p = pass.passport;
const pct = (x) => Math.round(x * 100);
const weights = Object.entries(council.weights ?? {}).sort((a, b) => b[1] - a[1]);
const vet = council.allocator?.vetting?.[0];
const live = {
  at: new Date().toISOString(),
  commits: ticker.commits, settled: ticker.settled, committers: ticker.committers,
  audited: audit.audited ?? ticker.audit?.audited, audit_ok: audit.ok ?? ticker.audit?.ok,
  n: o.n, wins: o.wins, stated: pct(o.mean_p_you), realized: pct(o.realized), gap: Math.round(o.gap_you * 100),
  brier_you: o.brier.you?.toFixed(2), brier_market: o.brier.market?.toFixed(2),
  committed: p.committed, shown: p.shown, hidden: p.hidden, memories: p.memory_count,
  dividend: div.dividend, dividend_n: div.n,
  top_agent: weights[0]?.[0], top_weight: weights[0] ? pct(weights[0][1]) : null,
  vet_n: vet?.n, vet_brier: vet?.brier?.toFixed(2),
  fullnode: ops.direct_fullnode_calls,
};
writeFileSync(new URL('./demos/live.json', import.meta.url), JSON.stringify(live, null, 1));
console.log(live);

const L = live;
const lower = (text, extra = {}) => ({ type: 'lower-third', text, placement: 'bottom-center', motion: 'fade-in', ...extra });
const A = [
  { scene: 'hook', text: 'Every prediction market forgets you the moment it settles. And a track record is the easiest thing in the world to fake. Delete the losers. Screenshot the winners.' },
  { scene: 'promise', text: `HELIX makes a track record you can't fake. Proof of Forecast: built on Sui, remembered on Walrus Memory, and verified through Tatum. ${L.commits} calls are already on chain.` },
  { scene: 'canvas', text: 'You state a conviction with four sliders. HELIX prices it live against DeepBook Predict on Sui, and the payoff follows your hand. Five voices weigh in on the same outcome: you, the market, a regime model, the Polymarket crowd, and a council of A I agents.', overlay: lower('Conviction Canvas · priced live on DeepBook Predict') },
  { scene: 'commit', text: 'Commit, and a hash of your call lands on Sui before the market settles. This is a brand new test wallet with zero SUI. HELIX sponsors the gas. The call can\'t be backdated, and it can\'t be quietly deleted.' },
];
const B = [
  { scene: 'memory', text: `The full call is remembered on Walrus Memory, on mainnet. At settlement, HELIX re-hashes it, checks the chain, and scores every voice. Our demo trader says ${L.stated} percent, and wins ${L.realized} percent of the time.`, overlay: lower(`Every memory on Walrus mainnet · Brier you ${L.brier_you} vs market ${L.brier_market}`) },
  { scene: 'learn', text: 'Scrub back in time and watch memory learn. The gap opens, the evidence grows, and the advice tightens.' },
  { scene: 'effect', text: `So memory changes the next call. In this setup the trader runs ${L.gap} points hot, so HELIX suggests a smaller commit. And the trader's own rule now binds the call: break it, and the override is remembered and scored.` },
  { scene: 'passport', text: `Every forecaster gets a passport: ${L.committed} calls committed, ${L.hidden} hidden, counted from the chain, not from our database. Verify any row: your browser re-hashes the memory, and Tatum confirms the commit through two separate interfaces, GraphQL and g R P C.` },
];
const C = [
  { scene: 'council', text: `Four rule-based agents commit around the clock, each with its own wallet and its own memory. Memory decides whom to trust: ${L.top_agent} now carries ${L.top_weight} percent. And an allocator agent paid to read our demo trader's record, and rejected it.` },
  { scene: 'paid', text: 'Because a record you can verify is worth paying for. H T T P 402, pay a cent in USDC on Sui, and get the record with a receipt.' },
  { scene: 'ask', text: 'Ask your memory a question in plain words. The answer comes from Walrus Memory, and it cites the exact blobs it used.' },
  { scene: 'ops', text: `And every Sui call goes through Tatum. Measured, not promised: ${L.fullnode === 0 ? 'zero' : L.fullnode} direct fullnode calls, and all ${L.audited} commits re-verified on chain.` },
  { scene: 'outro', text: 'HELIX. Proof of Forecast. A track record you can\'t fake, that learns, and that people and agents can trust.' },
];
for (const [name, scenes] of [['helix-a', A], ['helix-b', B], ['helix-c', C]]) {
  writeFileSync(new URL(`./demos/${name}.scenes.json`, import.meta.url), JSON.stringify(scenes, null, 2));
}
console.log('words', [...A, ...B, ...C].reduce((n, s) => n + s.text.split(/\s+/).length, 0));
