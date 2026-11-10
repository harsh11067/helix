/* ============================================================
   HELIX — dApp shell (vanilla ES module, inherits tistu design language)
   See tistu/DESIGN.md for the design contract this obeys.

   Real chain integration (no mocks, no offline fallback) — Total Recall edition:
     • chain   : every Sui read goes to the HELIX compiler's /graphql proxy, which is
                 the single chokepoint to Tatum's Sui gateway (Sui retired public
                 JSON-RPC in 2026). The Tatum credential stays on the server.
     • compile : POST /compile (live DeepBook Predict v4 pricer + your Walrus Memory)
     • mint    : the compiler builds ONE PTB — a queued Predict v4 order (filled by
                 the keeper at Pyth's price) + helix::strategy::create_strategy —
                 your wallet (or zkLogin key) signs, the compiler executes it through
                 Tatum and writes a CONVICTION memory to Walrus Memory (mainnet).
     • memory  : outcomes, calibration and lessons are recalled from Walrus Memory and
                 visibly change the next compile (Memory page + Canvas memory block).
   ============================================================ */
import { getWallets } from './vendor/core.js';
import {
  initChain, client, api, apiBase, Transaction, ownedOfType, objectOf, eventsOfType, coinsOf,
  currentEpoch, buildBytes, walletSign, executeSigned,
} from './sui.js';
import {
  zkConfigured, beginGoogleLogin, completeGoogleLoginIfPresent,
  loadSession as loadZkSession, clearSession as clearZkSession, zkSignBytes,
} from './zklogin.js';
import {
  SEAL_EVENT_TYPE, SEAL_EVENT_TYPES, encryptThesis, addAttachThesis, decryptThesis,
  uploadToWalrus, fetchFromWalrus, decodeBlobId,
} from './seal.js';
import { voicesHTML, memoryBlockHTML, viewMemory } from './memory-ui.js';
import { mountAssetSwitch, renderAssetCompiled, assetCommitControl, assetErrorHTML } from './assets.js';
import { demoRequested, viewingAddress, isReadOnly, demoHref, DEMO_BANNER } from './demo.js';
import { viewCouncil } from './council.js';
import { renderPassport } from './passport.js';
import { tickerText } from './fun.js';
import { viewApiDocs } from './api-docs.js';

/* ---------------- config (verified on-chain testnet ids) ---------------- */
const CFG = {
  HELIX:        '0xdc4b27696494c3c5f54513b19781686f7354a7b09f7ccf2285f7b843c7add2b3', // original id — types/events/queries
  HELIX_LATEST: '0xbcd36b706472927ab7865a2ba31e343bfdc3c24312f39a9cb79cde88faaa45e0', // v4 upgraded id — moveCalls (copy_for_thesis, seal_approve*)
  // HELIX marketplace/breeding fees are generic over the coin; listings default to 0 fees.
  FEE_COIN:     '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
  // Prod wiring: set `window.HELIX_COMPILER_URL = 'https://<service>.onrender.com'` in app.html.
  COMPILER_URL: (typeof window !== 'undefined' && window.HELIX_COMPILER_URL)
    || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8081' : '/compiler'),
  EXPLORER: (d) => `https://suiscan.xyz/testnet/tx/${d}`,
  EXPLORER_OBJ: (o) => `https://suiscan.xyz/testnet/object/${o}`,
  QUOTE_DECIMALS: 6,
  FAUCET_FORM: 'https://tally.so/r/Xx102L',
};
initChain(CFG.COMPILER_URL);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r) => (r || document).querySelector(s);
const fmt = (n, d) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d });
const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';

/* ---------------- shared app state ---------------- */
const state = {
  mode: 'wallet',        // 'wallet' (Wallet Standard) | 'zk' (zkLogin / Google)
  wallet: null,          // wallet-standard wallet
  zk: null,              // zkLogin session { address, secret, proof, ... }
  account: null,         // { address, ... }
  acct: null,            // Predict v4 account { wrapperId, exists, balance, walletQuoteBalance, quoteCoinType }
  compile: null,         // last compile result (incl. predict / voices / memory / guardian)
  conv: null,            // last conviction
  chosen: { commit: null, useMemoryStructure: false },  // explicit memory acceptances (never silent)
  demo: null,            // Judge Mode: read-only demo trader address (?demo=1 → GET /demo)
  busy: false,
};
// The demo trader is shown read-only; a connected wallet always takes precedence.
function demoBannerHTML() {
  if (!isReadOnly(state)) return '';
  return `<div class="panel" style="margin-bottom:18px;padding:14px 18px;border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:var(--accent-soft)">
    <div class="row spread" style="gap:10px;flex-wrap:wrap"><div><b>${DEMO_BANNER}</b> <span class="mono muted" style="font-size:11.5px">${short(state.demo)}</span>
    <div class="muted" style="font-size:12.5px;margin-top:4px">Compiles and the Memory page use this trader's Walrus memory. Nothing can be signed for it — connect a wallet to trade as yourself.</div></div>
    <button class="btn-soft" id="demo-connect" data-cursor>Connect a wallet</button></div></div>`;
}

/* ============================================================ live data */
async function refreshAccount() {
  if (!state.account) { state.acct = null; return null; }
  try { state.acct = await api(`/predict/account/${state.account.address}`); }
  catch (e) { state.acct = { error: e.message }; }
  return state.acct;
}

/* ============================================================ wallet */
function discoverWallets() {
  return getWallets().get().filter(w => w.chains?.some(c => c.startsWith('sui:')) || w.features['sui:signTransaction'] || w.features['sui:signAndExecuteTransaction']);
}
async function connectWallet(w) {
  const res = await w.features['standard:connect'].connect();
  const acct = (res.accounts && res.accounts[0]) || (w.accounts && w.accounts[0]);
  if (!acct) throw new Error('wallet returned no account');
  state.mode = 'wallet'; state.zk = null; state.wallet = w; state.account = acct; state.acct = null;
  accountChanged();
}
// Show the connection immediately; the Predict account/balance read (via Tatum) fills in when it lands.
function accountChanged() {
  renderWalletChip();
  window.dispatchEvent(new Event('helix:wallet'));
  const addr = state.account?.address;
  refreshAccount().then(() => {
    if (state.account?.address !== addr) return;
    renderWalletChip(); window.dispatchEvent(new Event('helix:acct'));
  });
}
// Begin the Google → zkLogin redirect. Returns nothing — the page navigates away
// and resumes in completeGoogleLoginIfPresent() on the way back.
async function connectGoogle() {
  const redirectUri = location.origin + location.pathname; // must be registered in Google
  await beginGoogleLogin(null, redirectUri);
}
// Adopt a finished zkLogin session as the active signer.
async function activateZkSession(session) {
  state.mode = 'zk'; state.wallet = null; state.zk = session;
  state.account = { address: session.address }; state.acct = null;
  accountChanged();
}
function disconnectWallet() {
  if (state.mode === 'zk') { clearZkSession(); }
  else { try { state.wallet?.features['standard:disconnect']?.disconnect(); } catch (e) {} }
  state.mode = 'wallet'; state.wallet = null; state.zk = null; state.account = null; state.acct = null;
  renderWalletChip(); window.dispatchEvent(new Event('helix:wallet'));
}
// Sign pre-built bytes (wallet or zkLogin), then execute through the compiler → Tatum.
async function signAndExecuteBytes(b64, extra = {}) {
  if (state.mode === 'zk') {
    const sig = await zkSignBytes(state.zk, b64, currentEpoch);
    return executeSigned(b64, sig, extra);
  }
  const { bytes, signature } = await walletSign(state.wallet, state.account, b64);
  return executeSigned(bytes, signature, extra);
}
// Client-composed PTBs (list / breed / copy / thesis): built through the same proxy.
async function signAndExecute(tx) {
  const b64 = await buildBytes(tx, state.account.address);
  const res = await signAndExecuteBytes(b64);
  if (!res.success) throw new Error(res.error || 'transaction failed');
  return res;
}

// sign a personal message (for Seal SessionKey). Wallet path only for now; zk
// session-key signing is a documented next step (judges verify with wallets).
async function signPersonalMessage(message) {
  if (state.mode === 'zk')
    throw new Error('Thesis unlock needs a browser wallet for now (zkLogin session-key signing is the next step).');
  const feat = state.wallet?.features['sui:signPersonalMessage'];
  if (!feat) throw new Error('this wallet cannot sign personal messages');
  return feat.signPersonalMessage({ message, account: state.account });
}
// Find the encrypted-thesis Walrus blob id recorded on-chain for a strategy.
async function getThesisBlobId(strategyId) {
  try {
    const results = await Promise.all((SEAL_EVENT_TYPES || [SEAL_EVENT_TYPE]).map(t => eventsOfType(t, 50).catch(() => [])));
    const all = results.flat().sort((a, b) => b.ts - a.ts);
    const hit = all.find(e => e.json?.strategy_id === strategyId);
    return hit ? decodeBlobId(hit.json) : null;
  } catch (e) { return null; }
}
async function pickFeeCoin(min) {
  const coins = await coinsOf(state.account.address, CFG.FEE_COIN);
  if (!coins.length || coins[0].balance < min) throw new Error('INSUFFICIENT_FEE_COIN');
  return coins[0].id;
}

/* ============================================================ compile (real, no fallback) */
async function compileConviction(conv) {
  // 55s tolerates a free-tier Render cold start (~50s) on the first compile after idle.
  if (state.asset && state.asset !== 'BTC') return api('/assets/compile', { ...conv, asset: state.asset, address: viewingAddress(state) }, { timeoutMs: 55000 });   // P5
  return api('/compile', { ...conv, address: viewingAddress(state), currentEpoch: 0 }, { timeoutMs: 55000 });
}

