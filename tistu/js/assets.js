/* ============================================================
   HELIX — multi-asset Canvas (P5). ETH and SUI have no DeepBook Predict market, so a call on them
   is a commit-mode conviction: "price above / at-or-below the current Pyth price at the window's
   expiry", hashed on Sui before expiry and scored against the first Pyth price at or after it.
   Voices that don't exist for an asset show "n/a for this asset" — never a number.
   Only shown when the server has FEATURE_ASSETS on (GET /assets).
   ============================================================ */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (p) => (p == null || !Number.isFinite(p) ? '—' : Math.round(p * 100) + '%');
const usd = (x) => (x == null || !Number.isFinite(x) ? '—' : x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(4) : x.toPrecision(6));
const b2 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2));
const short = (s) => (s ? s.slice(0, 6) + '…' + s.slice(-4) : '');

/** Switcher chips for the assets that can be called right now (BTC always first). */
export function assetChipsHTML(list, current) {
  const avail = (list || []).filter(a => a.available);
  if (avail.length < 2) return '';
  return `<span class="row" role="radiogroup" aria-label="Asset" style="gap:6px;display:inline-flex;margin-left:12px;vertical-align:middle">${avail.map(a =>
    `<button type="button" class="chip" role="radio" aria-checked="${a.asset === current}" data-asset="${esc(a.asset)}" data-cursor
      title="${esc(a.asset === 'BTC' ? 'DeepBook Predict market' : `commit mode · resolved by Pyth (${a.price_source})`)}"
      style="cursor:pointer;font-family:var(--sans);font-size:12px;${a.asset === current ? 'color:var(--accent-deep);border-color:var(--accent)' : ''}">${esc(a.asset)}</button>`).join('')}</span>`;
}

/** Mount the switcher; renders nothing when the feature is off (404) or only BTC is callable. */
export async function mountAssetSwitch(host, { api, current, onChange }) {
  if (!host) return null;
  let list;
  try { list = (await api('/assets')).assets; } catch (e) { return null; }
  const draw = () => { host.innerHTML = assetChipsHTML(list, current()); };
  draw();
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-asset]'); if (!b) return;
    onChange(b.dataset.asset); draw();
  });
  return list;
}

export function assetCommitControl({ account, readOnly, banner }) {
  if (!account && readOnly)
    return `<button class="btn-solid" id="commit" disabled aria-disabled="true" title="${esc(banner)}" style="opacity:.45;cursor:not-allowed">Commit conviction — read-only demo</button>
      <button class="btn-soft" id="wallet-inline" data-cursor style="margin-top:10px">Connect a wallet to commit as yourself</button>`;
  if (!account) return `<button class="btn-solid" id="wallet-inline" data-cursor>Connect a wallet to commit this conviction</button>`;
  return `<button class="btn-solid" id="commit" data-cursor style="margin-top:12px">Commit conviction — hash on Sui, gas only</button>
    <div class="muted mono" style="font-size:10.5px;margin-top:6px">sha256 of this call goes on-chain before the window settles · scored against the first Pyth price at or after expiry · no Predict market for this asset, so no mint</div>`;
}

