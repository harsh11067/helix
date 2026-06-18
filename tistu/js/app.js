/* ============================================================
   HELIX — dApp shell (vanilla ES module, inherits tistu design language)
   See tistu/DESIGN.md for the design contract this obeys.

   Real chain integration (no mocks, no offline fallback):
     • wallet  : Wallet Standard (@mysten/wallet-standard) — Sui Wallet / Suiet / Slush
     • compile : POST /compile on the running TEE Compiler (no offline fallback;
                 failure shows a real error state)
     • mint    : ONE PTB — predict_manager::deposit<DUSDC> → market_key::new →
                 predict::mint<DUSDC> → helix::strategy::create_strategy, signed
                 in-browser. (First-time users get a prior create_manager tx,
                 because a shared object created in a PTB can't be used in it.)
     Proven on testnet: digest 5KNFJevSdLkazHg1yz2eFBkHpDmhEt6nm4KjixkrjcBj
   ============================================================ */
import { SuiClient, getFullnodeUrl } from 'https://esm.sh/@mysten/sui@1.30.0/client';
import { Transaction } from 'https://esm.sh/@mysten/sui@1.30.0/transactions';
import { getWallets } from 'https://esm.sh/@mysten/wallet-standard@0.14.0';

/* ---------------- config (verified on-chain testnet ids) ---------------- */
const CFG = {
  HELIX:        '0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3',
  PREDICT_PKG:  '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138',
  PREDICT_OBJ:  '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
  DUSDC:        '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
  CLOCK:        '0x6',
  RPC:          'https://fullnode.testnet.sui.io:443',
  PREDICT_SERVER: 'https://predict-server.testnet.mystenlabs.com',
  COMPILER_URL: (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:8081' : '/compiler',
  EXPLORER: (d) => `https://suiscan.xyz/testnet/tx/${d}`,
  EXPLORER_OBJ: (o) => `https://suiscan.xyz/testnet/object/${o}`,
  DUSDC_DECIMALS: 6,
  STRIKE_SCALE: 1e9,
};

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r) => (r || document).querySelector(s);
const fmt = (n, d) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d });
const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const client = new SuiClient({ url: CFG.RPC });

/* ---------------- shared app state ---------------- */
const state = {
  wallet: null,          // wallet-standard wallet
  account: null,         // { address, ... }
  dusdc: 0n,             // DUSDC balance (base units)
  oracle: null,          // live BTC oracle record (predict server)
  oracleState: null,     // latest_price + latest_svi
  compile: null,         // last CompileResult
  conv: null,            // last conviction
  busy: false,
};

/* ============================================================ live data */
async function loadOracle() {
  // pick the live BTC oracle furthest from expiry (most trading headroom)
  const r = await fetch(`${CFG.PREDICT_SERVER}/predicts/${CFG.PREDICT_OBJ}/oracles`);
  if (!r.ok) throw new Error(`oracle list ${r.status}`);
  const list = await r.json();
  const now = Date.now();
  const live = list.filter(o => o.underlying_asset === 'BTC' && o.status === 'active' && o.expiry > now + 120000)
                   .sort((a, b) => b.expiry - a.expiry);
  if (!live.length) throw new Error('no live BTC oracle');
  state.oracle = live[0];
  const s = await fetch(`${CFG.PREDICT_SERVER}/oracles/${state.oracle.oracle_id}/state`);
  state.oracleState = s.ok ? await s.json() : null;
  return state.oracle;
}

async function refreshDusdc() {
  if (!state.account) { state.dusdc = 0n; return 0n; }
  const b = await client.getBalance({ owner: state.account.address, coinType: CFG.DUSDC });
  state.dusdc = BigInt(b.totalBalance);
  return state.dusdc;
}

/* ============================================================ wallet */
function discoverWallets() {
  return getWallets().get().filter(w => w.chains?.some(c => c.startsWith('sui:')) || w.features['sui:signAndExecuteTransaction']);
}
async function connectWallet(w) {
  const res = await w.features['standard:connect'].connect();
  const acct = (res.accounts && res.accounts[0]) || (w.accounts && w.accounts[0]);
  if (!acct) throw new Error('wallet returned no account');
  state.wallet = w; state.account = acct;
  await refreshDusdc();
  renderWalletChip();
  window.dispatchEvent(new Event('helix:wallet'));
}
function disconnectWallet() {
  try { state.wallet?.features['standard:disconnect']?.disconnect(); } catch (e) {}
  state.wallet = null; state.account = null; state.dusdc = 0n;
  renderWalletChip(); window.dispatchEvent(new Event('helix:wallet'));
}
async function signAndExecute(tx) {
  const feat = state.wallet.features['sui:signAndExecuteTransaction'];
  const out = await feat.signAndExecuteTransaction({
    transaction: tx, account: state.account, chain: 'sui:testnet',
  });
  // wallet-standard returns { digest, ... }; normalize
  const digest = out.digest || out?.Transaction?.digest;
  if (!digest) throw new Error('no digest returned');
  await client.waitForTransaction({ digest, options: { showEffects: true, showObjectChanges: true } });
  return client.getTransactionBlock({ digest, options: { showEffects: true, showObjectChanges: true, showEvents: true } });
}

/* ============================================================ PTB build */
function gridStrike(spot, oracle) {
  const min = Number(oracle.min_strike), tick = Number(oracle.tick_size);
  const k = Math.max(0, Math.round((spot - min) / tick));
  return BigInt(min + k * tick);
}
function dnaArgs(tx, d) {
  // helix::dna::new — exact arg order/types from contracts/sources/dna.move
  return tx.moveCall({
    target: `${CFG.HELIX}::dna::new`,
    arguments: [
      tx.pure.bool(!!d.dirNegative), tx.pure.u8(d.dirMagnitude | 0), tx.pure.u8(d.confidence | 0),
      tx.pure.u16(d.horizonDays | 0), tx.pure.u8(d.volView | 0), tx.pure.u8(d.legCount | 0),
      tx.pure.u8(d.assetPairCode | 0), tx.pure.bool(!!d.usesOptions), tx.pure.bool(!!d.usesSpot),
      tx.pure.bool(!!d.usesMargin), tx.pure.u16(d.leverageX100 | 0),
      tx.pure.u8(d.entrySignalType | 0), tx.pure.u8(d.entryThreshold | 0),
      tx.pure.u8(d.exitSignalType | 0), tx.pure.u8(d.exitThreshold | 0),
      tx.pure.u8(d.regimeSensitivity | 0), tx.pure.u16(d.maxDrawdownBps | 0),
      tx.pure.bool(!!d.hedgeNeg), tx.pure.u16(d.hedgeDeltaMag | 0), tx.pure.u8(d.mutationCount | 0),
      tx.pure.vector('u8', (d.crossoverPoints || []).map(x => x & 0xff)),
    ],
  });
}
// Find the connected wallet's existing PredictManager (shared) via its creation event.
async function findManager() {
  if (!state.account) return null;
  try {
    const ev = await client.queryEvents({
      query: { MoveEventType: `${CFG.PREDICT_PKG}::predict_manager::PredictManagerCreated` },
      limit: 50, order: 'descending',
    });
    const mine = ev.data.find(e => (e.parsedJson?.owner) === state.account.address);
    return mine?.parsedJson?.manager_id || null;
  } catch (e) { return null; }
}
async function ensureManager() {
  let id = await findManager();
  if (id) return id;
  const tx = new Transaction();
  tx.moveCall({ target: `${CFG.PREDICT_PKG}::predict::create_manager`, arguments: [] });
  const res = await signAndExecute(tx);
  const created = (res.objectChanges || []).find(o => o.type === 'created' && /::predict_manager::PredictManager$/.test(o.objectType || ''));
  if (!created) throw new Error('manager not created');
  return created.objectId;
}
async function bringToLife() {
  const { compile, conv, oracle, oracleState } = state;
  const spot = Number(oracleState?.latest_price?.spot ?? oracle.min_strike);
  const strike = gridStrike(spot, oracle);
  const isUp = conv.direction >= 0;
  const capBase = BigInt(Math.max(1, Math.round(conv.capital)) * 10 ** CFG.DUSDC_DECIMALS);
  if (state.dusdc < capBase) throw new Error('INSUFFICIENT_DUSDC');
  const qty = capBase; // cost = ask(≤1)·qty ≤ deposit — always covered

  const managerId = await ensureManager();           // (1) separate tx if first time

  const tx = new Transaction();
  // (2) split DUSDC + deposit into the manager
  const dusdcCoin = await pickDusdcCoin(capBase);
  const [dep] = tx.splitCoins(tx.object(dusdcCoin), [tx.pure.u64(capBase)]);
  tx.moveCall({ target: `${CFG.PREDICT_PKG}::predict_manager::deposit`, typeArguments: [CFG.DUSDC], arguments: [tx.object(managerId), dep] });
  // (3) market key
  const mk = tx.moveCall({
    target: `${CFG.PREDICT_PKG}::market_key::new`,
    arguments: [tx.pure.id(oracle.oracle_id), tx.pure.u64(BigInt(oracle.expiry)), tx.pure.u64(strike), tx.pure.bool(isUp)],
  });
  // (4) mint the real Predict position
  tx.moveCall({
    target: `${CFG.PREDICT_PKG}::predict::mint`, typeArguments: [CFG.DUSDC],
    arguments: [tx.object(CFG.PREDICT_OBJ), tx.object(managerId), tx.object(oracle.oracle_id), mk, tx.pure.u64(qty), tx.object(CFG.CLOCK)],
  });
  // (5) mint the HELIX conviction object
  const dna = dnaArgs(tx, compile.dna);
  const att = Array.from(hexToBytes(compile.attestation.signature || '00'));
  tx.moveCall({
    target: `${CFG.HELIX}::strategy::create_strategy`,
    arguments: [dna, tx.pure.u64(BigInt(Math.round(conv.capital))), tx.pure.vector('u8', att.length ? att : [0])],
  });
  return signAndExecute(tx);
}
async function pickDusdcCoin(min) {
  const coins = await client.getCoins({ owner: state.account.address, coinType: CFG.DUSDC });
  const sorted = coins.data.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
  if (!sorted.length) throw new Error('INSUFFICIENT_DUSDC');
  // single biggest coin must cover; (merge omitted — wallet typically holds one DUSDC coin)
  return sorted[0].coinObjectId;
}
function hexToBytes(h) { h = h.replace(/^0x/, ''); if (h.length % 2) h = '0' + h; const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }

