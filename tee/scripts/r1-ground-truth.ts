// r1-ground-truth — RECOVERY.md R1: what is live on DeepBook Predict testnet RIGHT NOW,
// read on-chain through the Tatum GraphQL chokepoint (never the Predict server).
//
//   node --env-file=../.env scripts/r1-ground-truth.ts [--md ../docs/PREDICT_V4_IDS.md]
//
// Prints a JSON report (a–f) and, with --md, writes the ID table to docs/PREDICT_V4_IDS.md.

import { writeFileSync } from 'node:fs';
import { getDeployment, getConfig } from '@mysten/deepbook-v3/predict';
import { gql, stats } from '../src/shared/tatum.ts';
import { pc, liveMarkets, pricerFor, sviAgeSeconds, settlementOf } from '../src/predict/predict.ts';

const args = process.argv.slice(2);
const mdOut = args.includes('--md') ? args[args.indexOf('--md') + 1] : null;
const OLD_PKG = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const QUOTE_PKG = '0xc028557a1ed49e42ed091e115aedefd70a442b184c18fbec5c48d5b6c0b8c184';
const RECOVERY_CALL_TARGET = '0x0654ecbed7c0f2645d9de7cb6cf08e65c2ee05cdbb39a415f17a6bd1cd92e267';
const iso = (ms: number | string | null | undefined) => (ms == null ? null : new Date(Number(ms)).toISOString());

async function q(query: string, variables?: Record<string, unknown>) {
  const r = await gql('testnet', query, variables);
  if (r.errors?.length) throw new Error(JSON.stringify(r.errors[0]).slice(0, 300));
  return r.data as any;
}

/** Latest events whose type starts with `prefix` (package, package::module or full type). */
async function lastEvents(prefix: string, n = 50) {
  const d = await q(`query($t:String!,$n:Int!){ events(last:$n, filter:{type:$t}) { nodes { timestamp contents { type { repr } json } transaction { digest } } } }`, { t: prefix, n });
  return (d?.events?.nodes ?? []).map((e: any) => ({ type: e.contents?.type?.repr as string, ts: e.timestamp as string, json: e.contents?.json, digest: e.transaction?.digest }));
}

const report: Record<string, any> = {};

// (a) deployment + ids from the SDK, cross-checked on-chain
const dep: any = getDeployment('testnet');
const cfg: any = getConfig('testnet');
const predictCfg = cfg.predict ?? cfg;
const pk = predictCfg.packages ?? {};
const versions = await q(`query($a:SuiAddress!){ packageVersions(address:$a, last:20) { nodes { address version } } }`, { a: pk.predictV1 });
const onchainVersions = versions?.packageVersions?.nodes ?? [];
const latestOnchain = onchainVersions.at(-1);
report.a = {
  deployment: dep.deployment ?? dep, sourceCommit: dep.sourceCommit, chainId: dep.chainId,
  assertDeploymentName: (dep.deployment ?? '') === 'deepbook-predict-testnet',
  sdkCallTarget: pk.predict, originalPackage: pk.predictV1,
  onchainLatestVersion: latestOnchain, sdkTargetIsLatest: latestOnchain?.address === pk.predict,
  recoveryDocCallTarget: RECOVERY_CALL_TARGET,
  recoveryTargetIsAVersion: onchainVersions.some((v: any) => v.address === RECOVERY_CALL_TARGET),
  versions: onchainVersions,
  objects: predictCfg.objects, quoteCoinType: predictCfg.quoteCoinType, packages: pk,
};