/* ============================================================ predict-native vocabulary */
function plainStructure(o) {
  if (!o) return { title: 'Directional bet', sub: 'DeepBook Predict' };
  if (o.kind === 'range') return { title: 'Range bet', sub: 'wins if BTC settles inside a band' };
  if (o.kind === 'bracketed_range') return { title: `Bracketed range · ${o.lower != null && o.upper != null && o.label.includes('upside') ? 'upside' : 'downside'}`, sub: 'bounded directional bet' };
  return { title: `Directional bet · ${o.side === 'down' ? 'down' : 'up'}`, sub: 'binary, settles on Pyth at expiry' };
}
const dirWord = d => d < -55 ? 'Strong bear' : d < -18 ? 'Bearish' : d <= 18 ? 'Neutral' : d < 55 ? 'Bullish' : 'Strong bull';
const volWord = v => v < 30 ? 'Calm' : v < 60 ? 'Choppy' : v < 85 ? 'Volatile' : 'Explosive';
const confWord = c => c < 30 ? 'Tentative' : c < 60 ? 'Moderate' : c < 85 ? 'Confident' : 'High conviction';

/* ============================================================ charts (payoff from real legs)
   Persistent SVG whose path is tweened between compiles with a requestAnimationFrame
   point-interpolation (NOT CSS `transition: d` — that is Chromium-only, snaps in
   Firefox/Safari, and janks when the y-domain rescales). We interpolate the final
   SCREEN coordinates point-by-point, so the curve glides smoothly even when its
   vertical scale changes, and mid-flight recompiles continue from the live frame. */
const PF = { W: 600, H: 240, pad: 8, steps: 96 };
const ptsToLine = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
const ptsToArea = (pts, zeroY, x0, x1) => `${ptsToLine(pts)} L ${x1.toFixed(1)} ${zeroY.toFixed(1)} L ${x0.toFixed(1)} ${zeroY.toFixed(1)} Z`;
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
// Smoothly tween the SVG inside `host` from its live frame to `target` geometry.
function tweenPayoff(host, target) {
  const line = host.querySelector('#pf-line'); if (!line) return;
  const area = host.querySelector('#pf-area'), spotl = host.querySelector('#pf-spot'), zero = host.querySelector('#pf-zero');
  const apply = (g) => {
    line.setAttribute('d', ptsToLine(g.pts));
    area.setAttribute('d', ptsToArea(g.pts, g.zeroY, g.x0, g.x1));
    zero.setAttribute('y1', g.zeroY.toFixed(1)); zero.setAttribute('y2', g.zeroY.toFixed(1));
    spotl.setAttribute('x1', g.spotX.toFixed(1)); spotl.setAttribute('x2', g.spotX.toFixed(1));
    host.__pfCur = g; // live frame → seamless continuation if interrupted
  };
  if (host.__pfRaf) { cancelAnimationFrame(host.__pfRaf); host.__pfRaf = null; }
  const prev = host.__pfCur;
  if (reduce || !prev || prev.pts.length !== target.pts.length) { apply(target); return; } // snap
  const t0 = performance.now(), dur = 260;
  const frame = (now) => {
    const e = 1 - Math.pow(1 - Math.min(1, (now - t0) / dur), 3); // easeOutCubic
    apply({
      pts: target.pts.map((p, i) => ({ x: prev.pts[i].x + (p.x - prev.pts[i].x) * e, y: prev.pts[i].y + (p.y - prev.pts[i].y) * e })),
      zeroY: prev.zeroY + (target.zeroY - prev.zeroY) * e,
      spotX: prev.spotX + (target.spotX - prev.spotX) * e,
      x0: target.x0, x1: target.x1,
    });
    if ((now - t0) / dur < 1) host.__pfRaf = requestAnimationFrame(frame); else host.__pfRaf = null;
  };
  host.__pfRaf = requestAnimationFrame(frame);
}
// Payoff of the REAL Predict order at expiry: pays $1 per contract inside its range.
const FEE_APPROX = 1.12; // indicative fee-inclusive price multiple; exact fees come from the plan at signing
function orderWins(o, s) { return o.side === 'up' ? s > o.strike : o.side === 'down' ? s <= o.strike : (s > o.lower && s <= o.upper); }
function predictGeometry(o, forward, commit) {
  const { W, H, pad, steps } = PF;
  const ref = o.side === 'range' ? (o.lower + o.upper) / 2 : o.strike;
  const w = o.side === 'range' ? Math.max(o.upper - o.lower, forward * 0.002) * 1.6 : Math.max(forward * 0.004, Math.abs(o.strike - forward) * 3);
  const lo = Math.min(forward, ref) - w, hi = Math.max(forward, ref) + w;
  const ppc = o.ppcEst ?? Math.min(0.97, Math.max(0.03, o.pMkt * FEE_APPROX));  // server's fitted fee estimate
  const contracts = commit / ppc;
  const raw = [];
  for (let i = 0; i <= steps; i++) { const s = lo + (hi - lo) * i / steps; raw.push({ s, y: (orderWins(o, s) ? contracts : 0) - commit }); }
  let loY = -commit, hiY = contracts - commit; const yr = (hiY - loY) || 1; loY -= yr * 0.14; hiY += yr * 0.14;
  const X = x => pad + (x - lo) / (hi - lo) * (W - 2 * pad);
  const Y = y => pad + (1 - (y - loY) / (hiY - loY)) * (H - 2 * pad);
  return { pts: raw.map(p => ({ x: X(p.s), y: Y(p.y) })), spotX: X(forward), zeroY: Y(0), x0: X(lo), x1: X(hi), contracts, ppc };
}
function updatePredictPayoff(host, o, forward, commit) {
  if (!host) return;
  if (!host.querySelector('svg')) host.innerHTML = payoffSkeleton();
  tweenPayoff(host, predictGeometry(o, forward, commit));
}