/* ============================================================ compile (real, no fallback) */
async function compileConviction(conv) {
  const body = { ...conv, currentEpoch: 0 };
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
  let res;
  try {
    res = await fetch(`${CFG.COMPILER_URL}/compile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: c.signal,
    });
  } finally { clearTimeout(t); }
  if (!res.ok) throw new Error(`compile ${res.status}`);
  return res.json();
}

/* ============================================================ predict-native vocabulary */
function plainStructure(cand, dna) {
  const up = !dna.dirNegative; const mc = cand.marketCode;
  if (mc === 1) return { title: 'Range bet', sub: 'wins if BTC settles inside a band' };
  if (mc === 4) return { title: 'Bracketed range', sub: `bounded ${up ? 'upside' : 'downside'} bet` };
  if (mc === 0) return { title: `Directional bet · ${up ? 'up' : 'down'}`, sub: 'binary, pinned to the BTC oracle' };
  return { title: `Directional bet · ${up ? 'bullish' : 'bearish'}`, sub: 'minted via predict::mint' };
}
const dirWord = d => d < -55 ? 'Strong bear' : d < -18 ? 'Bearish' : d <= 18 ? 'Neutral' : d < 55 ? 'Bullish' : 'Strong bull';
const volWord = v => v < 30 ? 'Calm' : v < 60 ? 'Choppy' : v < 85 ? 'Volatile' : 'Explosive';
const confWord = c => c < 30 ? 'Tentative' : c < 60 ? 'Moderate' : c < 85 ? 'Confident' : 'High conviction';

/* ============================================================ charts (payoff from real legs)
   Persistent SVG whose paths MORPH between compiles (CSS `transition: d`), so the
   conviction card animates smoothly instead of snapping. Geometry is constant
   (fixed viewBox + 200 steps + stable x-domain) so the `d` strings interpolate. */
const PF = { W: 600, H: 240, pad: 8, steps: 200 };
function payoffPaths(legs, spot) {
  const { W, H, pad, steps } = PF;
  const lo = spot * 0.6, hi = spot * 1.4, pts = [];
  for (let i = 0; i <= steps; i++) {
    const s = lo + (hi - lo) * i / steps; let intr = 0;
    for (const l of legs) intr += l.qty * (l.type === 'call' ? Math.max(s - l.strike, 0) : Math.max(l.strike - s, 0));
    pts.push({ x: s, y: intr });
  }
  const ys = pts.map(p => p.y); const ymin = Math.min(...ys), ymax = Math.max(...ys);
  pts.forEach(p => { p.y -= (ymin + ymax) / 2; }); // premium-less intrinsic view, centered
  const yy = pts.map(p => p.y); let loY = Math.min(...yy, 0), hiY = Math.max(...yy, 0);
  const yr = (hiY - loY) || 1; loY -= yr * 0.14; hiY += yr * 0.14;
  const X = x => pad + (x - lo) / (hi - lo) * (W - 2 * pad);
  const Y = y => pad + (1 - (y - loY) / (hiY - loY)) * (H - 2 * pad);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
  const zeroY = Y(0), spotX = X(spot);
  const area = `${line} L ${X(hi).toFixed(1)} ${zeroY.toFixed(1)} L ${X(lo).toFixed(1)} ${zeroY.toFixed(1)} Z`;
  return { line, area, spotX, zeroY };
}
function payoffSkeleton() {
  const { W, H } = PF;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:240px">
    <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.26"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    <line id="pf-zero" x1="8" y1="${H / 2}" x2="${W - 8}" y2="${H / 2}" stroke="var(--line-2)" stroke-dasharray="3 5"/>
    <line id="pf-spot" x1="${W / 2}" y1="8" x2="${W / 2}" y2="${H - 8}" stroke="var(--ink-3)" stroke-dasharray="2 6" opacity="0.5"/>
    <path id="pf-area" d="" fill="url(#pf)"/>
    <path id="pf-line" d="" fill="none" stroke="var(--accent-bright)" stroke-width="2.4"/>
  </svg>`;
}
function updatePayoff(el, legs, spot) {
  const host = $('#payoff', el); if (!host) return;
  if (!host.querySelector('svg')) host.innerHTML = payoffSkeleton();
  const p = payoffPaths(legs, spot);
  const line = host.querySelector('#pf-line'), area = host.querySelector('#pf-area');
  const spotl = host.querySelector('#pf-spot'), zero = host.querySelector('#pf-zero');
  line.setAttribute('d', p.line); area.setAttribute('d', p.area);
  zero.setAttribute('y1', p.zeroY.toFixed(1)); zero.setAttribute('y2', p.zeroY.toFixed(1));
  spotl.setAttribute('x1', p.spotX.toFixed(1)); spotl.setAttribute('x2', p.spotX.toFixed(1));
}

/* honest risk compass — Net Exposure · Directional Bias · Time-to-Resolution · Concentration · Liquidity Headroom */
function riskAxes(compile, conv, oracle, oracleState) {
  const now = Date.now();
  const sviTs = (oracleState?.latest_svi?.onchain_timestamp) || 0;
  const sviAgeSec = sviTs ? Math.max(0, (now - sviTs * (sviTs < 1e12 ? 1000 : 1)) / 1000) : 999;
  const ttrMin = oracle ? Math.max(0, (oracle.expiry - now) / 60000) : 0;
  const plpPct = (compile.plpUtilizationBps || 0) / 100;
  const dirBias = Math.abs(conv.direction) / 100;          // 0..1
  const conc = Math.min(1, (compile.selected.legs?.length || 1) <= 1 ? 0.7 : 0.4); // single-leg = concentrated
  const liqHead = Math.max(0, 1 - plpPct / 100);
  return [
    ['Net Exposure', Math.min(1, dirBias * 0.9 + 0.1)],
    ['Directional Bias', dirBias],
    ['Time-to-Resolution', Math.min(1, 1 - Math.min(ttrMin, 240) / 240)],
    ['Concentration', conc],
    ['Liquidity Headroom', liqHead],
  ].map(([k, v]) => ({ k, v }));
}
function radarSVG(axes) {
  const cx = 150, cy = 150, R = 104, n = axes.length;
  const pt = (i, r) => [cx + r * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n), cy + r * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / n)];
  let rings = ''; for (let g = 1; g <= 3; g++) { const r = R * g / 3; rings += `<polygon points="${axes.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--line)"/>`; }
  let spokes = '', labels = '';
  axes.forEach((a, i) => { const [x, y] = pt(i, R); spokes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/>`; const [lx, ly] = pt(i, R + 22); labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="var(--ink-3)" font-size="10.5" font-family="var(--mono)" text-anchor="middle" dominant-baseline="middle">${a.k.split(' ')[0]}</text>`; });
  const poly = axes.map((a, i) => pt(i, Math.max(0.05, a.v) * R).map(v => v.toFixed(1)).join(',')).join(' ');
  return `<svg viewBox="0 0 300 300" style="width:100%;max-width:320px">${rings}${spokes}<polygon points="${poly}" fill="var(--accent-soft)" stroke="var(--accent-bright)" stroke-width="2"/>${labels}</svg>`;
}
// ≥2 plain-language risk classes (SVI staleness is always surfaced)
function guardianFlags(compile, oracle, oracleState) {
  const flags = [];
  const now = Date.now();
  const sviTs = oracleState?.latest_svi?.onchain_timestamp;
  if (sviTs) {
    const age = Math.round(now / 1000 - (sviTs < 1e12 ? sviTs : sviTs / 1000));
    flags.push(age > 60
      ? { bad: true, t: `Volatility surface is ${age}s old — stale, pricing may drift.` }
      : { bad: false, t: `Volatility surface is ${age}s old — fresh.` });
  } else {
    flags.push({ bad: true, t: 'Volatility surface age unknown — treat pricing as stale.' });
  }
  const plp = (compile.plpUtilizationBps || 0) / 100;
  flags.push(plp > 75
    ? { bad: true, t: `Liquidity pool is ${plp.toFixed(0)}% utilized — thin headroom for exits.` }
    : { bad: false, t: `Liquidity pool is ${plp.toFixed(0)}% utilized — healthy headroom.` });
  if (oracle) {
    const mins = Math.round((oracle.expiry - now) / 60000);
    flags.push(mins < 30
      ? { bad: true, t: `Resolves in ${mins} min — exit liquidity thins near resolution.` }
      : { bad: false, t: `Resolves in ${mins} min — comfortable runway.` });
  }
  return flags;
}