// (b) oracle / market liveness on the original package
const evs = await lastEvents(pk.predictV1, 50);
const byType: Record<string, { n: number; last: string }> = {};
for (const e of evs) {
  const t = e.type.replace(/^0x[0-9a-f]+::/, '').replace(/<.*$/, '');
  byType[t] = { n: (byType[t]?.n ?? 0) + 1, last: byType[t]?.last && byType[t].last > e.ts ? byType[t].last : e.ts };
}
const now = Date.now();
const markets = await liveMarkets(now);
const open = markets.filter((m) => m.expiryMs > now).sort((a, b) => a.expiryMs - b.expiryMs);
const expired = markets.filter((m) => m.expiryMs <= now).sort((a, b) => b.expiryMs - a.expiryMs).slice(0, 10);
const settlements = [];
for (const m of expired) {
  const s = await settlementOf({ expiryMs: m.expiryMs, marketId: m.id });
  settlements.push({ market: m.id, expiry: iso(m.expiryMs), settled: s.settled, price: s.price });
}
// settlement events, if the package emits them under a recognisable name
const settleTypes = Object.keys(byType).filter((t) => /settl/i.test(t));
let settleEvents: any[] = [];
for (const t of settleTypes.slice(0, 2)) {
  const full = evs.find((e: any) => e.type.includes(t))?.type.replace(/<.*$/, '');
  if (full) settleEvents = settleEvents.concat((await lastEvents(full, 10)).map((e: any) => ({ type: t, ts: e.ts, digest: e.digest, json: e.json })));
}
report.b = {
  recentEventTypes: byType,
  openMarkets: open.map((m) => ({ id: m.id, expiry: iso(m.expiryMs), minutesLeft: +((m.expiryMs - now) / 60000).toFixed(2), referencePrice: m.referencePrice, mintPaused: m.mintPaused })),
  last10ExpiredMarkets: settlements,
  settlementEvents: settleEvents.slice(0, 10),
  rollingSubHourNow: open.length > 0 && open[0].expiryMs - now < 60 * 60_000,
  settlingNow: settlements.some((s) => s.settled && Date.parse(s.expiry!) > now - 30 * 60_000),
};

// (c) what the compiler prices against (same code path as /compile)
const firstOpen = open.find((m) => m.referencePrice != null && !m.mintPaused) ?? open[0];
if (firstOpen) {
  const pv = await pricerFor(firstOpen, now);
  report.c = {
    path: 'tee/src/predict/predict.ts pricerFor() → @mysten/deepbook-v3/predict read.pricer over Tatum GraphQL (on-chain; Predict server never used)',
    market: firstOpen.id, forward: pv.forward, svi: pv.svi, sources: pv.sources && Object.fromEntries(Object.entries(pv.sources).map(([k, v]) => [k, iso(v as number)])),
    sviAgeSeconds: sviAgeSeconds(pv, Date.now()),
  };
}

// (d) the old predict-testnet-4-16 deployment
const oldEv = await lastEvents(OLD_PKG, 5).catch((e) => [{ error: String(e.message ?? e) }]);
report.d = {
  package: OLD_PKG,
  lastEvents: oldEv.map((e: any) => (e.error ? e : { type: e.type?.replace(/^0x[0-9a-f]+::/, ''), ts: e.ts, digest: e.digest })),
  stillUpdating: oldEv.some((e: any) => e.ts && Date.parse(e.ts) > now - 24 * 3600_000),
};

// (e) the quote coin package: any faucet-style public mint? any DeepBook pool quoting it?
const mods = await q(`query($a:SuiAddress!){ package(address:$a) { modules { nodes { name functions { nodes { name visibility isEntry } } } } } }`, { a: QUOTE_PKG });
const capOwners = await q(`query($t:String!){ objects(first:5, filter:{type:$t}) { nodes { address owner { __typename ... on AddressOwner { address { address } } } } } }`,
  { t: `0x2::coin::TreasuryCap<${predictCfg.quoteCoinType}>` }).catch((e) => ({ error: String(e.message ?? e) }));