/* honest risk compass — Net Exposure · Directional Bias · Time-to-Resolution · Concentration · Entry headroom */
// Every axis is computed from the compile (or omitted) — no placeholder values on the radar.
function riskAxes(r, conv) {
  const dirBias = Math.abs(conv.direction) / 100;
  const mins = r.predict?.market?.minutesLeft;
  const o = r.predict?.order, band = r.predict?.band;
  const commit = state.chosen?.commit ?? conv.capital;
  const live = state.liveCapital ?? 0;   // known once your strategies have been read; else this conviction is the whole book
  const axes = [
    ['Net Exposure', Math.min(1, dirBias * 0.9 + 0.1)],
    ['Directional Bias', dirBias],
    mins == null ? null : ['Time-to-Resolution', Math.min(1, 1 - Math.min(mins, 15) / 15)],
    ['Concentration', commit > 0 ? commit / (commit + live) : 1],
    o && band ? ['Entry Headroom', Math.max(0, Math.min(1, Math.min(o.pMkt - band.minEntry, band.maxEntry - o.pMkt) / 0.25))] : null,
  ];
  return axes.filter(Boolean).map(([k, v]) => ({ k, v }));
}
function radarSVG(axes) {
  const cx = 150, cy = 150, R = 104, n = axes.length;
  const pt = (i, r) => [cx + r * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n), cy + r * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / n)];
  let rings = ''; for (let g = 1; g <= 3; g++) { const r = R * g / 3; rings += `<polygon points="${axes.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--line)"/>`; }
  let spokes = '', labels = '';
  axes.forEach((a, i) => { const [x, y] = pt(i, R); spokes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/>`; const [lx, ly] = pt(i, R + 22); labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="var(--ink-3)" font-size="10.5" font-family="var(--mono)" text-anchor="middle" dominant-baseline="middle">${a.k.split(' ')[0]}</text>`; });
  const poly = axes.map((a, i) => pt(i, Math.max(0.05, a.v) * R).map(v => v.toFixed(1)).join(',')).join(' ');
  // padded viewBox: axis labels sit outside R and long ones ("Directional") would clip at the edge
  return `<svg viewBox="-50 -6 400 312" style="width:100%;max-width:400px">${rings}${spokes}<polygon points="${poly}" fill="var(--accent-soft)" stroke="var(--accent-bright)" stroke-width="2"/>${labels}</svg>`;
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
  passport: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><circle cx="12" cy="10" r="2.8"/><path d="M8.5 16.5h7" stroke-linecap="round"/>',
  council: '<circle cx="7" cy="8" r="2.6"/><circle cx="17" cy="8" r="2.6"/><circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="17" r="2.6"/><path d="M9.6 8h4.8M9.6 17h4.8" stroke-linecap="round"/>',
  lineage: '<circle cx="12" cy="5" r="2.4"/><circle cx="6" cy="19" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M12 7.4v4M12 11.4L6.6 16.8M12 11.4l5.4 5.4"/>',
};
const wrapIcon = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${p}</svg>`;
const railLink = (route, href, label) => `<a class="rail-link" data-route="${route}" href="${href}" data-cursor>${wrapIcon(icons[route])}<span class="tip">${label}</span></a>`;
icons.memory = '<path d="M12 3a6 6 0 0 0-6 6c0 2.2 1.2 3.7 2.5 4.8.8.7 1.5 1.6 1.5 2.7V18h4v-1.5c0-1.1.7-2 1.5-2.7C16.8 12.7 18 11.2 18 9a6 6 0 0 0-6-6z"/><path d="M10 21h4" stroke-linecap="round"/>';

/* ============================================================ CONVICTION CANVAS */
const HOR = ['~3 min', '~6 min', '~12 min', '~20 min'];
// Recent compiles by exact conviction (+ asset, + whose memory): returning to the Canvas or sliding back
// to a position you just saw renders at once. Short TTL: the market window and its price keep moving.
const compileCache = new Map();
const COMPILE_TTL_MS = 15_000;
function viewCanvas() {
  const el = document.createElement('div'); el.className = 'view view-enter';
  const c0 = state.conv;   // your last position survives page changes
  const v0 = c0 ? { dir: Math.round((c0.direction + 100) / 2), conf: c0.confidence, hor: c0.horizonCode, vol: c0.volView, cap: c0.capital }
    : { dir: 64, conf: 60, hor: 0, vol: 45, cap: 5 };
  el.innerHTML = `
    <div id="demo-banner">${demoBannerHTML()}</div>
    <div class="grid-2" style="align-items:start">
      <div class="panel ink reveal">
        <div class="section-title">your conviction</div>
        <div style="font-family:var(--serif);font-size:1.9rem;letter-spacing:-0.02em;margin-bottom:22px">what do you believe about <span style="color:var(--accent)" id="asset-name">${state.asset || 'BTC'}</span>?<span id="asset-switch"></span></div>
        ${ctrl('Direction', 's-dir', 0, 100, v0.dir, 'v-dir')}
        ${ctrl('Confidence', 's-conf', 0, 100, v0.conf, 'v-conf')}
        ${ctrlSteps('Time horizon', 's-hor', 'v-hor', v0.hor)}
        ${ctrl('Volatility view', 's-vol', 0, 100, v0.vol, 'v-vol')}
        ${ctrl('Commit (dUSDC)', 's-cap', 2, 50, v0.cap, 'v-cap')}
        <div class="chart-wrap" style="margin-top:8px"><div id="payoff"></div></div>
        <div class="legend"><span><i style="border-color:var(--accent-bright)"></i>P&amp;L at expiry</span><span><i style="border-color:var(--ink-3)"></i>BTC now</span></div>
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
function ctrlSteps(lab, id, out, val = 0) {
  return `<div class="ctrl"><div class="ctrl-head"><span class="lab">${lab}</span><span class="val mono" id="${out}"></span></div>
    <input class="hx-range" type="range" id="${id}" min="0" max="3" step="1" value="${val}" data-cursor></div>`;
}
function mountCanvas(el) {
  const s = { dir: $('#s-dir', el), conf: $('#s-conf', el), hor: $('#s-hor', el), vol: $('#s-vol', el), cap: $('#s-cap', el) };
  pingTEE(el);
  mountAssetSwitch($('#asset-switch', el), { api, current: () => state.asset || 'BTC', onChange: (a) => { state.asset = a; $('#asset-name', el).textContent = a; delete $('#compiled', el).dataset.ready; schedule(); } });
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
  // Instant feedback while the server re-prices: the commit size is pure client maths, so the payoff follows
  // that slider exactly; any other slider re-prices on the server and the readout dims until it lands.
  function instant() {
    const r = state.compile, box = $('#compiled', el);
    if (!r?.predict || (r.asset && r.asset !== 'BTC') || !box.dataset.ready) return;
    updatePredictPayoff($('#payoff', el), activeOrder(r), r.predict.forward, readConv(s).capital);
    box.classList.add('updating');
  }
  // Latest-wins pipeline (not a debounce): while a slider moves, exactly one compile is in flight and the
  // next one leaves the moment it lands, so the curve keeps re-pricing DURING the drag (~0.4 s per step,
  // tweened in between) instead of freezing until the hand stops. A cache hit renders at once.
  let inflight = false, dirty = false;
  async function pump() {
    if (inflight || !dirty) return;
    dirty = false; inflight = true;
    try { await doCompile(); } finally { inflight = false; if (dirty) setTimeout(pump, 0); }
  }
  function schedule() { labels(); instant(); dirty = true; clearTimeout(timer); timer = setTimeout(pump, inflight ? 0 : 40); }
  let seq = 0;
  const convKey = (conv) => JSON.stringify([conv, state.asset || 'BTC', viewingAddress(state) || '']);
  function applyCompile(r, conv) {
    const box = $('#compiled', el);
    state.compile = r; state.chosen = { commit: conv.capital, useMemoryStructure: false };
    box.dataset.ready = '1'; box.classList.remove('updating');
    $('#v-hor', el).textContent = `${HOR[conv.horizonCode]} → ${Math.max(1, Math.round((r.predict?.market ?? r.window).minutesLeft))} min window`;
    renderCompiled(el, r, conv);
  }
  async function doCompile() {
    const conv = readConv(s); state.conv = conv;
    const box = $('#compiled', el);
    const my = ++seq;   // a later slider position supersedes any answer still in flight
    if (state.demoPending && !state.account) { box.classList.remove('updating'); box.innerHTML = `<div class="muted" style="padding:24px 0"><span class="sdot pending"></span> loading the demo trader's Walrus memory…</div>`; return; }
    const key = convKey(conv), hit = compileCache.get(key);
    if (hit && Date.now() - hit.at < COMPILE_TTL_MS) return applyCompile(hit.r, conv);
    if (!box.dataset.ready) box.innerHTML = `<div class="muted" style="padding:24px 0"><span class="sdot pending"></span> compiling against the live DeepBook Predict pricer${state.account ? ' and your Walrus memory' : ''}…</div>`;
    try {
      const r = await compileConviction(conv);
      if (my !== seq || !el.isConnected) return;   // stale: the sliders moved on (never paint an older answer over a newer one)
      compileCache.set(key, { at: Date.now(), r });
      if (compileCache.size > 40) compileCache.delete(compileCache.keys().next().value);
      applyCompile(r, conv);
    } catch (e) {
      if (my !== seq || !el.isConnected) return;
      const ph = $('#payoff', el); if (ph) ph.innerHTML = '';
      box.classList.remove('updating');
      box.dataset.ready = '';
      box.innerHTML = state.asset && state.asset !== 'BTC' ? assetErrorHTML(e, state.asset) : compileError(e);
      // between Predict windows (quarter-hour roll): the next one opens within a minute — retry by itself
      if (/no open DeepBook Predict|runway/i.test(e.message || '')) setTimeout(() => { if (el.isConnected && !box.dataset.ready) doCompile(); }, 10000);
    }
  }
  Object.values(s).forEach(x => x.addEventListener('input', schedule));
  // W6: only when opted in, ask memory how this KIND of reasoning has done (text is not stored by this check)
  let rtimer = null;
  el.addEventListener('input', (e) => {
    if (!e.target.closest('#thesis') && !e.target.closest('#reason-optin')) return;
    clearTimeout(rtimer);
    rtimer = setTimeout(async () => {
      const out = $('#reason-check', el), text = ($('#thesis', el)?.value || '').trim();
      if (!out) return;
      if (!$('#reason-optin', el)?.checked || text.length < 8 || !state.account) { out.innerHTML = ''; return; }
      try {
        const c = await api('/reason/check', { address: state.account.address, text });
        out.innerHTML = `<span class="sdot ${c.losing ? 'dead' : 'pending'}"></span> <span style="color:${c.losing ? 'var(--coral)' : 'inherit'}">reason: <b>${c.category}</b> · ${c.guardian.replace(/^Memory:\s*/, '')}</span>`;
      } catch (err) { out.innerHTML = ''; }
    }, 500);
  });
  el.addEventListener('change', (e) => { if (e.target.closest('#reason-optin')) el.dispatchEvent(new Event('input', { bubbles: true })); });
  schedule();
  const onWallet = () => { if (!el.isConnected) return window.removeEventListener('helix:wallet', onWallet); const b = $('#demo-banner', el); if (b) b.innerHTML = demoBannerHTML(); doCompile(); };
  const onAcct = () => {
    if (!el.isConnected) return window.removeEventListener('helix:acct', onAcct);
    const m = $('#mint-ctl', el); if (m && state.compile && state.conv) m.innerHTML = mintControl(state.chosen.commit ?? state.conv.capital);
  };
  window.addEventListener('helix:wallet', onWallet); window.addEventListener('helix:acct', onAcct);
  el.addEventListener('click', (e) => {
    if (e.target.closest('#commit')) onCommit(el);
    if (e.target.closest('#deploy')) onDeploy(el);
    if (e.target.closest('#fund')) onFund(el);
    if (e.target.closest('#wallet-inline') || e.target.closest('#demo-connect')) openWalletPicker();
    if (e.target.closest('#retry')) doCompile();
    if (e.target.closest('#mem-accept-commit')) {
      const m = state.compile?.memory; if (!m) return;
      state.chosen.commit = Math.abs((state.chosen.commit ?? m.commit) - m.suggested_commit) < 0.005 ? m.commit : m.suggested_commit;
      renderCompiled(el, state.compile, state.conv);
    }
    if (e.target.closest('#mem-accept-struct')) {
      state.chosen.useMemoryStructure = !state.chosen.useMemoryStructure;
      renderCompiled(el, state.compile, state.conv);
    }
  });
}
function readConv(s) {
  return { direction: (+s.dir.value) * 2 - 100, confidence: +s.conf.value, horizonCode: +s.hor.value, volView: +s.vol.value, capital: +s.cap.value };
}
function compileError(e) {
  const msg = e.message || 'error';
  const closing = /no open DeepBook Predict|runway/i.test(msg);
  return `<div class="empty" style="padding:36px 16px">
    <svg class="em-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01" stroke-linecap="round"/></svg>
    <h3 style="font-size:1.4rem">${closing ? 'Between market windows' : 'Compiler unreachable'}</h3>
    <p>${closing ? 'DeepBook Predict windows all roll on the quarter-hour; the next one opens in seconds.' : 'The Compiler service didn\'t answer.'} (<span class="mono">${msg}</span>) HELIX never shows fabricated structures.</p>
    <button class="btn-soft" id="retry" data-cursor>Retry compile</button></div>`;
}
function activeOrder(r) {
  return state.chosen.useMemoryStructure && r.memory?.structure_suggestion ? r.memory.structure_suggestion.order : r.predict.order;
}
function renderCompiled(el, r, conv) {
  if (r.asset && r.asset !== 'BTC') return renderAssetCompiled(el, r, { voicesHTML, memoryBlockHTML, chosen: state.chosen, explorer: CFG.EXPLORER, commitControl: assetCommitControl({ account: state.account, readOnly: isReadOnly(state), banner: DEMO_BANNER }) });   // P5
  const o = activeOrder(r), P = r.predict;
  const commit = state.chosen.commit ?? conv.capital;
  const ps = plainStructure(o);
  const g = predictGeometry(o, P.forward, commit);
  updatePredictPayoff($('#payoff', el), o, P.forward, commit);
  const axes = riskAxes(r, conv);
  const flags = r.guardian || [];
  const box = $('#compiled', el);
  box.innerHTML = `
    <div class="row spread" style="margin:14px 0 6px">
      <div><div class="muted mono" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">${ps.sub}</div>
      <div style="font-family:var(--sans);font-weight:600;font-size:1.4rem">${ps.title}</div></div>
      <span class="badge" title="the market's implied probability for this exact order" style="color:var(--alive);border-color:color-mix(in srgb,var(--alive) 40%,transparent);background:var(--alive-soft)">market ${Math.round(o.pMkt * 100)}%</span>
    </div>
    <div class="muted" style="margin-bottom:14px;line-height:1.5">${o.label} · resolves in ${P.market.minutesLeft.toFixed(1)} min${o.note ? ` · <i>${o.note}</i>` : ''}</div>
    <div class="grid-2" style="gap:12px">
      <div class="stat"><div class="k">you commit</div><div class="v loss">${fmt(commit, 2)} <span style="font-size:.7rem">dUSDC</span></div></div>
      <div class="stat"><div class="k">pays if right ≈</div><div class="v gain">${fmt(g.contracts, 2)} <span style="font-size:.7rem">dUSDC</span></div></div>
    </div>
    <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
      <span class="badge">BTC fwd ${fmt(P.forward)}</span><span class="badge">ATM IV ${(r.ivAtm * 100).toFixed(0)}%</span>
      <span class="badge" title="${r.regime?.label || ''}">regime ${(r.regime?.word || '').replace('_', ' ')}</span>
      <span class="badge" title="Compiler output is signed for integrity; hardware enclave attestation is the documented next step.">${r.attestation.mock ? 'compiler-signed · attestation: dev' : 'enclave-attested'}</span>
    </div>
    <div class="muted mono" style="font-size:10.5px;margin-top:6px">payout ≈ indicative at ${(g.ppc * 100).toFixed(0)}¢/contract incl. est. fees · exact cost &amp; fees are quoted by Predict when you sign</div>

    <div class="section-title" style="margin:22px 0 10px">four voices on this outcome</div>
    ${voicesHTML(r)}

    <div class="section-title" style="margin:22px 0 10px">memory · walrus mainnet</div>
    ${memoryBlockHTML(r.memory, state.chosen)}

    <div class="section-title" style="margin:22px 0 10px">risk guardian</div>
    <div class="grid-2" style="gap:16px;align-items:center">
      <div style="display:grid;place-items:center">${radarSVG(axes)}</div>
      <div>${flags.map(f => `<div class="row" style="gap:9px;margin-bottom:10px;align-items:flex-start">
        <span class="sdot ${f.bad ? 'dead' : 'active'}" style="margin-top:5px;flex:0 0 auto"></span>
        <span style="font-size:13.5px;line-height:1.45;color:${f.bad ? 'var(--coral)' : 'var(--ink-2)'}">${f.cls === 'memory' ? '<b>Memory:</b> ' + f.t.replace(/^Memory:\s*/, '') : f.t}</span></div>`).join('')}
        <div class="muted mono" style="font-size:11px;margin-top:6px">${flags.length} risk classes surfaced</div>
      </div>
    </div>

    <div style="margin-top:22px">${deployControl(commit)}</div>
    <div id="deploy-out" style="margin-top:14px"></div>`;
  if (!reduce) { box.style.animation = 'none'; void box.offsetWidth; box.style.animation = ''; } // replay cFade
}
function thesisBlock() {
  return `<div class="thesis-compose">
      <label class="ctrl-head" for="thesis" style="margin-bottom:6px"><span class="lab">private thesis <span class="muted" style="font-weight:400">— optional</span></span></label>
      <textarea id="thesis" class="hx-textarea" rows="2" placeholder="Why you believe this. On a mint it is encrypted with Seal and stored on Walrus — only you (and paying copiers) can read it." data-cursor></textarea>
      <label class="row" style="gap:9px;margin-top:10px;align-items:flex-start;cursor:pointer;font-size:12.5px;line-height:1.5" data-cursor>
        <input type="checkbox" id="reason-optin" style="margin-top:3px;accent-color:var(--accent)"/>
        <span class="muted">Let HELIX learn from my reasoning — sends a <b>plaintext</b> copy of this thesis to the Walrus Memory relayer, which extracts and stores facts from it. Off by default.</span></label>
      <div id="reason-check" class="muted" style="font-size:12.5px;margin-top:6px"></div>
    </div>`;
}
// Commit mode is always available (gas only). Minting a real DeepBook Predict order ("Bring to life")
// appears only when the wallet holds Predict v4's test USDC.
function deployControl(commit) {
  if (!state.account && isReadOnly(state))
    return `<button class="btn-solid" id="commit" disabled aria-disabled="true" title="${DEMO_BANNER}" style="opacity:.45;cursor:not-allowed">Commit conviction — read-only demo</button>
      <button class="btn-soft" id="deploy" disabled aria-disabled="true" title="${DEMO_BANNER}" style="opacity:.45;cursor:not-allowed;margin-left:8px">Bring to life — mint</button>
      <button class="btn-soft" id="wallet-inline" data-cursor style="margin-top:10px">Connect a wallet to commit as yourself ${arrow()}</button>`;
  if (!state.account)
    return `<button class="btn-solid" id="wallet-inline" data-cursor>Connect a wallet to commit this conviction ${arrow()}</button>`;
  const commitBtn = `<button class="btn-solid" id="commit" data-cursor style="margin-top:12px">Commit conviction — hash on Sui, gas only ${arrow()}</button>
    <div class="muted mono" style="font-size:10.5px;margin-top:6px">sha256 of this call goes on-chain before the window settles · can't be backdated · every commit counts in your record · no SUI? HELIX sponsors the gas</div>`;
  return thesisBlock() + commitBtn + `<div id="mint-ctl">${mintControl(commit)}</div>`;
}
// The mint option depends on the Predict account read, which can land after the compile: it re-renders alone.
function mintControl(commit) {
  const a = state.acct;
  let mint = '';
  if (!a) mint = `<div class="muted" style="margin-top:12px"><span class="sdot pending"></span> checking your DeepBook Predict account…</div>`;
  else if (a.error) mint = `<div class="muted" style="margin-top:12px;color:var(--coral)">Couldn't read your Predict account (${a.error}).</div>`;
  else {
    const need = commit + 0.05, wallet = a.walletQuoteBalance ?? 0;
    if (a.balance >= need)
      mint = `<div style="margin-top:14px"><button class="btn-soft" id="deploy" data-cursor>Bring to life — mint ${fmt(commit, 2)} on DeepBook Predict ${arrow()}</button>
        <div class="muted mono" style="font-size:10.5px;margin-top:6px">real Predict v4 order · account balance ${fmt(a.balance, 2)} test USDC</div></div>`;
    else if (wallet >= 1) {
      const sugg = Math.max(1, Math.min(Math.floor(wallet), Math.max(Math.ceil(need * 4), 10)));
      mint = `<div class="panel" style="margin-top:14px;border-color:color-mix(in srgb,var(--accent) 40%,transparent)">
      <div class="row spread"><b>Optional: fund your DeepBook Predict account to mint</b><span class="mono muted">wallet ${fmt(wallet, 2)} · account ${fmt(a.balance, 2)}</span></div>
      <div class="muted" style="margin-top:8px;line-height:1.55">Predict v4 trades from an on-chain account${a.exists ? '' : ' (created in this same transaction)'}. Move some test USDC in once; minted convictions then draw from it.</div>
      <div class="row" style="gap:10px;margin-top:12px;align-items:center"><input id="fund-amt" class="hx-textarea mono" style="width:110px;padding:8px 10px" type="number" min="1" max="${Math.floor(wallet)}" value="${sugg}"/>
      <button class="btn-solid" id="fund" data-cursor>Fund account ${arrow()}</button></div></div>`;
    } else
      mint = `<div class="muted" style="margin-top:12px;font-size:12.5px;line-height:1.55">Minting a real position needs DeepBook Predict v4 test USDC (<span class="mono" style="font-size:11px">${short((a.quoteCoinType || '').split('::')[0])}::usdc::USDC</span>), which DeepBook distributes manually. Commit mode needs none.</div>`;
  }
  return mint;
}
const arrow = () => `<span style="width:30px;height:30px;border-radius:50%;background:var(--bg);color:var(--ink);display:grid;place-items:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>`;