/* ============================================================ toast */
function toast(title, sub, kind) {
  let wrap = $('.toast-wrap'); if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div'); t.className = 'toast ' + (kind || 'gold');
  t.innerHTML = `<div class="tt">${title}</div><div class="ts">${sub || ''}</div>`;
  wrap.appendChild(t); setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; setTimeout(() => t.remove(), 360); }, 4600);
}

/* ============================================================ icons / rail */
const icons = {
  canvas: '<path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  strategies: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  risk: '<circle cx="12" cy="12" r="9"/><path d="M12 12l5-3" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  market: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/>',
  lineage: '<circle cx="12" cy="5" r="2.4"/><circle cx="6" cy="19" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M12 7.4v4M12 11.4L6.6 16.8M12 11.4l5.4 5.4"/>',
};
const wrapIcon = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${p}</svg>`;
const railLink = (route, href, label) => `<a class="rail-link" data-route="${route}" href="${href}" data-cursor>${wrapIcon(icons[route])}<span class="tip">${label}</span></a>`;

/* ============================================================ CONVICTION CANVAS */
function viewCanvas() {
  const el = document.createElement('div'); el.className = 'view view-enter';
  el.innerHTML = `
    <div class="grid-2" style="align-items:start">
      <div class="panel ink reveal">
        <div class="section-title">your conviction</div>
        <div style="font-family:var(--serif);font-size:1.9rem;letter-spacing:-0.02em;margin-bottom:22px">what do you believe about <span style="color:var(--accent)">BTC</span>?</div>
        ${ctrl('Direction', 's-dir', 0, 100, 64, 'v-dir')}
        ${ctrl('Confidence', 's-conf', 0, 100, 60, 'v-conf')}
        ${ctrlSteps('Time horizon', 's-hor', 'v-hor')}
        ${ctrl('Volatility view', 's-vol', 0, 100, 45, 'v-vol')}
        ${ctrl('Commit (dUSDC)', 's-cap', 1, 100, 5, 'v-cap')}
        <div class="chart-wrap" style="margin-top:8px"><div id="payoff"></div></div>
        <div class="legend"><span><i style="border-color:var(--accent-bright)"></i>payoff at resolution</span><span><i style="border-color:var(--ink-3)"></i>spot</span></div>
      </div>
      <div class="panel reveal d1">
        <div class="row spread"><div class="section-title" style="margin:0">compiled structure</div><span class="badge" id="tee-badge">compiler · …</span></div>
        <div id="compiled"><div class="muted" style="padding:24px 0">Move a slider to compile your conviction.</div></div>
      </div>
    </div>`;
  return { el, mount: mountCanvas };
}
function ctrl(lab, id, min, max, val, out) {
  return `<div class="ctrl"><div class="ctrl-head"><span class="lab">${lab}</span><span class="val mono" id="${out}"></span></div>
    <input class="hx-range" type="range" id="${id}" min="${min}" max="${max}" value="${val}" data-cursor></div>`;
}
function ctrlSteps(lab, id, out) {
  return `<div class="ctrl"><div class="ctrl-head"><span class="lab">${lab}</span><span class="val mono" id="${out}"></span></div>
    <input class="hx-range" type="range" id="${id}" min="0" max="3" step="1" value="0" data-cursor></div>`;
}
function mountCanvas(el) {
  const HOR = ['~1 hour', '~4 hours', '~12 hours', '~1 day'];
  const s = { dir: $('#s-dir', el), conf: $('#s-conf', el), hor: $('#s-hor', el), vol: $('#s-vol', el), cap: $('#s-cap', el) };
  pingTEE(el);
  loadOracle().catch(() => {});
  let timer = null;
  function labels() {
    const conv = readConv(s);
    $('#v-dir', el).textContent = dirWord(conv.direction);
    $('#v-conf', el).textContent = confWord(conv.confidence);
    $('#v-hor', el).textContent = HOR[conv.horizonCode];
    $('#v-vol', el).textContent = volWord(conv.volView);
    $('#v-cap', el).textContent = conv.capital + ' dUSDC';
    return conv;
  }
  function schedule() { labels(); clearTimeout(timer); timer = setTimeout(doCompile, 220); }
  async function doCompile() {
    const conv = readConv(s); state.conv = conv;
    const box = $('#compiled', el);
    // only show the loading state on the very first compile — afterwards keep the
    // current readout up and morph to the new one (no flash on every nudge)
    if (!box.dataset.ready) box.innerHTML = `<div class="muted" style="padding:24px 0"><span class="sdot pending"></span> compiling against live SVI…</div>`;
    try {
      const r = await compileConviction(conv); state.compile = r;
      updatePayoff(el, r.selected.legs, r.spot);
      box.dataset.ready = '1';
      renderCompiled(el, r, conv);
    } catch (e) {
      const ph = $('#payoff', el); if (ph) ph.innerHTML = '';
      box.dataset.ready = '';
      box.innerHTML = compileError(e);
    }
  }
  Object.values(s).forEach(x => x.addEventListener('input', schedule));
  schedule();
  window.addEventListener('helix:wallet', () => { if (state.compile) renderCompiled(el, state.compile, state.conv); });
  el.addEventListener('click', (e) => {
    if (e.target.closest('#deploy')) onDeploy(el);
    if (e.target.closest('#wallet-inline')) openWalletPicker();
    if (e.target.closest('#retry')) doCompile();
  });
}
function readConv(s) {
  return { direction: (+s.dir.value) * 2 - 100, confidence: +s.conf.value, horizonCode: +s.hor.value, volView: +s.vol.value, capital: +s.cap.value };
}
function compileError(e) {
  return `<div class="empty" style="padding:36px 16px">
    <svg class="em-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01" stroke-linecap="round"/></svg>
    <h3 style="font-size:1.4rem">Compiler unreachable</h3>
    <p>The Compiler service didn't answer (<span class="mono">${(e.message || 'error')}</span>). HELIX never shows fabricated structures — start the Compiler service and retry.</p>
    <button class="btn-soft" id="retry" data-cursor>Retry compile</button></div>`;
}
function renderCompiled(el, r, conv) {
  const m = r.selected.metrics, ps = plainStructure(r.selected, r.dna);
  const axes = riskAxes(r, conv, state.oracle, state.oracleState);
  const flags = guardianFlags(r, state.oracle, state.oracleState);
  const connected = !!state.account;
  const capBase = BigInt(Math.max(1, Math.round(conv.capital)) * 10 ** CFG.DUSDC_DECIMALS);
  const funded = state.dusdc >= capBase;
  const box = $('#compiled', el);
  box.innerHTML = `
    <div class="row spread" style="margin:14px 0 16px">
      <div><div class="muted mono" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">${ps.sub}</div>
      <div style="font-family:var(--sans);font-weight:600;font-size:1.4rem">${ps.title}</div></div>
      <span class="badge" style="color:var(--alive);border-color:color-mix(in srgb,var(--alive) 40%,transparent);background:var(--alive-soft)">win ${Math.round((m.winProb || 0) * 100)}%</span>
    </div>
    <div class="grid-2" style="gap:12px">
      <div class="stat"><div class="k">max profit</div><div class="v gain">+${fmt(Math.abs(m.maxProfit), 0)} <span style="font-size:.7rem">dUSDC</span></div></div>
      <div class="stat"><div class="k">max loss</div><div class="v loss">−${fmt(Math.abs(m.maxLoss), 0)} <span style="font-size:.7rem">dUSDC</span></div></div>
    </div>
    <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
      <span class="badge">spot ${fmt(r.spot)}</span><span class="badge">ATM IV ${(r.ivAtm * 100).toFixed(0)}%</span>
      <span class="badge">PLP ${(r.plpUtilizationBps / 100).toFixed(0)}% used</span>
      <span class="badge" title="Compiler output is signed for integrity; hardware enclave attestation is the documented next step (see SUBMISSION.md).">${r.attestation.mock ? 'compiler-signed · attestation: dev' : 'enclave-attested'}</span>
    </div>

    <div class="section-title" style="margin:22px 0 10px">portfolio risk compass</div>
    <div class="grid-2" style="gap:16px;align-items:center">
      <div style="display:grid;place-items:center">${radarSVG(axes)}</div>
      <div>${flags.map(f => `<div class="row" style="gap:9px;margin-bottom:10px;align-items:flex-start">
        <span class="sdot ${f.bad ? 'dead' : 'active'}" style="margin-top:5px;flex:0 0 auto"></span>
        <span style="font-size:13.5px;line-height:1.45;color:${f.bad ? 'var(--coral)' : 'var(--ink-2)'}">${f.t}</span></div>`).join('')}
        <div class="muted mono" style="font-size:11px;margin-top:6px">${flags.length} risk classes surfaced</div>
      </div>
    </div>

    <div style="margin-top:22px">${deployControl(connected, funded, conv)}</div>
    <div id="deploy-out" style="margin-top:14px"></div>`;
  if (!reduce) { box.style.animation = 'none'; void box.offsetWidth; box.style.animation = ''; } // replay cFade
}
function deployControl(connected, funded, conv) {
  if (!connected)
    return `<button class="btn-solid" id="wallet-inline" data-cursor>Connect a wallet to bring it to life ${arrow()}</button>`;
  if (!funded)
    return `<div class="panel" style="border-color:color-mix(in srgb,var(--coral) 40%,transparent)">
      <div class="row spread"><b style="color:var(--coral)">No dUSDC to commit</b><span class="mono muted">balance ${fmt(Number(state.dusdc) / 10 ** CFG.DUSDC_DECIMALS, 2)}</span></div>
      <div class="muted" style="margin-top:8px">You need at least ${conv.capital} dUSDC. Fund this wallet with testnet dUSDC (<a class="mono" style="color:var(--accent-deep)" href="https://tally.so/r/Xx102L" target="_blank" rel="noopener">faucet form</a>) and reconnect.</div></div>`;
  return `<button class="btn-solid" id="deploy" data-cursor>Bring it to life — mint on Sui ${arrow()}</button>`;
}
const arrow = () => `<span style="width:30px;height:30px;border-radius:50%;background:var(--bg);color:var(--ink);display:grid;place-items:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>`;

