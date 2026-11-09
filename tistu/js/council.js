/* ============================================================
   HELIX — The Council (NEXT_BIG.md §2)
   Four rule-based forecasting agents, each with its own key, gas and Walrus Memory. Memory decides
   how much each one is trusted. Every number here comes from GET /council — calls, records,
   weights and history are computed from chain events and recalled memory. No placeholders.
   ============================================================ */
import { api } from './sui.js';
import { walruscanBlobUrl } from './share.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (p) => (p == null || !Number.isFinite(p) ? '—' : (p * 100).toFixed(1) + '%');
const b3 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(3));
const shortA = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const NAME = { momentum: 'Momentum', reversion: 'Reversion', surface: 'Surface', crowd: 'Crowd' };
const COLOR = { momentum: 'var(--accent)', reversion: 'var(--coral)', surface: 'var(--alive)', crowd: 'var(--ink-2)' };

function countdown(ms) {
  if (ms == null) return '—';
  const s = Math.round((ms - Date.now()) / 1000);
  if (s <= 0) return 'settling…';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Weights over time from COUNCIL memories (one snapshot per settled window). */
export function weightsChartSVG(history, agents) {
  const W = 640, H = 220, L = 40, R = 12, T = 14, B = 28;
  if (!history?.length) return '';
  const xs = history.map(h => h.ts), x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
  const X = (t) => L + (W - L - R) * (history.length === 1 ? 0.5 : (t - x0) / (x1 - x0));
  const Y = (w) => T + (H - T - B) * (1 - Math.min(1, w / 0.6));
  const grid = [0, 0.15, 0.3, 0.45, 0.6].map(w => `<line x1="${L}" x2="${W - R}" y1="${Y(w)}" y2="${Y(w)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(w) + 4}" text-anchor="end" font-size="10" fill="var(--ink-3)" font-family="var(--mono)">${Math.round(w * 100)}%</text>`).join('');
  const lines = agents.map(a => {
    const pts = history.filter(h => h.weights?.[a] != null).map(h => `${X(h.ts).toFixed(1)},${Y(h.weights[a]).toFixed(1)}`);
    if (!pts.length) return '';
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${COLOR[a]}" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<circle cx="${pts.at(-1).split(',')[0]}" cy="${pts.at(-1).split(',')[1]}" r="3.5" fill="${COLOR[a]}"/>`;
  }).join('');
  const t = (ms) => new Date(ms * 1000).toISOString().slice(11, 16) + ' UTC';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Council weights over time">${grid}${lines}
    <text x="${L}" y="${H - 8}" font-size="10" fill="var(--ink-3)" font-family="var(--mono)">${t(x0)}</text>
    <text x="${W - R}" y="${H - 8}" text-anchor="end" font-size="10" fill="var(--ink-3)" font-family="var(--mono)">${t(x1)}</text></svg>`;
}

function agentCard(a, explorer) {
  const call = a.call?.abstain ? null : a.call;
  const rec = a.record;
  const up = call?.side === 'up';
  const bar = call ? `<div style="height:8px;border-radius:6px;background:var(--bg-2);overflow:hidden;margin-top:8px"><div style="height:100%;width:${(call.p_up * 100).toFixed(1)}%;background:${up ? 'var(--alive)' : 'var(--coral)'}"></div></div>` : '';
  return `<div class="panel" style="display:flex;flex-direction:column;gap:10px">
    <div class="row spread"><b style="font-size:1.15rem;color:${COLOR[a.name]}">${NAME[a.name] ?? esc(a.name)}</b>
      <span class="badge" title="share of the Council vote, from memory">weight ${a.weight == null ? '—' : Math.round(a.weight * 100) + '%'}</span></div>
    <div class="muted" style="font-size:12.5px;line-height:1.5">${esc(a.blurb)}</div>
    <div><div class="row spread"><span class="mono" style="font-size:12px">${call ? `now: <b style="color:${up ? 'var(--alive)' : 'var(--coral)'}">${up ? 'UP' : 'DOWN'}</b> · P(up) ${pct(call.p_up)}` : '<span class="muted">abstaining — no signal right now</span>'}</span></div>${bar}
      ${call ? `<div class="muted mono" style="font-size:10.5px;margin-top:6px;line-height:1.45">${esc(call.reason)}</div>` : ''}</div>
    <div class="row" style="gap:14px;flex-wrap:wrap;font-size:12.5px">
      <span><span class="muted">settled</span> <b class="mono">${rec?.n ?? 0}</b></span>
      <span><span class="muted">won</span> <b class="mono">${rec?.wins ?? 0}</b></span>
      <span><span class="muted">Brier</span> <b class="mono">${rec?.n ? b3(rec.brier) : '—'}</b></span>
      <span><span class="muted">commits</span> <b class="mono">${a.commits ?? 0}</b></span></div>
    <div class="row spread" style="font-size:11.5px;flex-wrap:wrap;gap:8px">
      ${a.last_commit ? `<a class="mono" style="color:var(--accent-deep)" href="${explorer(a.last_commit.digest)}" target="_blank" rel="noopener">last commit ↗</a>
        <span class="mono muted" data-countdown="${a.last_commit.expiry_ms}">${countdown(a.last_commit.expiry_ms)}</span>` : '<span class="muted">no commits yet</span>'}
      <a style="color:var(--accent-deep)" href="#/memory/${a.address}">memory →</a></div>
    <div class="mono muted" style="font-size:10px">${shortA(a.address)} · ${esc(a.namespace)}</div></div>`;
}

export function viewCouncil({ $, explorer }) {
  const el = document.createElement('div'); el.className = 'view view-enter';
  el.innerHTML = `<div id="council"><div class="muted"><span class="sdot pending"></span> asking the Council…</div></div>`;
  let timer = null;
  const load = async () => {
    const host = $('#council', el);
    try {
      const c = await api('/council');
      if (!c.enabled && !c.agents?.length) {
        host.innerHTML = `<div class="empty"><h3>The Council is not running</h3><p>Its agents run inside the HELIX compiler (FEATURE_COUNCIL). Nothing to show — and nothing invented.</p></div>`;
        return;
      }
      const names = c.agents.map(a => a.name);
      const sb = c.scoreboard;
      const edge = c.edge;
      host.innerHTML = `
        <div class="panel reveal" style="margin-bottom:18px">
          <div class="row spread" style="flex-wrap:wrap;gap:12px">
            <div><div style="font-family:var(--serif);font-size:1.9rem;letter-spacing:-.02em">Four agents. Memory decides who to trust.</div>
              <div class="muted" style="margin-top:6px;max-width:720px;line-height:1.55">Each agent commits a call on the same 15-minute BTC window — "above the window's open?" — with its own key, its own gas and its own Walrus Memory. ${esc(c.rule)}.</div></div>
            <div style="text-align:right;min-width:220px">
              <div class="muted mono" style="font-size:11px">council P(up) · market P(up)</div>
              <div class="mono" style="font-size:1.6rem">${pct(c.council_p_up)} <span class="muted" style="font-size:1rem">vs ${pct(c.market_p_up)}</span></div>
              <div class="mono" style="font-size:12px;color:${edge == null ? 'var(--ink-3)' : edge >= 0 ? 'var(--alive)' : 'var(--coral)'}">edge ${edge == null ? '—' : (edge >= 0 ? '+' : '') + (edge * 100).toFixed(1) + ' pts'}</div>
              ${c.window ? `<div class="muted mono" style="font-size:11px;margin-top:4px">window settles in <span data-countdown="${c.window.expiryMs}">${countdown(c.window.expiryMs)}</span></div>` : '<div class="muted mono" style="font-size:11px;margin-top:4px">no open window right now</div>'}
            </div></div></div>
        <div class="grid-2 reveal" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">${c.agents.map(a => agentCard(a, explorer)).join('')}</div>
        <div class="grid-2 reveal d1" style="margin-top:18px;align-items:start;gap:18px">
          <div class="panel"><div class="row spread"><div class="section-title" style="margin:0">weights over time · from memory</div>
            <span class="badge" style="color:${c.weights_equal ? 'var(--ink-3)' : 'var(--alive)'}">${c.weights_equal ? 'still equal (n < 5)' : 'learning'}</span></div>
            ${c.history?.length ? weightsChartSVG(c.history, names) + `<div class="row" style="gap:12px;flex-wrap:wrap;margin-top:6px">${names.map(n => `<span class="mono" style="font-size:11px;color:${COLOR[n]}">● ${NAME[n]}</span>`).join('')}</div>
              <div class="muted mono" style="font-size:10.5px;margin-top:6px">${c.history.length} COUNCIL memor${c.history.length === 1 ? 'y' : 'ies'} on Walrus · latest <a style="color:var(--accent-deep)" href="${walruscanBlobUrl(c.history.at(-1).blob_id)}" target="_blank" rel="noopener">blob ↗</a></div>`
              : '<div class="muted" style="margin-top:12px">No settled Council windows yet — the chart appears after the agents\' first calls settle.</div>'}</div>
          <div class="panel"><div class="section-title" style="margin:0 0 10px">Council vs you vs market</div>
            ${sb && sb.n ? `<div class="muted" style="font-size:12.5px;margin-bottom:10px">Brier on the <b>same ${sb.n} settled window${sb.n === 1 ? '' : 's'}</b> where the Council voice was live when ${shortA(sb.address)} committed — lower is better.</div>
              ${['council', 'market', 'you'].map(k => `<div class="row spread" style="padding:9px 0;border-bottom:1px solid var(--line)"><span>${k === 'you' ? 'You' : k === 'market' ? 'Predict market' : 'The Council'}</span><span class="mono">${b3(sb.brier?.[k])}</span></div>`).join('')}`
              : '<div class="muted">No shared settled windows yet: the scoreboard only compares the three voices on windows where all three made a call.</div>'}</div></div>
        ${c.allocator ? `<div class="panel reveal d2" style="margin-top:18px"><div class="row spread"><div class="section-title" style="margin:0">allocator · memory buys memory</div><a class="badge" href="#/api" style="color:var(--accent-deep)">paid API →</a></div>
          <div class="muted" style="font-size:12.5px;margin:6px 0 10px;line-height:1.5">The Council's allocator is an agent with its own key. It <b>pays</b> (HTTP 402 → USDC/SUI on Sui → retry) to read a human forecaster's detailed record, then decides: ${esc(c.allocator.rule)}.</div>
          ${c.allocator.vetting?.length ? c.allocator.vetting.slice(0, 5).map(v => `<div class="row spread" style="padding:8px 0;border-bottom:1px solid var(--line);gap:10px;flex-wrap:wrap">
            <span><b style="color:${v.decision === 'admit' ? 'var(--alive)' : 'var(--coral)'}">${esc((v.decision || '').toUpperCase())}</b> <span class="mono muted">${esc(v.candidate)}</span> — ${esc(v.reason)}</span>
            <span class="mono" style="font-size:11px">${v.payment ? `<a style="color:var(--accent-deep)" href="${explorer(v.payment)}" target="_blank" rel="noopener">payment ↗</a>` : ''}${v.blob_id ? ` · <a style="color:var(--accent-deep)" href="${walruscanBlobUrl(v.blob_id)}" target="_blank" rel="noopener">memory ↗</a>` : ''}</span></div>`).join('')
            : '<div class="muted">No vetting yet — the allocator runs every few hours.</div>'}</div>` : ''}
        ${c.last_error ? `<div class="muted mono" style="font-size:11px;margin-top:12px">last runner note: ${esc(c.last_error)}</div>` : ''}`;
    } catch (e) {
      host.innerHTML = `<div class="empty"><h3>Couldn't reach the Council</h3><p class="mono">${esc(e.message)}</p></div>`;
    }
  };
  load();
  timer = setInterval(() => {
    if (!el.isConnected) { clearInterval(timer); return; }
    el.querySelectorAll('[data-countdown]').forEach(n => { n.textContent = countdown(Number(n.dataset.countdown)); });
  }, 1000);
  const refresh = setInterval(() => { if (!el.isConnected) { clearInterval(refresh); return; } load(); }, 60_000);
  return { el };
}