const REFUSAL = {
  fee: 'Your Predict account balance doesn\'t cover this order plus its fee — fund the account.',
  'entry-band': 'The price moved and this strike left Predict\'s entry band — recompile.',
  'min-premium': 'Order too small for Predict\'s 1 dUSDC minimum premium (fees near expiry are high) — commit more or pick a longer window.',
  'past-cutoff': 'This window is about to close — recompile for the next window.',
  'market-cash': 'This market can\'t back that much payout right now — commit less.',
  paused: 'Minting is paused on this market right now.', stuck: 'Predict pricing is delayed right now — retry shortly.',
};
async function onFund(el) {
  if (state.busy) return; state.busy = true;
  const out = $('#deploy-out', el);
  const amount = Number($('#fund-amt', el)?.value || 0);
  out.innerHTML = `<div class="muted"><span class="sdot pending"></span> building the deposit through Tatum — confirm in your wallet…</div>`;
  try {
    const f = await api('/tx/fund', { address: state.account.address, amount });
    const res = await signAndExecuteBytes(f.txBytes);
    if (!res.success) throw new Error(res.error || 'deposit failed');
    await refreshAccount(); renderWalletChip();
    toast('Predict account funded', `${fmt(amount, 2)} dUSDC · executed via Tatum`, 'alive');
    renderCompiled(el, state.compile, state.conv);
    $('#deploy-out', el).innerHTML = `<div class="muted">Funded · <a class="mono" style="color:var(--accent-deep)" href="${CFG.EXPLORER(res.digest)}" target="_blank" rel="noopener">tx ${short(res.digest)} ↗</a></div>`;
  } catch (e) {
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--coral) 45%,transparent)"><b style="color:var(--coral)">Not funded</b><div class="muted" style="margin-top:6px">${e.message || 'rejected'}</div></div>`;
  } finally { state.busy = false; }
}
async function onCommit(el) {
  if (!state.account || isReadOnly(state)) return;   // the demo trader is read-only
  if (state.busy) return; state.busy = true;
  compileCache.clear();   // your memory is about to change: never serve a pre-commit compile
  const out = $('#deploy-out', el); const btn = $('#commit', el);
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  const r = state.compile, conv = state.conv;
  const commit = state.chosen.commit ?? conv.capital;
  out.innerHTML = `<div class="muted"><span class="sdot pending"></span> hashing your conviction and building the commit through Tatum…</div>`;
  try {
    const thesisText = ($('#thesis', el)?.value || '').trim();
    const reason = $('#reason-optin', el)?.checked && thesisText ? { text: thesisText, optIn: true } : undefined;
    const c = await api('/tx/commit', { address: state.account.address, compileId: r.compileId, commit, useMemoryStructure: state.chosen.useMemoryStructure, reason }, { timeoutMs: 60000 });
    const settles = new Date(c.market.expiryMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    out.innerHTML = `<div class="panel"><div class="muted" style="line-height:1.6"><span class="sdot pending"></span> Confirm in your wallet: commit <span class="mono">sha256 ${c.hash.slice(0, 10)}…</span> of “${escapeHtml(c.order.label)}” to <span class="mono">helix::journal</span> — before the window settles at ${settles}. ${c.sponsored ? 'Gas is sponsored by HELIX — no SUI or USDC needed.' : 'Gas only; no USDC.'}</div></div>`;
    const res = await signAndExecuteBytes(c.txBytes, { commitId: c.commitId });
    if (!res.success) throw new Error(res.error || 'transaction failed');
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--alive) 45%,transparent);background:var(--alive-soft)">
      <div class="row spread"><b style="color:var(--alive)">Committed on Sui testnet</b><span class="sdot active"></span></div>
      <div class="muted" style="margin-top:8px;line-height:1.55">Your conviction's hash is on-chain, timestamped before settlement — executed through <span class="mono">${res.executedVia}</span>. When the window settles, HELIX reads the result through Tatum, checks the hash, and scores every voice.</div>
      <a class="btn-soft" style="margin-top:12px" href="${CFG.EXPLORER(res.digest)}" target="_blank" rel="noopener" data-cursor>View commit on Suiscan ${arrow()}</a>
      <div class="mono muted" style="font-size:11px;margin-top:10px;word-break:break-all">${res.digest} · sha256 ${c.hash}</div>
      <div id="mem-out" class="muted" style="margin-top:12px"><span class="sdot pending"></span> verifying the commit and writing a CONVICTION memory to Walrus (mainnet)…</div></div>`;
    toast('Conviction committed', 'hash on Sui · executed via Tatum', 'alive');
    pollConvictionMemory($('#mem-out', el), res.digest, c.market.expiryMs, c.text);
  } catch (e) {
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--coral) 45%,transparent)">
      <b style="color:var(--coral)">Not committed</b><div class="muted" style="margin-top:6px">${escapeHtml(e.message || 'rejected')}</div></div>`;
  } finally {
    state.busy = false; if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}