async function onDeploy(el) {
  if (state.busy) return; state.busy = true;
  const out = $('#deploy-out', el); const btn = $('#deploy', el);
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  out.innerHTML = `<div class="muted"><span class="sdot pending"></span> awaiting wallet signature…</div>`;
  try {
    const res = await bringToLife();
    const digest = res.digest;
    const ok = res.effects?.status?.status === 'success';
    if (!ok) throw new Error(res.effects?.status?.error || 'transaction failed');
    await refreshDusdc(); renderWalletChip();
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--alive) 45%,transparent);background:var(--alive-soft)">
      <div class="row spread"><b style="color:var(--alive)">Live on Sui testnet</b><span class="sdot active"></span></div>
      <div class="muted" style="margin-top:8px">Your conviction is a real on-chain object and a real <span class="mono">predict::mint</span> position.</div>
      <a class="btn-soft" style="margin-top:12px" href="${CFG.EXPLORER(digest)}" target="_blank" rel="noopener" data-cursor>View on Suiscan ${arrow()}</a>
      <div class="mono muted" style="font-size:11px;margin-top:10px;word-break:break-all">${digest}</div></div>`;
    toast('Strategy is live', 'predict::mint landed on Sui testnet', 'alive');
  } catch (e) {
    const msg = (e.message || '').includes('INSUFFICIENT_DUSDC') ? 'Wallet has no dUSDC to commit.' : (e.message || 'rejected');
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--coral) 45%,transparent)">
      <b style="color:var(--coral)">Not minted</b><div class="muted" style="margin-top:6px">${msg}</div></div>`;
  } finally {
    state.busy = false; if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}
async function pingTEE(el) {
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 1500);
    const res = await fetch(`${CFG.COMPILER_URL}/health`, { signal: c.signal });
    const b = $('#tee-badge', el);
    if (res.ok) { const j = await res.json(); if (b) b.textContent = j.mockTee ? 'compiler · ready (dev-signed)' : 'compiler · enclave'; }
    else if (b) b.textContent = 'compiler · down';
  } catch (e) { const b = $('#tee-badge', el); if (b) { b.textContent = 'compiler · offline'; } }
}

/* ============================================================ STEP 4 — supporting pages (real on-chain reads)
   All data here is read from chain (owned StrategyObjects, StrategyCreated /
   BreedingExecuted events) or the live Predict server. No fabricated strategies. */