const poolEvents = await lastEvents("0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982::pool::PoolCreated", 50).catch(() => []);
const poolsWithQuote = poolEvents.filter((e: any) => JSON.stringify(e.json ?? {}).includes(QUOTE_PKG.slice(2)) || (e.type ?? '').includes(QUOTE_PKG));
report.e = {
  modules: (mods?.package?.modules?.nodes ?? []).map((m: any) => ({ module: m.name, functions: (m.functions?.nodes ?? []).map((f: any) => `${f.visibility}${f.isEntry ? ' entry' : ''} ${f.name}`) })),
  treasuryCap: capOwners,
  deepbookPoolsQuotingIt: poolsWithQuote.length, poolCreatedEventsScanned: poolEvents.length,
};

// (f) which order flow our simulations used
report.f = {
  flow: 'delayed execution: predict.tx.planMint/enqueuePlan (queue::enqueue_mint …) — keeper fills at Pyth price; immediate mint is NOT used (tee/src/predict/predict.ts buildMintTx)',
};
report.tatum = { requests: stats.requests, retries: stats.retries, plan: stats.plan };

console.log(JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

if (mdOut) {
  const a = report.a;
  const rows = [
    ['Deployment name (SDK `getDeployment`)', `\`${a.deployment}\` — asserted: ${a.assertDeploymentName ? 'yes' : 'NO'}`],
    ['Source commit', `\`${a.sourceCommit}\``],
    ['Chain id', `\`${a.chainId}\``],
    ['Call target (SDK `packages.predict`)', `\`${a.sdkCallTarget}\` — latest on-chain version: ${a.sdkTargetIsLatest ? 'yes' : 'no (latest is `' + a.onchainLatestVersion?.address + '`)'}`],
    ['Original package (types, events)', `\`${a.originalPackage}\``],
    ['RECOVERY.md call target `0x0654…e267`', a.recoveryTargetIsAVersion ? 'an earlier version of the same package (superseded by the SDK target)' : 'not a version of the original package'],
    ...Object.entries(a.objects ?? {}).map(([k, v]) => [`Object \`${k}\``, `\`${v}\``]),
    ...Object.entries(a.packages ?? {}).filter(([k]) => !['predict', 'predictV1'].includes(k)).map(([k, v]) => [`Package \`${k}\``, `\`${v}\``]),
    ['Quote coin', `\`${a.quoteCoinType}\` (6 decimals)`],
  ];
  const md = `# DeepBook Predict — current testnet deployment (verified on-chain)

> Generated ${new Date().toISOString()} by \`tee/scripts/r1-ground-truth.ts\` — every value below is read from
> \`@mysten/deepbook-v3@2.11.1\` \`getDeployment('testnet')\` / \`getConfig('testnet')\` and cross-checked on-chain through
> Tatum GraphQL (\`packageVersions\`). Earlier deployments (\`predict-testnet-4-16\`, \`0xf5ea…5138\`) are superseded.

| Item | Value |
|---|---|
${rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## On-chain package versions (original \`${a.originalPackage.slice(0, 10)}…\`)

| Version | Address |
|---|---|
${(a.versions ?? []).map((v: any) => `| ${v.version} | \`${v.address}\` |`).join('\n')}

## Liveness at generation time

- Open BTC windows: ${report.b.openMarkets.length} (next expiry ${report.b.openMarkets[0]?.expiry ?? '—'}); rolling sub-hour: **${report.b.rollingSubHourNow}**; settling now: **${report.b.settlingNow}**.
- Compiler SVI age: **${report.c?.sviAgeSeconds ?? '—'} s** (pricer read on-chain via Tatum).
- Old 4-16 deployment still emitting events in the last 24 h: **${report.d.stillUpdating}**.
- Quote-coin package public functions: ${report.e.modules.map((m: any) => `\`${m.module}\`: ${m.functions.filter((f: string) => f.startsWith('PUBLIC') || f.includes('entry')).join(', ') || '—'}`).join('; ')}.
- DeepBook spot pools quoting the coin (from \`PoolCreated\` events scanned: ${report.e.poolCreatedEventsScanned}): ${report.e.deepbookPoolsQuotingIt}.
- Order flow used by HELIX: ${report.f.flow}.
`;
  writeFileSync(mdOut, md);
  console.error(`wrote ${mdOut}`);
}