async function onDeploy(el) {
  compileCache.clear();
  if (!state.account || isReadOnly(state)) return;   // the demo trader is read-only
  if (state.busy) return; state.busy = true;
  const out = $('#deploy-out', el); const btn = $('#deploy', el);
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  const r = state.compile, conv = state.conv;
  const commit = state.chosen.commit ?? conv.capital;
  out.innerHTML = `<div class="muted"><span class="sdot pending"></span> planning the order with DeepBook Predict…</div>`;
  try {
    const thesisText = ($('#thesis', el)?.value || '').trim();
    const reason = $('#reason-optin', el)?.checked && thesisText ? { text: thesisText, optIn: true } : undefined;
    const m = await api('/tx/mint', { address: state.account.address, compileId: r.compileId, commit, useMemoryStructure: state.chosen.useMemoryStructure, reason }, { timeoutMs: 60000 });
    out.innerHTML = `<div class="panel"><div class="muted" style="line-height:1.6"><span class="sdot pending"></span> Confirm in your wallet: pay <b class="mono">${fmt(m.plan.totalDebit, 2)}</b> dUSDC (incl. ${fmt(m.plan.orderFee, 2)} order fee) → <b class="mono">${fmt(m.plan.potentialPayout, 2)}</b> dUSDC if ${m.order.label.replace(/^BTC /, 'BTC is ')}. Filled ~1s after landing at Pyth's price (or refunded).</div></div>`;
    const res = await signAndExecuteBytes(m.txBytes, { mintId: m.mintId });
    if (!res.success) throw new Error(res.error || 'transaction failed');
    await refreshAccount(); renderWalletChip();
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--alive) 45%,transparent);background:var(--alive-soft)">
      <div class="row spread"><b style="color:var(--alive)">Live on Sui testnet</b><span class="sdot active"></span></div>
      <div class="muted" style="margin-top:8px;line-height:1.55">A real DeepBook Predict order (record ${res.recordId ?? '—'}) and your HELIX strategy object, in one transaction — executed through <span class="mono">${res.executedVia}</span>.</div>
      <a class="btn-soft" style="margin-top:12px" href="${CFG.EXPLORER(res.digest)}" target="_blank" rel="noopener" data-cursor>View on Suiscan ${arrow()}</a>
      <div class="mono muted" style="font-size:11px;margin-top:10px;word-break:break-all">${res.digest}</div>
      <div id="mem-out" class="muted" style="margin-top:12px"><span class="sdot pending"></span> waiting for the keeper's fill, then writing a CONVICTION memory to Walrus (mainnet)…</div>
      <div id="thesis-out" style="margin-top:12px"></div></div>`;
    toast('Conviction is live', 'Predict order queued · executed via Tatum', 'alive');
    pollConvictionMemory($('#mem-out', el), res.digest);
    const thesis = ($('#thesis', el)?.value || '').trim();
    const created = (res.objectChanges || []).find(o => o.type === 'created' && /::strategy::StrategyObject$/.test(o.objectType || ''));
    if (thesis && created) await attachThesisFlow($('#thesis-out', el), created.objectId, thesis);
  } catch (e) {
    const msg = REFUSAL[e.code] || e.message || 'rejected';
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--coral) 45%,transparent)">
      <b style="color:var(--coral)">Not placed</b><div class="muted" style="margin-top:6px">${msg}</div></div>`;
  } finally {
    state.busy = false; if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}