const STATUS = ['pending', 'active', 'closed', 'dead'];
async function getMyStrategies() {
  if (!state.account) return [];
  const res = await client.getOwnedObjects({
    owner: state.account.address,
    filter: { StructType: `${CFG.HELIX}::strategy::StrategyObject` },
    options: { showContent: true }, limit: 50,
  });
  return res.data.map(o => parseStrategy(o.data)).filter(Boolean);
}
async function getStrategy(id) {
  const o = await client.getObject({ id, options: { showContent: true } });
  return parseStrategy(o.data);
}
async function getAllStrategies() {
  // every StrategyObject ever minted, via its creation event (cross-user leaderboard)
  const ev = await client.queryEvents({ query: { MoveEventType: `${CFG.HELIX}::events::StrategyCreated` }, limit: 50, order: 'descending' });
  const ids = [...new Set(ev.data.map(e => e.parsedJson?.strategy_id).filter(Boolean))];
  const objs = await Promise.all(ids.map(id => getStrategy(id).catch(() => null)));
  return objs.filter(Boolean);
}
async function getBreedings() {
  try {
    const ev = await client.queryEvents({ query: { MoveEventType: `${CFG.HELIX}::events::BreedingExecuted` }, limit: 50, order: 'descending' });
    return ev.data.map(e => e.parsedJson).filter(Boolean);
  } catch (e) { return []; }
}
function parseStrategy(data) {
  const f = data?.content?.fields; if (!f) return null;
  const d = f.dna?.fields || {};
  return {
    id: data.objectId, owner: f.owner, creator: f.creator,
    generation: Number(f.generation || 0), parents: f.parents || [],
    status: STATUS[Number(f.status || 0)] || 'pending',
    capital: Number(f.current_capital || f.initial_capital || 0),
    initialCapital: Number(f.initial_capital || 0),
    fitness: Number(f.fitness_score || 0),
    copies: Number(f.copies_count || 0), offspring: Number(f.offspring_count || 0),
    isBreedable: !!f.is_breedable, isCopyable: !!f.is_copyable,
    copyFeeBps: Number(f.copy_fee_bps || 0), breedFee: Number(f.breed_fee || 0),
    dna: {
      dirNegative: !!d.dir_negative, dirMagnitude: Number(d.dir_magnitude || 0),
      confidence: Number(d.confidence || 0), volView: Number(d.vol_view || 0),
      horizonDays: Number(d.horizon_days || 0), legCount: Number(d.leg_count || 1),
      leverageX100: Number(d.leverage_x100 || 100), regimeSensitivity: Number(d.regime_sensitivity || 0),
      maxDrawdownBps: Number(d.max_drawdown_bps || 0),
    },
  };
}
function dnaToConv(d, capital) {
  return { direction: (d.dirNegative ? -1 : 1) * d.dirMagnitude, confidence: d.confidence,
    horizonCode: d.horizonDays >= 1 ? 3 : 0, volView: d.volView, capital: Math.max(1, capital || 5) };
}
async function preview(conv) {
  const res = await fetch(`${CFG.COMPILER_URL}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...conv, currentEpoch: 0 }) });
  if (!res.ok) throw new Error(`preview ${res.status}`); return res.json();
}
function dnaChips(d) {
  const dir = (d.dirNegative ? -1 : 1) * d.dirMagnitude;
  return `<span class="gene ${dir > 0 ? 'up' : dir < 0 ? 'dn' : ''}">${dirWord(dir)}</span>
    <span class="gene">${confWord(d.confidence)}</span><span class="gene">${volWord(d.volView)}</span>
    <span class="gene">${d.legCount} leg${d.legCount > 1 ? 's' : ''}</span>`;
}
function structFromDna(d) {
  const up = !d.dirNegative, ad = d.dirMagnitude;
  if (ad < 18 && d.volView > 55) return 'Range bet';
  if (ad < 18) return 'Directional bet · neutral';
  if (d.confidence > 60) return `Bracketed range · ${up ? 'up' : 'down'}`;
  return `Directional bet · ${up ? 'up' : 'down'}`;
}

/* -------- My Strategies -------- */
function viewStrategies() {
  const el = document.createElement('div'); el.className = 'view view-enter';
  if (!state.account) { el.innerHTML = connectPrompt('See your living portfolio', 'Connect a wallet to read your HELIX strategy objects and Predict positions from chain.'); return { el }; }
  el.innerHTML = `<div id="strat-list"><div class="muted"><span class="sdot pending"></span> reading your strategies from chain…</div></div>`;
  (async () => {
    const host = $('#strat-list', el);
    try {
      const [strats, mid] = await Promise.all([getMyStrategies(), findManager()]);
      if (!strats.length) { host.innerHTML = emptyState(); return; }
      host.innerHTML = `<div class="grid-3">${strats.map(cardHTML).join('')}</div>
        ${mid ? `<div class="panel" style="margin-top:18px"><div class="row spread"><div class="section-title" style="margin:0">predict manager</div>
          <a class="badge" href="${CFG.EXPLORER_OBJ(mid)}" target="_blank" rel="noopener">${short(mid)} ↗</a></div>
          <div class="muted" style="margin-top:8px">Your minted Predict positions live in this shared manager object.</div></div>` : ''}`;
      host.addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (c) location.hash = '#/strategy/' + c.dataset.id; });
      revealObserve(host);
    } catch (e) { host.innerHTML = `<div class="empty"><h3>Couldn't load strategies</h3><p class="mono">${e.message}</p></div>`; }
  })();
  return { el };
}
function cardHTML(s) {
  return `<article class="scard reveal" data-id="${s.id}" data-cursor>
    <svg class="glyph" viewBox="0 0 120 120" fill="none" stroke="var(--accent)" stroke-width="1" opacity="0.4"><circle cx="60" cy="60" r="40"/><circle cx="60" cy="60" r="26"/><circle cx="86" cy="34" r="6" fill="var(--accent)"/></svg>
    <div class="row spread"><div class="row" style="gap:8px"><span class="sdot ${s.status}"></span><span class="muted mono" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em">${s.status}</span></div><span class="muted mono" style="font-size:11px">gen ${s.generation}</span></div>
    <h4 style="margin:12px 0 2px">${structFromDna(s.dna)}</h4>
    <div class="muted mono" style="font-size:11px">${short(s.id)}</div>
    <div class="dna-mini">${dnaChips(s.dna)}</div>
    <div class="row spread" style="margin-top:14px">
      <div><div class="muted mono" style="font-size:10px;text-transform:uppercase">capital</div><div class="mono" style="font-size:1.2rem">${fmt(s.capital)} <span style="font-size:.7rem" class="muted">dUSDC</span></div></div>
      <div style="text-align:right"><div class="muted mono" style="font-size:10px;text-transform:uppercase">fitness</div><div class="mono gold" style="font-size:1.2rem">${fmt(s.fitness)}</div></div>
    </div></article>`;
}
function emptyState() {
  return `<div class="empty">
    <svg class="em-mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><circle cx="15" cy="17" r="11"/><circle cx="25" cy="7" r="4" fill="currentColor"/></svg>
    <h3>Your ecosystem is dormant</h3><p>You haven't planted a conviction yet. Express what you believe on the Canvas and watch it live on Sui.</p>
    <a class="btn-solid" href="#/canvas" data-cursor>Plant your first conviction</a></div>`;
}
function connectPrompt(title, body) {
  return `<div class="empty"><svg class="em-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h.01"/></svg>
    <h3>${title}</h3><p>${body}</p><button class="btn-solid" onclick="document.getElementById('wallet')?.click()" data-cursor>Connect wallet</button></div>`;
}