/** The compiled card for an ETH/SUI call. `h` carries the shared renderers from app.js / memory-ui.js. */
export function assetCompiledHTML(r, h) {
  const c = r.call, w = r.window, pr = r.price || {};
  const flags = r.guardian || [];
  const src = pr.source === 'pyth-sui' ? 'Pyth on Sui' : 'Pyth Hermes';
  return `
    <div class="row spread" style="margin:14px 0 6px">
      <div><div class="muted mono" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">commit mode · ${esc(r.asset)} · resolved by Pyth</div>
      <div style="font-family:var(--sans);font-weight:600;font-size:1.4rem">${esc(c.label)}</div></div>
      <span class="badge" title="no DeepBook Predict market exists for ${esc(r.asset)}">market n/a</span>
    </div>
    <div class="muted" style="margin-bottom:14px;line-height:1.5">resolves in ${Number(w.minutesLeft).toFixed(1)} min · right if ${esc(r.asset)}/USD is ${c.side === 'up' ? 'above' : 'at or below'} $${usd(c.strike)} on the first Pyth price at or after expiry</div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <span class="badge">${esc(r.asset)}/USD $${usd(r.spot)} · ${esc(src)} · ${Number(pr.age_s)}s old</span>
      ${pr.tx ? `<a class="badge mono" href="${esc(h.explorer(pr.tx))}" target="_blank" rel="noopener" title="the Sui transaction in which Pyth's contract verified this price">price tx ${esc(short(pr.tx))} ↗</a>` : ''}
      <span class="badge mono" title="Pyth feed id">feed ${esc(short(pr.feed_id))}</span>
    </div>

    <div class="section-title" style="margin:22px 0 10px">voices on this outcome</div>
    ${h.voicesHTML(r)}

    <div class="section-title" style="margin:22px 0 10px">memory · walrus mainnet</div>
    ${h.memoryBlockHTML(r.memory, h.chosen)}

    <div class="section-title" style="margin:22px 0 10px">risk guardian</div>
    <div>${flags.map(f => `<div class="row" style="gap:9px;margin-bottom:10px;align-items:flex-start">
      <span class="sdot ${f.bad ? 'dead' : 'active'}" style="margin-top:5px;flex:0 0 auto"></span>
      <span style="font-size:13.5px;line-height:1.45;color:${f.bad ? 'var(--coral)' : 'var(--ink-2)'}">${f.cls === 'memory' ? '<b>Memory:</b> ' + esc(f.t.replace(/^Memory:\s*/, '')) : esc(f.t)}</span></div>`).join('')}
      <div class="muted mono" style="font-size:11px;margin-top:6px">${flags.length} risk classes surfaced</div></div>

    <div style="margin-top:22px">${h.commitControl}</div>
    <div id="deploy-out" style="margin-top:14px"></div>`;
}

export function renderAssetCompiled(el, r, h) {
  const pay = el.querySelector('#payoff');
  if (pay) pay.innerHTML = `<div class="muted" style="padding:28px 4px;line-height:1.55">No payout curve: ${esc(r.asset)} has no DeepBook Predict market. This call is scored right or wrong against Pyth at expiry, and calibrated in memory like any other.</div>`;
  const box = el.querySelector('#compiled');
  if (box) box.innerHTML = assetCompiledHTML(r, h);
}

export function assetErrorHTML(e, asset) {
  return `<div class="empty" style="padding:36px 16px"><h3 style="font-size:1.3rem">Can't compile this ${esc(asset)} call yet</h3>
    <p>${esc(e?.message || 'error')}</p><button class="btn-soft" id="retry" data-cursor>Retry compile</button></div>`;
}

/** P5: settled record per asset. Market Brier is "n/a" where no Predict market priced the calls (ETH, SUI). */
export function perAssetHTML(assets) {
  if (!Array.isArray(assets) || !assets.some(a => a.asset !== 'BTC')) return '';
  return `<div class="panel reveal" style="margin-bottom:18px"><div class="section-title">by asset</div>
    <table class="table"><thead><tr><th>asset</th><th>settled</th><th>won</th><th>remembered</th><th>Brier you</th><th>Brier market</th><th>Brier HELIX</th></tr></thead><tbody>${assets.map(a => `<tr>
      <td><b>${esc(a.asset)}</b></td><td class="mono">${a.n}</td><td class="mono">${a.wins}</td><td class="mono">${pct(a.posterior)}</td>
      <td class="mono">${b2(a.brier?.you)}</td><td class="mono">${a.brier?.market == null ? '<span class="muted">n/a</span>' : b2(a.brier.market)}</td><td class="mono">${a.brier?.helix == null ? '<span class="muted">n/a</span>' : b2(a.brier.helix)}</td></tr>`).join('')}</tbody></table>
    <div class="muted" style="font-size:12.5px;margin-top:8px">ETH and SUI calls are commit-mode and scored against Pyth at expiry; there is no Predict market for them, so no market score. Small n is noisy.</div></div>`;
}