// F2 — countdown to settlement, then the reveal: the watcher re-hashes the memory against the chain and scores it.
async function awaitReveal(node, digest, expiryMs) {
  const addr = state.account?.address;
  const tick = setInterval(() => {
    if (!node?.isConnected) { clearInterval(tick); return; }
    const s = Math.round((expiryMs - Date.now()) / 1000);
    if (s > 0) node.innerHTML = `<div class="row" style="gap:10px;align-items:center"><span class="mono" style="font-size:1.6rem">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</span><span class="muted">until the window settles on-chain — then HELIX reveals: hash check + result.</span></div>`;
    else if (!node.dataset.revealed) node.innerHTML = `<span class="sdot pending"></span> settled — reading the result through Tatum and checking the hash…`;
  }, 1000);
  while (node?.isConnected && Date.now() < expiryMs + 6 * 60_000) {
    await new Promise(r => setTimeout(r, Date.now() < expiryMs ? 5000 : 10000));
    if (Date.now() < expiryMs + 5000) continue;
    try {
      const t = await api(`/memory/${addr}`);
      const o = (t.timeline || []).find(x => x.type === 'OUTCOME' && x.fields?.tx === digest);
      if (o) {
        clearInterval(tick); node.dataset.revealed = '1';
        const f = o.fields, win = f.result === 'WIN';
        node.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,${win ? 'var(--alive)' : 'var(--coral)'} 45%,transparent)">
          <div class="row spread"><b style="font-size:1.3rem;color:${win ? 'var(--alive)' : 'var(--coral)'}">${escapeHtml(f.result)}</b><span class="mono">${f.mode === 'commit' ? 'would have paid' : 'payoff'} ${escapeHtml(f.payoff)}</span></div>
          <div style="margin-top:6px">${f.reveal_ok === 'true' ? '<span style="color:var(--alive)">✓ hash verified</span> — the remembered call is exactly what you committed' : f.reveal_ok === 'false' ? '<b style="color:var(--coral)">✗ hash mismatch</b>' : ''} · settled ${escapeHtml(f.settle_px)} vs ${escapeHtml(f.strike_px)}</div>
          <div class="muted mono" style="font-size:11px;margin-top:6px">OUTCOME blob ${short(o.blob_id)} · calibration updated · <a href="#/memory" style="color:var(--accent-deep)">see what memory learned →</a></div></div>`;
        return;
      }
    } catch (e) {}
  }
  clearInterval(tick);
  if (node?.isConnected && !node.dataset.revealed) node.innerHTML = `<span class="muted">The result is still being written — it will appear on the <a href="#/memory" style="color:var(--accent-deep)">Memory</a> page.</span>`;
}
async function pollConvictionMemory(node, digest, expiryMs, commitText) {
  for (let i = 0; i < 24 && node?.isConnected; i++) {
    await new Promise(r => setTimeout(r, 5000));
    // the server records commits in the background; if it restarted mid-write, record it from here (idempotent)
    if (i === 9 && commitText) api('/memory/conviction', { address: state.account.address, text: commitText, digest }, { timeoutMs: 120000 }).catch(() => {});
    try {
      const t = await api(`/memory/${state.account.address}`);
      const hit = (t.timeline || []).find(x => x.type === 'CONVICTION' && x.fields?.tx === digest);
      if (hit) {
        node.innerHTML = `<span class="sdot active"></span> CONVICTION remembered on Walrus mainnet · blob <span class="mono">${short(hit.blob_id)}</span> · ${hit.fields.mode === 'commit' ? 'commit verified on-chain' : 'fill ' + hit.fields.fill} · <a href="#/memory" style="color:var(--accent-deep)">open Memory →</a>
          <div id="reveal" style="margin-top:10px"></div>`;
        if (expiryMs) awaitReveal($('#reveal', node), digest, expiryMs);
        return;
      }
    } catch (e) {}
  }
  if (node?.isConnected) node.innerHTML = `Memory write still in progress — it will appear on the <a href="#/memory" style="color:var(--accent-deep)">Memory</a> page.`;
}
// encrypt the thesis (Seal) → store on Walrus → record it on-chain (attach_thesis)
async function attachThesisFlow(out, strategyId, text) {
  if (!out) return;
  try {
    out.innerHTML = `<div class="muted"><span class="sdot pending"></span> encrypting thesis with Seal &amp; storing on Walrus…</div>`;
    const ciphertext = await encryptThesis(client, strategyId, text);
    const blobId = await uploadToWalrus(ciphertext);
    const tx = new Transaction();
    addAttachThesis(tx, strategyId, blobId);
    const res = await signAndExecute(tx);
    out.innerHTML = `<div class="row" style="gap:8px;align-items:flex-start"><span class="sdot active" style="margin-top:4px"></span>
      <span style="font-size:13px;line-height:1.45">Private thesis encrypted with Seal &amp; stored on Walrus — only you and paying copiers can read it.
      <a class="mono" style="color:var(--accent-deep)" href="${CFG.EXPLORER(res.digest)}" target="_blank" rel="noopener">tx ↗</a></span></div>`;
  } catch (e) {
    out.innerHTML = `<div class="muted" style="color:var(--coral);font-size:13px">Thesis not attached (${e.message || 'error'}) — the strategy itself minted fine; you can add a thesis later from its detail page.</div>`;
  }
}
async function pingTEE(el) {
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 20000);
    const res = await fetch(`${CFG.COMPILER_URL}/health`, { signal: c.signal });
    const b = $('#tee-badge', el);
    if (res.ok) {
      const j = await res.json();
      if (b) { b.textContent = `compiler · tatum ✓ · memory ${j.memwal === 'ok' ? '✓' : j.memwal}`; b.title = `Tatum testnet checkpoint ${j.tatum_testnet_checkpoint} · mainnet ${j.tatum_mainnet_checkpoint} · ${j.memory_network}`; }
    } else if (b) b.textContent = 'compiler · down';
  } catch (e) { const b = $('#tee-badge', el); if (b) { b.textContent = 'compiler · waking…'; } }
}

/* ============================================================ supporting pages (real on-chain reads via Tatum) */
const STATUS = ['pending', 'active', 'closed', 'dead'];
async function getMyStrategies() {
  if (!state.account) return [];
  const objs = await ownedOfType(state.account.address, `${CFG.HELIX}::strategy::StrategyObject`);
  const list = objs.map(o => parseStrategy(o.id, o.json)).filter(Boolean);
  // remembered for the Canvas radar's Concentration axis (this conviction's share of live capital)
  state.liveCapital = list.filter(s => s.status === 'active' || s.status === 'pending').reduce((a, s) => a + s.capital, 0);
  return list;
}
async function getStrategy(id) {
  const o = await objectOf(id);
  return o ? parseStrategy(o.id, o.json) : null;
}
async function getAllStrategies() {
  // every StrategyObject ever minted, via its creation event (cross-user leaderboard)
  const ev = await eventsOfType(`${CFG.HELIX}::events::StrategyCreated`, 50);
  const ids = [...new Set(ev.map(e => e.json?.strategy_id).filter(Boolean))];
  const objs = await Promise.all(ids.map(id => getStrategy(id).catch(() => null)));
  return objs.filter(Boolean);
}
async function getBreedings() {
  try { return (await eventsOfType(`${CFG.HELIX}::events::BreedingExecuted`, 50)).map(e => e.json).filter(Boolean); }
  catch (e) { return []; }
}
function parseStrategy(id, f) {
  if (!f) return null;
  const d = f.dna?.fields || f.dna || {};
  return {
    id, owner: f.owner, creator: f.creator,
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
  return api('/preview', { ...conv, currentEpoch: 0 });
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
  if (!state.account) { el.innerHTML = connectPrompt('See your living portfolio', 'Connect a wallet to read your HELIX strategy objects and DeepBook Predict account from chain.'); return { el }; }
  el.innerHTML = `<div id="strat-list"><div class="muted"><span class="sdot pending"></span> reading your strategies from chain (via Tatum)…</div></div>`;
  (async () => {
    const host = $('#strat-list', el);
    try {
      const [strats, acct] = await Promise.all([getMyStrategies(), refreshAccount()]);
      const acctPanel = acct && !acct.error ? `<div class="panel" style="margin-top:18px"><div class="row spread"><div class="section-title" style="margin:0">deepbook predict account</div>
          <a class="badge" href="${CFG.EXPLORER_OBJ(acct.wrapperId)}" target="_blank" rel="noopener">${short(acct.wrapperId)} ↗</a></div>
          <div class="muted" style="margin-top:8px">${acct.exists ? `Balance ${fmt(acct.balance, 2)} dUSDC. Filled orders live as Open records in each market's queue and pay into this account at settlement.` : 'Not created yet — your first funding creates it.'}</div></div>` : '';
      if (!strats.length) { host.innerHTML = emptyState() + acctPanel; return; }
      host.innerHTML = `<div class="grid-3">${strats.map(cardHTML).join('')}</div>${acctPanel}`;
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
      let pr = null;
      try { pr = await preview(dnaToConv(s.dna, s.capital)); } catch (e) {}
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
          <div class="stat"><div class="k">market win now</div><div class="v">${pr?.predict ? Math.round(pr.predict.order.pMkt * 100) + '%' : '—'}</div></div>
          <div class="stat"><div class="k">status</div><div class="v" style="text-transform:capitalize">${s.status}</div></div>
        </div>
        <div class="grid-2 reveal d1" style="align-items:start">
          <div class="panel"><div class="section-title">this DNA, re-compiled on today's market</div><div class="chart-wrap" id="d-payoff">${pr?.predict ? '' : '<div class="muted" style="padding:30px">compiler offline — payoff unavailable</div>'}</div>
            ${pr?.predict ? `<div class="muted" style="font-size:12.5px;margin-top:8px">${pr.predict.order.label}</div>` : ''}</div>
          <div class="panel"><div class="section-title">performance</div>
            <div class="muted" style="line-height:1.7">Outcomes of your convictions are recorded in Walrus Memory and shown on the <a href="#/memory" style="color:var(--accent-deep)">Memory</a> page. HELIX never draws a fabricated equity curve.</div>
            <div class="grid-2" style="margin-top:14px"><div class="stat"><div class="k">copies</div><div class="v">${s.copies}</div></div><div class="stat"><div class="k">offspring</div><div class="v">${s.offspring}</div></div></div></div>
        </div>
        <div class="panel reveal d2" style="margin-top:18px"><div class="section-title">strategy DNA</div><div class="dna-grid">${dnaGrid(s.dna)}</div></div>
        <div class="panel reveal d2" id="thesis-panel" style="margin-top:18px"><div class="section-title">private thesis</div>
          <div class="muted"><span class="sdot pending"></span> checking for an encrypted thesis…</div></div>
        <div class="panel reveal d2" style="margin-top:18px"><div class="section-title">lineage</div>${lineageBlurb(s)}</div>
        <div id="act-out" style="margin-top:14px"></div>`;
      if (pr?.predict) updatePredictPayoff($('#d-payoff', host), pr.predict.order, pr.predict.forward, Math.max(2, s.capital || 5));
      revealObserve(host);
      renderThesisPanel(host, s);
      host.addEventListener('click', e => {
        if (e.target.closest('#thesis-unlock')) unlockThesis(host, s);
        if (e.target.closest('#thesis-attach')) attachThesisDetail(host, s);
        if (e.target.closest('#thesis-copy')) copyStrategyFlow(host, s);
      });
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
      const coin = await pickFeeCoin(BigInt(required));
      [fee] = tx.splitCoins(tx.object(coin), [tx.pure.u64(BigInt(required))]);
    } else {
      fee = tx.moveCall({ target: '0x2::coin::zero', typeArguments: [CFG.FEE_COIN], arguments: [] });
    }
    const [child, cap] = tx.moveCall({
      target: `${CFG.HELIX}::breeding::breed`, typeArguments: [CFG.FEE_COIN],
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
    const msg = (e.message || '').includes('INSUFFICIENT_FEE_COIN') ? 'Need fee coins for the breed fee — relist both parents with a 0 fee.' : (e.message || 'rejected');
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--coral) 45%,transparent)"><b style="color:var(--coral)">Not bred</b><div class="muted" style="margin-top:6px">${msg}</div></div>`;
  }
}