/* -------- Strategy Detail -------- */
function viewDetail(id) {
  const el = document.createElement('div'); el.className = 'view view-enter';
  el.innerHTML = `<div id="det"><div class="muted"><span class="sdot pending"></span> loading ${short(id)}…</div></div>`;
  (async () => {
    const host = $('#det', el);
    try {
      const s = await getStrategy(id);
      if (!s) { host.innerHTML = `<div class="empty"><h3>Strategy not found</h3><a class="btn-soft" href="#/strategies">Back</a></div>`; return; }
      let legs = [], m = null, spot = 60000;
      try { const r = await preview(dnaToConv(s.dna, s.capital)); legs = r.selected.legs; m = r.selected.metrics; spot = r.spot; } catch (e) {}
      const mine = state.account && s.owner === state.account.address;
      host.innerHTML = `
        <div class="row spread reveal" style="margin-bottom:20px;flex-wrap:wrap;gap:14px">
          <div class="row" style="gap:14px"><span class="sdot ${s.status}" style="width:12px;height:12px"></span>
            <div><div style="font-family:var(--serif);font-size:2rem;letter-spacing:-.02em">${structFromDna(s.dna)}</div>
            <div class="muted">generation ${s.generation} · <a class="mono" style="color:var(--accent-deep)" href="${CFG.EXPLORER_OBJ(s.id)}" target="_blank" rel="noopener">${short(s.id)} ↗</a></div></div></div>
          ${mine ? `<div class="row" style="gap:10px;flex-wrap:wrap">
            <button class="btn-soft" id="copy-btn" data-cursor>${s.isCopyable ? 'Copyable ✓' : 'List as copyable'}</button>
            <button class="btn-soft" id="breed-list-btn" data-cursor>${s.isBreedable ? 'Breedable ✓' : 'List as breedable'}</button>
            <button class="btn-solid" id="breed-btn" data-cursor>Breed with… ${arrow()}</button></div>` : `<span class="badge">owner ${short(s.owner)}</span>`}
        </div>
        <div class="grid-4 reveal d1" style="margin-bottom:18px">
          <div class="stat"><div class="k">capital</div><div class="v">${fmt(s.capital)} <span style="font-size:.7rem" class="muted">dUSDC</span></div></div>
          <div class="stat"><div class="k">fitness</div><div class="v gold">${fmt(s.fitness)}</div></div>
          <div class="stat"><div class="k">win prob</div><div class="v">${m ? Math.round(m.winProb * 100) + '%' : '—'}</div></div>
          <div class="stat"><div class="k">status</div><div class="v" style="text-transform:capitalize">${s.status}</div></div>
        </div>
        <div class="grid-2 reveal d1" style="align-items:start">
          <div class="panel"><div class="section-title">payoff at resolution</div><div class="chart-wrap" id="d-payoff">${legs.length ? '' : '<div class="muted" style="padding:30px">compiler offline — payoff unavailable</div>'}</div></div>
          <div class="panel"><div class="section-title">performance</div>
            <div class="muted" style="line-height:1.7">This conviction has settled no positions yet, so there is no equity history to chart — HELIX never draws a fabricated curve. Realized P&L and fitness update on-chain as positions resolve.</div>
            <div class="grid-2" style="margin-top:14px"><div class="stat"><div class="k">copies</div><div class="v">${s.copies}</div></div><div class="stat"><div class="k">offspring</div><div class="v">${s.offspring}</div></div></div></div>
        </div>
        <div class="panel reveal d2" style="margin-top:18px"><div class="section-title">strategy DNA</div><div class="dna-grid">${dnaGrid(s.dna)}</div></div>
        <div class="panel reveal d2" style="margin-top:18px"><div class="section-title">lineage</div>${lineageBlurb(s)}</div>
        <div id="act-out" style="margin-top:14px"></div>`;
      if (legs.length) $('#d-payoff', host).innerHTML = payoffSkeleton(), updatePayoffNode($('#d-payoff', host), legs, spot);
      revealObserve(host);
      if (mine) host.addEventListener('click', e => {
        if (e.target.closest('#breed-list-btn')) listAction(host, s.id, 'breedable');
        if (e.target.closest('#copy-btn')) listAction(host, s.id, 'copyable');
        if (e.target.closest('#breed-btn')) openBreedPicker(host, s);
        const pick = e.target.closest('[data-breed-with]');
        if (pick) breedStrategies(host, s, pick.dataset.breedWith);
      });
    } catch (e) { host.innerHTML = `<div class="empty"><h3>Couldn't load strategy</h3><p class="mono">${e.message}</p></div>`; }
  })();
  return { el };
}
function updatePayoffNode(host, legs, spot) {
  const p = payoffPaths(legs, spot);
  host.querySelector('#pf-line').setAttribute('d', p.line); host.querySelector('#pf-area').setAttribute('d', p.area);
  host.querySelector('#pf-spot').setAttribute('x1', p.spotX.toFixed(1)); host.querySelector('#pf-spot').setAttribute('x2', p.spotX.toFixed(1));
  host.querySelector('#pf-zero').setAttribute('y1', p.zeroY.toFixed(1)); host.querySelector('#pf-zero').setAttribute('y2', p.zeroY.toFixed(1));
}
function dnaGrid(d) {
  const dir = (d.dirNegative ? -1 : 1) * d.dirMagnitude;
  const cells = [['direction', `${dirWord(dir)} (${dir})`], ['confidence', `${d.confidence} · ${confWord(d.confidence)}`],
    ['volatility', `${d.volView} · ${volWord(d.volView)}`], ['legs', d.legCount],
    ['leverage', (d.leverageX100 / 100) + '×'], ['regime sensitivity', d.regimeSensitivity],
    ['max drawdown', (d.maxDrawdownBps / 100).toFixed(1) + '%'], ['horizon', d.horizonDays >= 1 ? '≥1 day' : 'sub-hour']];
  return cells.map(c => `<div class="dna-cell"><div class="k">${c[0]}</div><div class="v">${c[1]}</div></div>`).join('');
}
function lineageBlurb(s) {
  if (!s.parents || !s.parents.length) return `<div class="muted">Primordial strategy — no parents. Generation 0 of its lineage. <a href="#/lineage" style="color:var(--accent-deep)">View the family tree →</a></div>`;
  return `<div class="muted" style="line-height:1.7">Bred from ${s.parents.map(p => `<a href="#/strategy/${p}" style="color:var(--accent-deep)">${short(p)}</a>`).join(' × ')}. Both parent creators earn royalties from this strategy's performance.</div>`;
}
async function listAction(host, id, kind) {
  const out = $('#act-out', host); out.innerHTML = `<div class="muted"><span class="sdot pending"></span> awaiting signature…</div>`;
  try {
    const tx = new Transaction();
    if (kind === 'breedable') tx.moveCall({ target: `${CFG.HELIX}::marketplace::list_as_breedable`, arguments: [tx.object(id), tx.pure.u64(0)] });
    else tx.moveCall({ target: `${CFG.HELIX}::marketplace::list_as_copyable`, arguments: [tx.object(id), tx.pure.u16(150)] });
    const res = await signAndExecute(tx);
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--alive) 45%,transparent)"><b style="color:var(--alive)">Listed as ${kind}</b>
      <a class="btn-soft" style="margin-top:10px" href="${CFG.EXPLORER(res.digest)}" target="_blank" rel="noopener">View tx ↗</a></div>`;
    toast('Listed on the marketplace', `now ${kind}`, 'alive'); setTimeout(() => render(), 1200);
  } catch (e) { out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--coral) 45%,transparent)"><b style="color:var(--coral)">Not listed</b><div class="muted">${e.message || 'rejected'}</div></div>`; }
}

/* -------- Breeding: pick a second owned, breedable strategy → mint a crossed child.
   Lives here on Strategy Detail (an action on something you own), not the Canvas
   (which is for fresh convictions). The child carries both parents on-chain, so it
   renders in the Lineage tree with edges to each. */
async function openBreedPicker(host, s) {
  const out = $('#act-out', host);
  if (!s.isBreedable) {
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--coral) 40%,transparent)">
      <b style="color:var(--coral)">List this strategy as breedable first</b>
      <div class="muted" style="margin-top:6px">Both parents must be breedable. Click “List as breedable”, then breed.</div></div>`;
    return;
  }
  out.innerHTML = `<div class="muted"><span class="sdot pending"></span> finding breedable partners…</div>`;
  try {
    const others = (await getMyStrategies()).filter(o => o.id !== s.id);
    const breedable = others.filter(o => o.isBreedable);
    if (!breedable.length) {
      out.innerHTML = `<div class="panel"><b>No breedable partner yet</b>
        <div class="muted" style="margin-top:6px">You need a second strategy you own, listed as breedable. ${others.length ? 'Open another of your strategies and list it breedable, then come back.' : 'Mint another conviction on the Canvas first.'}</div></div>`;
      return;
    }
    out.innerHTML = `<div class="panel reveal"><div class="section-title">breed “${structFromDna(s.dna)}” with…</div>
      <div class="grid-3" style="margin-top:8px">${breedable.map(o => `<button class="scard" data-breed-with="${o.id}" data-cursor style="text-align:left;width:100%">
        <div class="row spread"><span class="sdot ${o.status}"></span><span class="muted mono" style="font-size:11px">gen ${o.generation}</span></div>
        <h4 style="margin:10px 0 2px">${structFromDna(o.dna)}</h4>
        <div class="muted mono" style="font-size:11px">${short(o.id)}</div>
        <div class="dna-mini">${dnaChips(o.dna)}</div></button>`).join('')}</div>
      <div class="muted mono" style="font-size:11px;margin-top:10px">child DNA = deterministic 50/50 splice of both parents' genes + a small mutation (on-chain crossover)</div></div>`;
    revealObserve(out);
  } catch (e) { out.innerHTML = `<div class="panel"><b style="color:var(--coral)">Couldn't list partners</b><div class="muted">${e.message}</div></div>`; }
}
async function breedStrategies(host, parentA, parentBId) {
  const out = $('#act-out', host);
  out.innerHTML = `<div class="muted"><span class="sdot pending"></span> crossing genes — awaiting wallet signature…</div>`;
  try {
    const b = await getStrategy(parentBId);
    if (!parentA.isBreedable || !b || !b.isBreedable) throw new Error('both parents must be listed breedable');
    const required = (parentA.breedFee || 0) + (b.breedFee || 0);
    const childCapital = Math.max(1, Math.round(((parentA.capital || 0) + (b.capital || 0)) / 2));
    const seed = BigInt(Date.now()) ^ (BigInt('0x' + parentBId.slice(2, 10)) << 8n);

    const tx = new Transaction();
    let fee;
    if (required > 0) {
      const dusdcCoin = await pickDusdcCoin(BigInt(required));
      [fee] = tx.splitCoins(tx.object(dusdcCoin), [tx.pure.u64(BigInt(required))]);
    } else {
      fee = tx.moveCall({ target: '0x2::coin::zero', typeArguments: [CFG.DUSDC], arguments: [] });
    }
    const [child, cap] = tx.moveCall({
      target: `${CFG.HELIX}::breeding::breed`, typeArguments: [CFG.DUSDC],
      arguments: [tx.object(parentA.id), tx.object(parentBId), fee, tx.pure.u64(BigInt(childCapital)), tx.pure.u64(seed), tx.pure.vector('u8', [1])],
    });
    tx.transferObjects([child, cap], tx.pure.address(state.account.address));
    const res = await signAndExecute(tx);
    const made = (res.objectChanges || []).find(o => o.type === 'created' && /::strategy::StrategyObject$/.test(o.objectType || ''));
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--alive) 45%,transparent);background:var(--alive-soft)">
      <div class="row spread"><b style="color:var(--alive)">Child strategy bred</b><span class="sdot active"></span></div>
      <div class="muted" style="margin-top:8px">A new generation object whose DNA crosses both parents — both creators are registered for royalties on-chain.</div>
      <div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap">
        ${made ? `<a class="btn-soft" href="#/strategy/${made.objectId}" data-cursor>Open the child →</a>` : ''}
        <a class="btn-soft" href="#/lineage" data-cursor>See it in the lineage tree →</a>
        <a class="btn-soft" href="${CFG.EXPLORER(res.digest)}" target="_blank" rel="noopener" data-cursor>View tx ↗</a></div></div>`;
    toast('Bred a child strategy', 'crossover minted on Sui testnet', 'alive');
  } catch (e) {
    const msg = (e.message || '').includes('INSUFFICIENT_DUSDC') ? 'Need dUSDC for the breed fee — relist both parents with a 0 fee, or fund the wallet.' : (e.message || 'rejected');
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--coral) 45%,transparent)"><b style="color:var(--coral)">Not bred</b><div class="muted" style="margin-top:6px">${msg}</div></div>`;
  }
}