/* -------- Private thesis (Seal-encrypted, on Strategy Detail) -------- */
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
async function findCopyRelationship(originalId) {
  if (!state.account) return null;
  try {
    const rels = await ownedOfType(state.account.address, `${CFG.HELIX}::marketplace::CopyRelationship`);
    const hit = rels.find(o => o.json?.original_strategy_id === originalId);
    return hit ? hit.id : null;
  } catch (e) { return null; }
}
async function renderThesisPanel(host, s) {
  const panel = $('#thesis-panel', host); if (!panel) return;
  const blobId = await getThesisBlobId(s.id);
  const mine = state.account && s.owner === state.account.address;
  const relId = (!mine && state.account && blobId) ? await findCopyRelationship(s.id) : null;
  // Seal decryption needs a personal-message signature (SessionKey), which only a
  // browser wallet provides — zkLogin/Google sessions can't decrypt yet.
  const canDecrypt = state.mode === 'wallet' && !!state.wallet?.features?.['sui:signPersonalMessage'];
  const zkNote = `<div class="row" style="gap:10px;align-items:flex-start;margin-top:12px"><span class="sdot pending" style="margin-top:5px;flex:0 0 auto"></span>
    <span class="muted" style="line-height:1.6">Reading a Seal thesis needs a browser wallet signature (Seal session key). You're signed in with Google (zkLogin) — reconnect with a wallet to unlock theses.</span></div>`;
  if (blobId) {
    panel.dataset.blob = blobId; if (relId) panel.dataset.rel = relId;
    if (mine || relId) {
      panel.innerHTML = `<div class="section-title">private thesis</div>
        <div class="muted" style="line-height:1.6">A Seal-encrypted thesis is attached to this strategy. ${mine ? 'You own it.' : 'You copied it — so you can read it.'} Decrypt with your wallet (a quick signature, no transaction).</div>
        ${canDecrypt ? `<button class="btn-soft" id="thesis-unlock" data-cursor style="margin-top:12px">Unlock thesis ${arrow()}</button>` : zkNote}
        <div id="thesis-plain" style="margin-top:12px"></div>`;
    } else {
      const feeUnits = Math.floor((s.capital || 0) * (s.copyFeeBps || 0) / 10000);
      const payLbl = feeUnits > 0 ? ` · pay ${fmt(feeUnits)} dUSDC` : ' · free';
      panel.innerHTML = `<div class="section-title">private thesis</div>
        <div class="row" style="gap:10px;align-items:flex-start"><span class="sdot dead" style="margin-top:5px;flex:0 0 auto"></span>
        <span class="muted" style="line-height:1.6">This strategy carries a Seal-encrypted thesis. Structure and performance are public on-chain, but the owner's reasoning unlocks only for paying copiers.</span></div>
        ${!state.account
          ? `<div class="muted" style="margin-top:12px">Connect a wallet to copy this strategy and unlock its thesis.</div>`
          : !canDecrypt ? zkNote
            : `<button class="btn-soft" id="thesis-copy" data-cursor style="margin-top:14px">Copy strategy${payLbl} ${arrow()}</button>
               <div class="muted mono" style="font-size:10.5px;margin-top:6px">paying to copy records an on-chain CopyRelationship → Seal then grants you the thesis</div>
               <div id="thesis-copy-out" style="margin-top:12px"></div>`}`;
    }
  } else if (mine) {
    panel.innerHTML = `<div class="section-title">private thesis</div>
      <div class="muted" style="margin-bottom:8px;line-height:1.6">Attach a private note explaining your conviction. Encrypted with Seal, stored on Walrus — readable only by you and paying copiers.</div>
      <textarea id="thesis-input" class="hx-textarea" rows="3" placeholder="Why you believe this…" data-cursor></textarea>
      <button class="btn-soft" id="thesis-attach" data-cursor style="margin-top:10px">Encrypt &amp; attach ${arrow()}</button>
      <div id="thesis-attach-out" style="margin-top:10px"></div>`;
  } else {
    panel.innerHTML = `<div class="section-title">private thesis</div><div class="muted">No private thesis attached to this strategy.</div>`;
  }
}
async function unlockThesis(host, s) {
  const panel = $('#thesis-panel', host); const out = $('#thesis-plain', host);
  const blobId = panel?.dataset.blob; const relId = panel?.dataset.rel || null;
  if (!blobId || !out) return;
  out.innerHTML = `<div class="muted"><span class="sdot pending"></span> fetching from Walrus &amp; decrypting (sign in your wallet)…</div>`;
  try {
    const ciphertext = await fetchFromWalrus(blobId);
    const text = await decryptThesis(client, state.account.address, signPersonalMessage, ciphertext, s.id, relId);
    out.innerHTML = `<div class="panel" style="border-color:color-mix(in srgb,var(--alive) 40%,transparent);background:var(--alive-soft)">
      <div class="row spread"><b style="color:var(--alive)">Thesis unlocked</b><span class="sdot active"></span></div>
      <div style="margin-top:8px;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</div></div>`;
  } catch (e) {
    out.innerHTML = `<div class="muted" style="color:var(--coral)">Couldn't unlock: ${e.message || 'access denied'}</div>`;
  }
}
// The copier path: a non-owner pays to copy → gets an on-chain CopyRelationship →
// Seal's seal_approve_copier then grants them the thesis (copy_for_thesis never
// references the owner's OWNED StrategyObject).
async function copyStrategyFlow(host, s) {
  const out = $('#thesis-copy-out', host);
  if (!state.account) { if (out) out.innerHTML = `<div class="muted">Connect a wallet to copy.</div>`; return; }
  if (state.busy) return; state.busy = true;
  const btn = $('#thesis-copy', host); if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  if (out) out.innerHTML = `<div class="muted"><span class="sdot pending"></span> paying the creator &amp; recording your copy on-chain…</div>`;
  try {
    const feeUnits = Math.floor((s.capital || 0) * (s.copyFeeBps || 0) / 10000);
    const feeBase = BigInt(feeUnits) * BigInt(10 ** CFG.QUOTE_DECIMALS);
    const tx = new Transaction();
    let fee;
    if (feeBase > 0n) {
      const coinId = await pickFeeCoin(feeBase);
      [fee] = tx.splitCoins(tx.object(coinId), [tx.pure.u64(feeBase)]);
    } else {
      fee = tx.moveCall({ target: '0x2::coin::zero', typeArguments: [CFG.FEE_COIN], arguments: [] });
    }
    const rel = tx.moveCall({
      target: `${CFG.HELIX_LATEST}::marketplace::copy_for_thesis`,
      typeArguments: [CFG.FEE_COIN],
      arguments: [tx.pure.id(s.id), tx.pure.address(s.creator), fee],
    });
    tx.transferObjects([rel], tx.pure.address(state.account.address));
    const res = await signAndExecute(tx);
    const createdRel = (res.objectChanges || []).find(o => o.type === 'created' && /::marketplace::CopyRelationship$/.test(o.objectType || ''));
    toast('Strategy copied', 'on-chain CopyRelationship recorded — unlocking thesis', 'alive');
    const panel = $('#thesis-panel', host);
    if (panel && createdRel) panel.dataset.rel = createdRel.objectId;
    await renderThesisPanel(host, s);
    if (panel && createdRel) panel.dataset.rel = createdRel.objectId;
    await unlockThesis(host, s);
  } catch (e) {
    const msg = (e.message || '').includes('INSUFFICIENT_FEE_COIN') ? 'Not enough fee coins to pay the copy fee.' : (e.message || 'rejected');
    if (out) out.innerHTML = `<div class="muted" style="color:var(--coral)">Copy failed: ${msg}</div>`;
  } finally {
    state.busy = false; const b = $('#thesis-copy', host); if (b) { b.disabled = false; b.style.opacity = '1'; }
  }
}
async function attachThesisDetail(host, s) {
  const text = ($('#thesis-input', host)?.value || '').trim();
  const out = $('#thesis-attach-out', host);
  if (!text) { if (out) out.innerHTML = `<div class="muted">Write your thesis first.</div>`; return; }
  await attachThesisFlow(out, s.id, text);
  setTimeout(() => renderThesisPanel(host, s), 1600);
}