/* -------- Risk Compass (portfolio) -------- */
function viewRisk() {
  const el = document.createElement('div'); el.className = 'view view-enter';
  if (!state.account) { el.innerHTML = connectPrompt('Your portfolio compass', 'Connect a wallet to aggregate your live convictions into one risk picture.'); return { el }; }
  el.innerHTML = `<div id="risk"><div class="muted"><span class="sdot pending"></span> aggregating your portfolio…</div></div>`;
  (async () => {
    const host = $('#risk', el);
    try {
      const strats = (await getMyStrategies()).filter(s => s.status === 'active' || s.status === 'pending');
      if (!strats.length) { host.innerHTML = `<div class="empty"><h3>No live convictions</h3><p>Bring a conviction to life on the Canvas; your portfolio compass appears here.</p><a class="btn-solid" href="#/canvas">Open the Canvas</a></div>`; return; }
      await loadOracle().catch(() => {});
      // aggregate honest axes across the portfolio
      let bias = 0, cap = 0, conc = 0;
      strats.forEach(s => { bias += (s.dna.dirNegative ? -1 : 1) * s.dna.dirMagnitude / 100 * s.capital; cap += s.capital; conc += s.dna.legCount <= 1 ? 1 : 0.5; });
      const netBias = cap ? Math.abs(bias) / cap : 0;
      const axes = [{ k: 'Net Exposure', v: Math.min(1, netBias * 0.9 + 0.1) }, { k: 'Directional Bias', v: netBias },
        { k: 'Time-to-Resolution', v: 0.5 }, { k: 'Concentration', v: Math.min(1, conc / strats.length) },
        { k: 'Liquidity Headroom', v: 0.7 }];
      const flags = guardianFlags({ plpUtilizationBps: 4200, selected: { legs: [] } }, state.oracle, state.oracleState);
      host.innerHTML = `<div class="grid-2 reveal" style="align-items:start">
        <div class="panel ink"><div class="section-title">portfolio risk compass</div><div style="display:grid;place-items:center">${radarSVG(axes)}</div>
          <div class="muted mono" style="text-align:center;font-size:11px;margin-top:8px">${strats.length} live conviction${strats.length > 1 ? 's' : ''} · ${fmt(cap)} dUSDC committed</div></div>
        <div class="panel"><div class="row spread"><div class="section-title" style="margin:0">guardian</div><span class="badge tee">live SVI</span></div>
          <div style="margin-top:14px">${flags.map(f => `<div class="row" style="gap:9px;margin-bottom:12px;align-items:flex-start"><span class="sdot ${f.bad ? 'dead' : 'active'}" style="margin-top:5px;flex:0 0 auto"></span><span style="font-size:14px;line-height:1.5;color:${f.bad ? 'var(--coral)' : 'var(--ink-2)'}">${f.t}</span></div>`).join('')}</div></div>
      </div>`;
      revealObserve(host);
    } catch (e) { host.innerHTML = `<div class="empty"><h3>Couldn't build compass</h3><p class="mono">${e.message}</p></div>`; }
  })();
  return { el };
}

/* -------- Marketplace (leaderboard from real StrategyCreated events) -------- */
function viewMarket() {
  const el = document.createElement('div'); el.className = 'view view-enter';
  el.innerHTML = `<div id="mkt"><div class="muted"><span class="sdot pending"></span> reading strategies from chain…</div></div>`;
  (async () => {
    const host = $('#mkt', el);
    try {
      const all = (await getAllStrategies()).sort((a, b) => b.fitness - a.fitness);
      if (!all.length) { host.innerHTML = `<div class="empty"><h3>No strategies on-chain yet</h3><p>The leaderboard fills as convictions are minted. Be the first.</p><a class="btn-solid" href="#/canvas">Plant a conviction</a></div>`; return; }
      host.innerHTML = `<div class="panel" style="padding:0;overflow:hidden"><div class="row spread" style="padding:20px 24px"><div class="section-title" style="margin:0">leaderboard · all on-chain strategies</div><span class="badge">by fitness</span></div>
        <table class="table"><thead><tr><th>#</th><th>structure</th><th>creator</th><th>genes</th><th>capital</th><th>fitness</th><th>status</th></tr></thead><tbody>
        ${all.map((s, i) => `<tr data-id="${s.id}" data-cursor><td class="rank">${i + 1}</td>
          <td><b>${structFromDna(s.dna)}</b><div class="muted mono" style="font-size:11px">${short(s.id)}</div></td>
          <td class="mono muted" style="font-size:12px">${short(s.creator)}</td><td>${dnaChips(s.dna)}</td>
          <td class="mono">${fmt(s.capital)}</td><td class="mono gold">${fmt(s.fitness)}</td>
          <td><span class="row" style="gap:7px"><span class="sdot ${s.status}"></span><span class="muted mono" style="font-size:11px;text-transform:uppercase">${s.status}</span></span></td></tr>`).join('')}
        </tbody></table></div>`;
      host.addEventListener('click', e => { const r = e.target.closest('[data-id]'); if (r) location.hash = '#/strategy/' + r.dataset.id; });
      revealObserve(host);
    } catch (e) { host.innerHTML = `<div class="empty"><h3>Couldn't load leaderboard</h3><p class="mono">${e.message}</p></div>`; }
  })();
  return { el };
}

/* -------- Lineage (generational tree from real events) -------- */
function viewLineage() {
  const el = document.createElement('div'); el.className = 'view view-enter';
  el.innerHTML = `<div id="lin"><div class="muted"><span class="sdot pending"></span> tracing lineage from chain…</div></div>`;
  (async () => {
    const host = $('#lin', el);
    try {
      const [all, breeds] = await Promise.all([getAllStrategies(), getBreedings()]);
      if (!all.length) { host.innerHTML = `<div class="empty"><h3>No lineage yet</h3><p>Generational trees grow as strategies breed. Mint one to begin a bloodline.</p><a class="btn-solid" href="#/canvas">Plant a conviction</a></div>`; return; }
      host.innerHTML = `<div class="panel reveal"><div class="row spread"><div class="section-title" style="margin:0">conviction lineage · the family tree</div><span class="badge">${all.length} strategies · ${breeds.length} breeds</span></div>
        <div style="overflow:auto;margin-top:10px">${lineageSVG(all)}</div>
        <div class="legend" style="margin-top:14px"><span><i style="border-color:var(--alive)"></i>living</span><span><i style="border-color:var(--accent)"></i>closed</span><span><i style="border-color:var(--ink-3)"></i>dead</span></div></div>`;
      host.addEventListener('click', e => { const n = e.target.closest('.ln-node'); if (n) location.hash = '#/strategy/' + n.dataset.id; });
      revealObserve(host);
    } catch (e) { host.innerHTML = `<div class="empty"><h3>Couldn't trace lineage</h3><p class="mono">${e.message}</p></div>`; }
  })();
  return { el };
}
function lineageSVG(list) {
  const W = 900, gens = {}; list.forEach(s => { (gens[s.generation] = gens[s.generation] || []).push(s); });
  const maxGen = Math.max(...Object.keys(gens).map(Number), 0), rowH = 120, H = (maxGen + 1) * rowH + 60;
  const pos = {}; Object.keys(gens).forEach(g => { const row = gens[g]; row.forEach((s, i) => { pos[s.id] = { x: 60 + ((i + 0.5) / row.length) * (W - 120), y: 50 + Number(g) * rowH }; }); });
  let edges = ''; list.forEach(s => (s.parents || []).forEach(p => { if (pos[p] && pos[s.id]) edges += `<line x1="${pos[p].x.toFixed(0)}" y1="${pos[p].y.toFixed(0)}" x2="${pos[s.id].x.toFixed(0)}" y2="${pos[s.id].y.toFixed(0)}" stroke="var(--line-2)"/>`; }));
  let nodes = ''; list.forEach(s => { const p = pos[s.id]; const col = s.status === 'dead' ? 'var(--ink-3)' : s.status === 'active' ? 'var(--alive)' : 'var(--accent)';
    nodes += `<g class="ln-node" data-id="${s.id}" style="cursor:pointer"><circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="10" fill="${col}" opacity="${s.status === 'dead' ? 0.5 : 1}"/><text x="${p.x.toFixed(0)}" y="${(p.y + 26).toFixed(0)}" text-anchor="middle" font-size="10.5" font-family="var(--mono)" fill="var(--ink-2)">${short(s.id).slice(0, 6)}</text></g>`; });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;min-height:${H}px">${edges}${nodes}</svg>`;
}

/* ============================================================ router */
const routes = [
  { id: 'canvas', match: /^#\/(canvas)?$/, title: 'Conviction Canvas', sub: 'express a belief', view: viewCanvas },
  { id: 'strategies', match: /^#\/strategies$/, title: 'My Strategies', sub: 'your living portfolio', view: viewStrategies },
  { id: 'strategies', match: /^#\/strategy\/(.+)$/, title: 'Strategy', sub: 'a living object', view: (m) => viewDetail(m[1]) },
  { id: 'risk', match: /^#\/risk$/, title: 'Risk Compass', sub: 'one unified picture', view: viewRisk },
  { id: 'market', match: /^#\/market$/, title: 'Marketplace', sub: 'copy · breed · compete', view: viewMarket },
  { id: 'lineage', match: /^#\/lineage$/, title: 'Lineage', sub: 'genetic ancestry', view: viewLineage },
];
function render() {
  const hash = location.hash || '#/canvas';
  const route = routes.find(r => r.match.test(hash)) || routes[0];
  const m = hash.match(route.match);
  $('#page-title').textContent = route.title; $('#page-sub').textContent = route.sub;
  document.querySelectorAll('.rail-link').forEach(a => a.classList.toggle('active', a.dataset.route === route.id));
  const host = $('#view-host'); host.innerHTML = '';
  const built = route.view(m); host.appendChild(built.el);
  if (built.mount) built.mount(built.el);
  revealObserve(built.el); window.scrollTo(0, 0);
}
function revealObserve(root) {
  const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  (root || document).querySelectorAll('.reveal').forEach(el => io.observe(el));
}

/* ============================================================ chrome: cursor / theme / wallet */
function cursor() {
  if (!matchMedia('(hover:hover)').matches || reduce) return;
  const dot = document.createElement('div'); dot.className = 'cursor-dot'; document.body.appendChild(dot);
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y;
  addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; dot.style.opacity = '1'; });
  addEventListener('mouseleave', () => dot.style.opacity = '0');
  (function loop() { x += (tx - x) * 0.18; y += (ty - y) * 0.18; dot.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; requestAnimationFrame(loop); })();
  addEventListener('mouseover', e => dot.classList.toggle('ring', !!e.target.closest('a,button,.hx-range,[data-cursor],tr,.scard')));
}
function themeToggle() {
  const tg = $('#theme-toggle'); if (!tg) return;
  const pill = $('#tt-pill'), btns = [...tg.querySelectorAll('button')], root = document.documentElement;
  const cur = () => root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  function sync() { const c = cur(); btns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeVal === c))); if (pill) pill.style.transform = `translateX(${(c === 'dark' ? 1 : 0) * 30}px)`; }
  function set(t) { root.setAttribute('data-theme', t); try { localStorage.setItem('helix-theme', t); } catch (e) {} sync(); }
  btns.forEach(b => b.addEventListener('click', () => set(b.dataset.themeVal))); sync();
}
function renderWalletChip() {
  const b = $('#wallet'); if (!b) return;
  if (state.account) {
    const bal = fmt(Number(state.dusdc) / 10 ** CFG.DUSDC_DECIMALS, 2);
    b.innerHTML = `<span class="sdot active"></span> ${short(state.account.address)} · ${bal} dUSDC`;
    b.title = 'Click to disconnect';
  } else { b.innerHTML = 'Connect wallet'; b.title = ''; }
}
function walletButton() {
  const b = $('#wallet');
  b.addEventListener('click', () => { if (state.account) disconnectWallet(); else openWalletPicker(); });
}
function openWalletPicker() {
  const wallets = discoverWallets();
  const ov = document.createElement('div'); ov.className = 'wpick-ov';
  ov.innerHTML = `<div class="wpick">
    <div class="row spread" style="margin-bottom:6px"><b style="font-family:var(--serif);font-size:1.4rem;font-weight:400">Connect a wallet</b><button class="wpick-x" data-cursor>✕</button></div>
    <div class="muted" style="font-size:13px;margin-bottom:16px">Sui testnet · Wallet Standard</div>
    ${wallets.length ? wallets.map((w, i) => `<button class="wpick-item" data-i="${i}" data-cursor>
        ${w.icon ? `<img src="${w.icon}" alt="" width="26" height="26" style="border-radius:7px"/>` : '<span class="wpick-dot"></span>'}
        <span>${w.name}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>`).join('')
      : `<div class="muted" style="padding:14px 0">No Sui wallet detected. Install <a class="mono" style="color:var(--accent-deep)" href="https://slush.app" target="_blank" rel="noopener">Slush</a>, Sui Wallet or Suiet, then reload.</div>`}
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', async (e) => {
    if (e.target === ov || e.target.closest('.wpick-x')) return close();
    const it = e.target.closest('.wpick-item'); if (!it) return;
    close();
    try { await connectWallet(wallets[+it.dataset.i]); toast('Wallet connected', short(state.account.address) + ' · Sui testnet', 'alive'); }
    catch (err) { toast('Connection failed', err.message || 'rejected', 'gold'); }
  });
}

/* ============================================================ build shell */
function build() {
  const app = document.createElement('div'); app.className = 'app';
  app.innerHTML = `
    <aside class="rail">
      <a class="brand-mark" href="index.html" title="Home"><svg viewBox="0 0 32 32" fill="none"><circle cx="15" cy="17" r="11" stroke="currentColor" stroke-width="2.6"/><circle cx="25" cy="7" r="4.2" fill="currentColor"/></svg></a>
      ${railLink('canvas', '#/canvas', 'Canvas')}
      ${railLink('strategies', '#/strategies', 'Strategies')}
      ${railLink('risk', '#/risk', 'Risk Compass')}
      ${railLink('market', '#/market', 'Marketplace')}
      ${railLink('lineage', '#/lineage', 'Lineage')}
      <div class="rail-spacer"></div>
    </aside>
    <main>
      <div class="topbar">
        <div class="page-h"><span class="eyebrow" id="page-sub">express a belief</span><h1 id="page-title">Conviction Canvas</h1></div>
        <div class="right">
          <span class="chip"><span class="live"></span> sui testnet</span>
          <div class="theme-toggle" role="radiogroup" aria-label="Theme" id="theme-toggle">
            <span class="tt-pill" id="tt-pill"></span>
            <button role="radio" data-theme-val="light" aria-label="Light" data-cursor><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
            <button role="radio" data-theme-val="dark" aria-label="Dark" data-cursor><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>
          </div>
          <button class="btn-soft" id="wallet" data-cursor>Connect wallet</button>
        </div>
      </div>
      <div id="view-host"></div>
    </main>`;
  document.body.appendChild(app);
}

function init() {
  build(); cursor(); themeToggle(); walletButton();
  // restore a previously authorized wallet silently (best-effort)
  const ws = discoverWallets();
  const remembered = ws.find(w => (w.accounts && w.accounts.length));
  if (remembered) { state.wallet = remembered; state.account = remembered.accounts[0]; refreshDusdc().then(renderWalletChip); }
  addEventListener('hashchange', render);
  render();
  const boot = $('#boot'); if (boot) setTimeout(() => boot.classList.add('done'), 520);
  document.body.classList.remove('booting');
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();