/* -------- Forecaster Passport (a wallet's own, the demo trader's, or any id) -------- */
function viewPassport(id) {
  const el = document.createElement('div'); el.className = 'view view-enter';
  const who = id || viewingAddress(state);
  if (!who) { el.innerHTML = connectPrompt('Your Forecaster Passport', 'Connect a wallet to see your verifiable record — or <a href="app.html?demo=1#/passport" style="color:var(--accent-deep)">open the demo trader\'s passport</a>.'); return { el }; }
  el.innerHTML = `<div id="pp"></div>`;
  renderPassport($('#pp', el), who, {
    base: String(CFG.COMPILER_URL).replace(/\/+$/, ''),
    // the soulbound on-chain passport (Lane B, P4): mint/refresh for your own record, read-only for anyone else's
    onMount: (p, slot) => {
      if (!slot) return;
      import('./onchain-passport.js').then(m => m.mountOnchainPassport?.(slot, {
        api, address: state.account?.address ?? null, owner: p.address, ns: p.namespace, signAndExecuteBytes,
        explorer: { tx: CFG.EXPLORER, object: CFG.EXPLORER_OBJ }, readOnly: isReadOnly(state),
      })).catch(() => {});
    },
  });
  return { el };
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
      let bias = 0, cap = 0, conc = 0;
      strats.forEach(s => { bias += (s.dna.dirNegative ? -1 : 1) * s.dna.dirMagnitude / 100 * s.capital; cap += s.capital; conc += s.dna.legCount <= 1 ? 1 : 0.5; });
      const netBias = cap ? Math.abs(bias) / cap : 0;
      const mins = state.compile?.predict?.market?.minutesLeft;
      const o = state.compile?.predict?.order, band = state.compile?.predict?.band;
      // axes that need a live compile (time, entry headroom) are omitted until you compile — never placeholders
      const axes = [{ k: 'Net Exposure', v: Math.min(1, netBias * 0.9 + 0.1) }, { k: 'Directional Bias', v: netBias },
        mins == null ? null : { k: 'Time-to-Resolution', v: Math.min(1, 1 - Math.min(mins, 15) / 15) }, { k: 'Concentration', v: Math.min(1, conc / strats.length) },
        o && band ? { k: 'Entry Headroom', v: Math.max(0, Math.min(1, Math.min(o.pMkt - band.minEntry, band.maxEntry - o.pMkt) / 0.25)) } : null].filter(Boolean);
      const flags = state.compile?.guardian || [];
      host.innerHTML = `<div class="grid-2 reveal" style="align-items:start">
        <div class="panel ink"><div class="section-title">portfolio risk compass</div><div style="display:grid;place-items:center">${radarSVG(axes)}</div>
          <div class="muted mono" style="text-align:center;font-size:11px;margin-top:8px">${strats.length} conviction object${strats.length > 1 ? 's' : ''} · ${fmt(cap)} dUSDC committed</div></div>
        <div class="panel"><div class="row spread"><div class="section-title" style="margin:0">guardian</div><span class="badge tee">live Predict pricer</span></div>
          <div style="margin-top:14px">${flags.length ? flags.map(f => `<div class="row" style="gap:9px;margin-bottom:12px;align-items:flex-start"><span class="sdot ${f.bad ? 'dead' : 'active'}" style="margin-top:5px;flex:0 0 auto"></span><span style="font-size:14px;line-height:1.5;color:${f.bad ? 'var(--coral)' : 'var(--ink-2)'}">${f.t}</span></div>`).join('')
            : `<div class="muted">Compile a conviction on the <a href="#/canvas" style="color:var(--accent-deep)">Canvas</a> to see live guardian lines for the current market window.</div>`}</div></div>
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
      host.innerHTML = `<div class="panel reveal"><div class="row spread"><div class="section-title" style="margin:0">conviction lineage · the family tree</div><span class="badge">${all.length} strateg${all.length === 1 ? 'y' : 'ies'} · ${breeds.length} breed${breeds.length === 1 ? '' : 's'}</span></div>
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
  { id: 'memory', match: /^#\/memory$/, title: 'Memory', sub: 'who was right · walrus mainnet', view: () => viewMemory({ state, $, connectPrompt, explorer: CFG.EXPLORER, address: viewingAddress(state), readOnly: isReadOnly(state), banner: demoBannerHTML() }) },
  // any forecaster's memory, read-only (agents, other traders): #/memory/0x…
  { id: 'memory', match: /^#\/memory\/(0x[0-9a-fA-F]{64})$/, title: 'Memory', sub: 'read-only · walrus mainnet', view: (m) => viewMemory({ state, $, connectPrompt, explorer: CFG.EXPLORER, address: m[1].toLowerCase(), readOnly: true, banner: `<div class="panel" style="margin-bottom:16px;border-color:color-mix(in srgb,var(--accent) 40%,transparent)"><b>Viewing ${short(m[1])} — read only</b> <span class="muted">· every number below is recalled from this address's Walrus Memory</span></div>` }) },
  { id: 'passport', match: /^#\/passport(?:\/([0-9a-zA-Z-]+))?$/, title: 'Forecaster Passport', sub: 'proof-of-forecast · verifiable', view: (m) => viewPassport(m[1]) },
  { id: 'api', match: /^#\/api$/, title: 'Credibility API', sub: 'pay-per-call · MPP on Sui', view: () => viewApiDocs({ $ }) },
  { id: 'council', match: /^#\/council$/, title: 'The Council', sub: 'four agents · weighted by memory', view: () => viewCouncil({ $, explorer: CFG.EXPLORER }) },
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
  revealObserve(built.el); watchReveals(); window.scrollTo(0, 0);
}
function revealObserve(root) {
  const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  (root || document).querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
}
// Views render asynchronously (Memory, Council, Passport, API…): any .reveal added after the route's
// first paint must be observed too, or it stays at opacity 0 — content in the DOM but invisible.
let revealMO = null;
function watchReveals() {
  const host = $('#view-host');
  if (!host || revealMO) return;
  revealMO = new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.classList?.contains('reveal') || n.querySelector?.('.reveal')) revealObserve(n.parentNode || n);
    }
  });
  revealMO.observe(host, { childList: true, subtree: true });
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
    const a = state.acct;
    const bal = a && !a.error ? `${fmt((a.walletQuoteBalance ?? 0) + (a.balance ?? 0), 2)} dUSDC` : '…';
    const via = state.mode === 'zk' ? `<span class="mono" style="font-size:10px;color:var(--accent-deep)">G</span> ` : '';
    b.innerHTML = `<span class="sdot active"></span> ${via}${short(state.account.address)} · ${bal}`;
    b.title = (state.mode === 'zk'
      ? `zkLogin via Google${state.zk?.email ? ' (' + state.zk.email + ')' : ''} — click to sign out`
      : 'Click to disconnect') + (a && !a.error ? ` · wallet ${fmt(a.walletQuoteBalance ?? 0, 2)} + Predict account ${fmt(a.balance ?? 0, 2)}` : '');
  } else { b.innerHTML = 'Connect'; b.title = ''; }
}
function walletButton() {
  const b = $('#wallet');
  b.addEventListener('click', () => { if (state.account) disconnectWallet(); else openWalletPicker(); });
}
function openWalletPicker() {
  const wallets = discoverWallets();
  const ov = document.createElement('div'); ov.className = 'wpick-ov';
  // zkLogin "Continue with Google" — only shown when an OAuth client id is
  // configured, so there is never a dead button (scope guard: real or removed).
  const googleRow = zkConfigured() ? `
    <button class="wpick-item" id="wpick-google" data-cursor>
      <svg width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      <span>Continue with Google</span>
      <span class="mono" style="margin-left:auto;font-size:10px;color:var(--ink-3)">zkLogin · no seed phrase</span>
    </button>
    <div class="wpick-or"><span>or connect a wallet</span></div>` : '';
  ov.innerHTML = `<div class="wpick">
    <div class="row spread" style="margin-bottom:6px"><b style="font-family:var(--serif);font-size:1.4rem;font-weight:400">Connect</b><button class="wpick-x" data-cursor>✕</button></div>
    <div class="muted" style="font-size:13px;margin-bottom:16px">Sui testnet · zkLogin or Wallet Standard</div>
    ${googleRow}
    ${wallets.length ? wallets.map((w, i) => `<button class="wpick-item" data-i="${i}" data-cursor>
        ${w.icon ? `<img src="${w.icon}" alt="" width="26" height="26" style="border-radius:7px"/>` : '<span class="wpick-dot"></span>'}
        <span>${w.name}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>`).join('')
      : `<div class="muted" style="padding:14px 0">No browser wallet detected. Install <a class="mono" style="color:var(--accent-deep)" href="https://slush.app" target="_blank" rel="noopener">Slush</a>, Sui Wallet or Suiet${zkConfigured() ? ' — or just continue with Google above' : ''}, then reload.</div>`}
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', async (e) => {
    if (e.target === ov || e.target.closest('.wpick-x')) return close();
    if (e.target.closest('#wpick-google')) {
      close();
      try { toast('Redirecting to Google', 'zkLogin — deriving a Sui address', 'gold'); await connectGoogle(); }
      catch (err) { toast('Google sign-in failed', err.message || 'error', 'gold'); }
      return;
    }
    const it = e.target.closest('.wpick-item'); if (!it || it.id === 'wpick-google') return;
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
      ${railLink('memory', '#/memory', 'Memory')}
      ${railLink('risk', '#/risk', 'Risk Compass')}
      ${railLink('market', '#/market', 'Marketplace')}
      ${railLink('passport', '#/passport', 'Passport')}
      ${railLink('council', '#/council', 'The Council')}
      ${railLink('lineage', '#/lineage', 'Lineage')}
      <div class="rail-spacer"></div>
    </aside>
    <main>
      <div class="topbar">
        <div class="page-h"><span class="eyebrow" id="page-sub">express a belief</span><h1 id="page-title">Conviction Canvas</h1></div>
        <div class="right">
          <a class="chip" id="proof-ticker" href="#/passport" style="display:none;text-decoration:none" title="Counted from helix::journal ConvictionCommitted events on Sui (via Tatum); hidden = commits with no memory"></a>
          <a class="chip" id="tatum-chip" href="ops.html" style="text-decoration:none" title="Every Sui read and transaction goes through Tatum · memory on Walrus mainnet — open the live Ops panel"><span class="live"></span> sui testnet · tatum</a>
          <div class="theme-toggle" role="radiogroup" aria-label="Theme" id="theme-toggle">
            <span class="tt-pill" id="tt-pill"></span>
            <button role="radio" data-theme-val="light" aria-label="Light" data-cursor><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
            <button role="radio" data-theme-val="dark" aria-label="Dark" data-cursor><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>
          </div>
          <a class="btn-soft" id="demo-link" href="${demoHref()}" data-cursor title="Explore a real trader's Walrus memory read-only — no wallet needed">View demo trader</a>
          <button class="btn-soft" id="wallet" data-cursor>Connect wallet</button>
        </div>
      </div>
      <div id="view-host"></div>
    </main>`;
  document.body.appendChild(app);
}

function proofTicker() {
  const run = async () => {
    const n = $('#proof-ticker'); if (!n) return;
    try {
      const t = await api('/proof/ticker'); const s = tickerText(t);
      if (s) { n.textContent = s; n.style.display = ''; }
      // T0 degrade mode: Tatum refused the key (quota/auth) — say so instead of pretending to be live
      let b = $('#degrade-banner');
      if (t?.degraded) {
        if (!b) { b = document.createElement('div'); b.id = 'degrade-banner'; b.setAttribute('role', 'status');
          b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:8px 16px;text-align:center;font:500 13px/1.4 var(--sans,system-ui);background:var(--ink);color:var(--bg)';
          document.body.appendChild(b); }
        b.textContent = `${t.degraded.banner} · commits are paused until Tatum recovers`;
      } else if (b) b.remove();
      if (t?.audit) n.title = `Counted from helix::journal ConvictionCommitted events on Sui (via Tatum); hidden = commits with no memory. Chain audit: every commit re-fetched as a transaction through Tatum and checked (sender, event, success, checkpoint time before expiry), ${new Date(t.audit.at_ms).toLocaleTimeString()} — full report at /proof/audit`;
    } catch (e) {}
  };
  run(); setInterval(run, 60_000);
}
function init() {
  build(); cursor(); themeToggle(); walletButton(); proofTicker();
  import('./ask-button.js').then(m => m.mountAskButton({ api, address: () => viewingAddress(state), readOnly: () => isReadOnly(state) })).catch(() => {});
  // (a0) arrived from the landing-page "Continue with Google" CTA (app.html?login=google)?
  const qp = new URLSearchParams(location.search);
  if (qp.get('login') === 'google' && zkConfigured() && !loadZkSession() && !location.hash.includes('id_token=')) {
    history.replaceState(null, '', location.pathname); // drop the ?login flag
    connectGoogle().catch(err => {
      toast('Google sign-in failed', err.message || 'error', 'gold');
      addEventListener('hashchange', render); render();
      const boot = $('#boot'); if (boot) setTimeout(() => boot.classList.add('done'), 520);
      document.body.classList.remove('booting');
    });
    return; // on success the page navigates away to Google; nothing else to do
  }
  // (a) returning from a Google OAuth redirect? finish zkLogin (proof + address).
  completeGoogleLoginIfPresent().then(s => {
    if (s) { activateZkSession(s).then(() => { toast('Signed in with Google', 'zkLogin address ' + short(s.address), 'alive'); render(); }); }
  }).catch(err => toast('zkLogin failed', err.message || 'prover error', 'gold'));
  // (b) restore a still-valid zkLogin session from this tab, else a wallet.
  const zk = loadZkSession();
  if (zk) { state.mode = 'zk'; state.zk = zk; state.account = { address: zk.address }; refreshAccount().then(() => { renderWalletChip(); window.dispatchEvent(new Event('helix:acct')); }); }
  else {
    const ws = discoverWallets();
    const remembered = ws.find(w => (w.accounts && w.accounts.length));
    if (remembered) { state.wallet = remembered; state.account = remembered.accounts[0]; refreshAccount().then(() => { renderWalletChip(); window.dispatchEvent(new Event('helix:acct')); }); }
  }
  addEventListener('hashchange', render);
  // Judge Mode: ?demo=1 → load the read-only demo trader first (the Canvas waits for it), then re-render
  if (demoRequested(location.search)) state.demoPending = true;
  render();
  if (state.demoPending) {
    const dl = $('#demo-link'); if (dl) { dl.textContent = 'Exit demo'; dl.href = 'app.html' + location.hash; }
    api('/demo').then(d => {
      if (!d.address) toast('Demo trader not configured', 'set DEMO_ADDRESS on the compiler', 'gold');
      else state.demo = d.address;
    }).catch(err => toast('Demo unavailable', err.message || 'compiler unreachable', 'gold'))
      .finally(() => { state.demoPending = false; render(); });
  }
  const boot = $('#boot'); if (boot) setTimeout(() => boot.classList.add('done'), 520);
  document.body.classList.remove('booting');
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();
