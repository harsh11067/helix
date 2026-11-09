/* ============================================================
   HELIX — Memory UI (Total Recall)
   Everything here renders data recalled from Walrus Memory (mainnet) through the
   HELIX compiler. Empty states are honest: no placeholder numbers, ever.
   ============================================================ */
import { api, apiBase } from './sui.js';
import { walruscanBlobUrl, shareCardSVG, xIntentUrl } from './share.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (p) => (p == null || !Number.isFinite(p) ? '—' : Math.round(p * 100) + '%');
const b2 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2));
const shortB = (b) => b ? b.slice(0, 8) + '…' + b.slice(-4) : '';
const shortA = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const signed = (x) => (x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2));
const VOICE = { you: 'You', market: 'Predict market', helix: 'HELIX model', crowd: 'Polymarket crowd', council: 'The Council' };
const TYPE_COLOR = { CONVICTION: 'var(--accent)', OUTCOME: 'var(--alive)', CALIBRATION: 'var(--ink-2)', LESSON: 'var(--coral)', REASON: 'var(--ink-3)', VETTING: 'var(--ink-3)' };

/* ---------------- Canvas: the four voices + memory block ---------------- */
export function voicesHTML(r) {
  const v = r.voices || {}, mv = r.memory?.voices || {};
  const crowd = v.crowd_detail || {};
  const cell = (k, p, note) => `<div class="stat" style="padding:12px 14px">
      <div class="k">${VOICE[k]}</div>
      <div class="v" style="font-size:1.25rem">${p == null ? '<span class="muted" style="font-size:.85rem">' + esc(note || '—') + '</span>' : pct(p)}</div>
      <div class="muted mono" style="font-size:10.5px;margin-top:4px">${mv[k]?.brier != null ? 'Brier ' + b2(mv[k].brier) + ' (lower = better)' : (k === 'helix' ? 'regime heuristic' : k === 'market' ? 'SVI-implied' : k === 'you' ? 'your confidence' : 'not scored yet')}</div>
    </div>`;
  const crowdNote = crowd.status === 'ok' ? null : crowd.status === 'not_comparable' ? 'not compared' : crowd.status === 'disabled' ? 'off' : 'unavailable';
  const cd = v.council_detail || {};
  const councilNote = cd.status === 'off' ? 'off' : 'no live call';
  return `<div class="grid-4" style="gap:10px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
      ${cell('you', v.you)}${cell('market', v.market)}${cell('helix', v.helix)}${cell('crowd', v.crowd, crowdNote)}${cell('council', v.council, councilNote)}
    </div>
    ${cd.status === 'live' ? `<div class="muted mono" style="font-size:10.5px;margin-top:6px">council: ${(cd.calls || []).length} agent call${(cd.calls || []).length === 1 ? '' : 's'}, memory-weighted · P(up) ${pct(cd.p_up)} · edge over the market ${cd.edge >= 0 ? '+' : ''}${(cd.edge * 100).toFixed(1)} pts · <a href="#/council" style="color:var(--accent-deep)">the Council →</a></div>` : ''}
    ${crowd.status && crowd.status !== 'ok' && crowd.reason ? `<div class="muted mono" style="font-size:10.5px;margin-top:6px">crowd: ${esc(crowd.reason)}${crowd.url ? ` · <a href="${esc(crowd.url)}" target="_blank" rel="noopener" style="color:var(--accent-deep)">market ↗</a>` : ''}</div>` : ''}
    ${crowd.status === 'ok' ? `<div class="muted mono" style="font-size:10.5px;margin-top:6px">crowd: <a href="${esc(crowd.url)}" target="_blank" rel="noopener" style="color:var(--accent-deep)">${esc(crowd.title)} ↗</a> (Polymarket resolves on a Chainlink TWAP; Predict on Pyth at expiry)</div>` : ''}`;
}

export function memoryBlockHTML(mem, chosen) {
  if (!mem) return '';
  if (mem.status === 'no_address') return `<div class="muted">${esc(mem.message)}</div>`;
  if (mem.status === 'unavailable') return `<div class="muted" style="color:var(--coral)">${esc(mem.message)}</div>`;
  const chip = mem.n > 0
    ? `<span class="badge" style="color:var(--alive);border-color:color-mix(in srgb,var(--alive) 40%,transparent);background:var(--alive-soft)">learned from ${mem.n} settled conviction${mem.n > 1 ? 's' : ''}</span>`
    : `<span class="badge">no settled history yet</span>`;
  const commitChanged = mem.n >= 3 && Math.abs(mem.suggested_commit - mem.commit) >= 0.01;
  const usingSugg = chosen?.commit != null && Math.abs(chosen.commit - mem.suggested_commit) < 0.005 && commitChanged;
  const ss = mem.structure_suggestion;
  return `<div class="row spread" style="gap:8px;flex-wrap:wrap"><span class="muted mono" style="font-size:11px">bucket ${esc(mem.bucket)}</span>${chip}</div>
    <div style="margin-top:10px;line-height:1.55">${esc(mem.message)}</div>
    ${commitChanged ? `<div class="panel" style="margin-top:12px;padding:14px 16px">
        <div class="row spread" style="gap:10px;flex-wrap:wrap">
          <div>you set <b class="mono">${mem.commit}</b> dUSDC · memory suggests <b class="mono" style="color:var(--accent-deep)">${mem.suggested_commit}</b></div>
          <button class="btn-soft" id="mem-accept-commit" data-cursor>${usingSugg ? 'Using memory ✓ (undo)' : 'Use ' + mem.suggested_commit}</button>
        </div>
        <div class="muted mono" style="font-size:10.5px;margin-top:6px">¼-Kelly at your remembered win rate ${pct(mem.posterior)} vs your stated ${pct(mem.voices?.you?.p)} — HELIX never changes your size unless you click</div></div>` : ''}
    ${ss ? `<div class="panel" style="margin-top:12px;padding:14px 16px">
        <div class="row spread" style="gap:10px;flex-wrap:wrap">
          <div style="line-height:1.5">memory prefers <b>${ss.kind === 'directional' ? 'a directional bet' : 'a range'}</b> here: ${esc(ss.order.label)}</div>
          <button class="btn-soft" id="mem-accept-struct" data-cursor>${chosen?.useMemoryStructure ? 'Using memory ✓ (undo)' : 'Use it'}</button>
        </div>
        <div class="muted" style="font-size:12.5px;margin-top:6px">${esc(ss.reason)}</div></div>` : ''}
    ${mem.lesson_text ? `<div class="row" style="gap:9px;margin-top:12px;align-items:flex-start"><span class="sdot pending" style="margin-top:5px;flex:0 0 auto"></span><span style="font-size:13.5px;line-height:1.5">${esc(mem.lesson_text)}</span></div>` : ''}
    ${mem.blob_ids?.length ? `<div class="muted mono" style="font-size:10.5px;margin-top:10px">recalled from Walrus Memory (mainnet): ${mem.blob_ids.slice(0, 6).map(shortB).join(' · ')}${mem.blob_ids.length > 6 ? ' …' : ''}</div>` : ''}`;
}

/* ---------------- charts (inline SVG, design tokens) ---------------- */
function reliabilitySVG(bins) {
  const W = 300, H = 230, P = 34;
  const X = (p) => P + ((p - 0.5) / 0.5) * (W - P - 12);
  const Y = (p) => H - P - p * (H - P - 12);
  const pts = bins.filter(b => b.n > 0);
  let grid = '';
  for (const v of [0, 0.25, 0.5, 0.75, 1]) grid += `<line x1="${P}" x2="${W - 12}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${P - 6}" y="${Y(v) + 3}" font-size="9.5" text-anchor="end" fill="var(--ink-3)" font-family="var(--mono)">${Math.round(v * 100)}</text>`;
  for (const v of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) grid += `<text x="${X(v)}" y="${H - P + 14}" font-size="9.5" text-anchor="middle" fill="var(--ink-3)" font-family="var(--mono)">${Math.round(v * 100)}</text>`;
  const diag = `<line x1="${X(0.5)}" y1="${Y(0.5)}" x2="${X(1)}" y2="${Y(1)}" stroke="var(--ink-3)" stroke-dasharray="4 5"/>`;
  const dots = pts.map(b => `<circle cx="${X(b.stated)}" cy="${Y(b.realized)}" r="${Math.min(14, 4 + b.n * 1.6)}" fill="var(--accent-soft)" stroke="var(--accent-bright)" stroke-width="2"><title>stated ${pct(b.stated)} · realized ${pct(b.realized)} · n=${b.n}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:360px">${grid}${diag}${dots}
    <text x="${(W + P) / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="var(--ink-2)" font-family="var(--mono)">stated confidence %</text>
    <text x="10" y="${H / 2}" font-size="10" text-anchor="middle" fill="var(--ink-2)" font-family="var(--mono)" transform="rotate(-90 10 ${H / 2})">won %</text></svg>`;
}

/** Commit vs On-chain: a paper conviction hashed on Sui (journal::commit) or a real Predict order. */
export function modeBadge(r) {
  if (r.type !== 'CONVICTION' && r.type !== 'OUTCOME') return '';
  const commit = (r.fields || {}).mode === 'commit';
  return `<div style="margin-top:6px"><span class="badge" style="font-size:10px;${commit ? '' : 'color:var(--alive);border-color:color-mix(in srgb,var(--alive) 40%,transparent)'}" title="${commit ? 'Paper conviction: sha256 committed on Sui before settlement (helix::journal)' : 'Real DeepBook Predict order'}">${commit ? 'Commit' : 'On-chain'}</span></div>`;
}
/** J-07: every on-chain commit by this address is matched to its memory; hidden commits show up here. */
export function commitLedgerBadge(c) {
  if (!c || c.error || !c.onchain) return '';
  const bad = c.missing_memory > 0;
  return `<span class="badge" style="color:${bad ? 'var(--coral)' : 'var(--alive)'}" title="ConvictionCommitted events on Sui (via Tatum) matched to Walrus memories by hash">${c.onchain} committed on-chain · ${c.with_memory} remembered${bad ? ` · ${c.missing_memory} missing_memory` : ''}</span>`;
}
function dividendSVG(rows) {
  const W = 520, H = 200, P = 30;
  let a = 0, m = 0; const A = [0], M = [0];
  rows.forEach(r => { a += r.actual_pnl; m += r.memory_pnl; A.push(a); M.push(m); });
  const lo = Math.min(...A, ...M, 0), hi = Math.max(...A, ...M, 0), span = (hi - lo) || 1;
  const X = (i) => P + (i / Math.max(1, A.length - 1)) * (W - P - 10);
  const Y = (v) => 10 + (1 - (v - lo) / span) * (H - P - 10);
  const line = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">
    <line x1="${P}" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line-2)" stroke-dasharray="3 5"/>
    <path d="${line(A)}" fill="none" stroke="var(--ink-3)" stroke-width="2.2"/>
    <path d="${line(M)}" fill="none" stroke="var(--accent-bright)" stroke-width="2.4"/>
    <text x="${P}" y="${H - 6}" font-size="10" fill="var(--ink-3)" font-family="var(--mono)">settled convictions while memory had n≥3 →</text></svg>`;
}

/* ---------------- the Memory page ---------------- */
export function viewMemory(ctx) {
  const { state, $, connectPrompt, explorer } = ctx;
  const addr = ctx.address ?? state.account?.address ?? null;
  const el = document.createElement('div'); el.className = 'view view-enter';
  if (!addr) { el.innerHTML = connectPrompt('Your trading memory', 'Connect a wallet to read your convictions, outcomes and calibration from Walrus Memory (mainnet) — or <a href="app.html?demo=1#/memory" style="color:var(--accent-deep)">view the demo trader</a>.'); return { el }; }
  el.innerHTML = `<div id="mem"><div class="muted"><span class="sdot pending"></span> recalling your memory from Walrus (mainnet)…</div></div>`;
  (async () => {
    const host = $('#mem', el);
    try {
      const [t, div, board] = await Promise.all([
        api(`/memory/${addr}`), api(`/memory/${addr}/dividend`).catch(() => null), api('/board').catch(() => null),
      ]);
      const o = t.overall || {};
      const tl = (t.timeline || []).slice().reverse();
      const header = `<div class="row spread reveal" style="flex-wrap:wrap;gap:12px;margin-bottom:16px">
          <div><div style="font-family:var(--serif);font-size:1.9rem;letter-spacing:-.02em">${t.count} memor${t.count === 1 ? 'y' : 'ies'} on Walrus</div>
          <div class="muted mono" style="font-size:11.5px">namespace ${esc(t.namespace)} · ${esc(t.memory_network)} · address never stored in the namespace</div></div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><span class="badge">${o.n || 0} settled · ${o.wins || 0} won</span>${commitLedgerBadge(t.commits)}
          <button class="btn-soft" id="share-btn" data-cursor>${ctx.readOnly ? 'Share this record' : 'Share my record'}</button></div></div>
          <div id="share-out"></div>`;
      const banner = ctx.readOnly && ctx.banner ? ctx.banner : '';
      host.addEventListener('click', (e) => {
        if (!e.target.closest('#share-btn')) return;
        const lessons = (t.timeline || []).filter(r => r.type === 'LESSON');
        const anchor = [...(t.timeline || [])].reverse().find(r => r.type === 'CALIBRATION' || r.type === 'LESSON') || (t.timeline || [])[(t.timeline || []).length - 1];
        const rec = { namespace: t.namespace, n: o.n || 0, wins: o.wins || 0, nCrowd: o.n_crowd || 0, brier: o.brier || {},
          lesson: lessons.length ? lessons[lessons.length - 1].fields?.text : null, blobId: anchor?.blob_id, date: new Date().toISOString().slice(0, 10) };
        const svg = shareCardSVG(rec);
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        $('#share-out', host).innerHTML = `<div class="panel" style="margin:0 0 18px">
          <div style="border-radius:12px;overflow:hidden;border:1px solid var(--line)">${svg.replace('width="1200" height="630"', 'width="100%" style="display:block;height:auto"')}</div>
          <div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap">
            <a class="btn-soft" href="${url}" download="helix-record-${esc(t.namespace)}.svg" data-cursor>Download SVG</a>
            <a class="btn-solid" href="${xIntentUrl(rec, location.origin + location.pathname)}" target="_blank" rel="noopener" data-cursor>Post on X</a>
            ${rec.blobId ? `<a class="btn-soft" href="${walruscanBlobUrl(rec.blobId)}" target="_blank" rel="noopener" data-cursor>Blob on Walruscan ↗</a>` : ''}</div>
          <div class="muted mono" style="font-size:10.5px;margin-top:8px">generated in your browser from the recalled memory above · tags @Tatum_io and @WalrusFoundation</div></div>`;
      });
      if (!t.count) {
        host.innerHTML = banner + header + `<div class="empty"><h3>No memories yet</h3><p>Mint a conviction on the Canvas. HELIX writes it to Walrus Memory on mainnet, then records the outcome when the market settles — a few minutes later.</p><a class="btn-solid" href="#/canvas" data-cursor>Open the Canvas</a></div>`;
        return;
      }
      const voices = ['you', 'market', 'helix', 'crowd'].map(k => {
        const b = o.brier?.[k];
        return `<div class="row spread" style="padding:10px 0;border-bottom:1px solid var(--line)">
          <span>${VOICE[k]}</span><span class="mono">${b == null ? '<span class="muted">not scored</span>' : 'Brier ' + b2(b)}${k === 'crowd' && o.n_crowd ? ` <span class="muted">(n=${o.n_crowd})</span>` : ''}</span></div>`;
      }).join('');
      const bestK = ['you', 'market', 'helix', 'crowd'].filter(k => o.brier?.[k] != null && (k !== 'crowd' || o.n_crowd >= 3)).sort((a, b) => o.brier[a] - o.brier[b])[0];
      const rel = (t.reliability || []).some(b => b.n > 0)
        ? reliabilitySVG(t.reliability)
        : `<div class="muted" style="padding:30px 0">The reliability diagram appears once a conviction settles.</div>`;
      const divPanel = div && div.n > 0
        ? `<div class="row spread" style="flex-wrap:wrap;gap:10px"><div><span class="muted">actual</span> <b class="mono">${signed(div.actual_pnl)}</b> · <span class="muted">following memory</span> <b class="mono" style="color:var(--accent-deep)">${signed(div.memory_pnl)}</b> dUSDC</div>
            <span class="badge" style="color:${div.dividend >= 0 ? 'var(--alive)' : 'var(--coral)'}">dividend ${signed(div.dividend)} · n=${div.n}</span></div>
            ${dividendSVG(div.rows)}<div class="muted mono" style="font-size:10.5px">grey = what you did · gold = memory's suggestions · ${esc(div.caveat)}</div>`
        : `<div class="muted">The dividend counts only convictions placed after memory had 3+ settled outcomes in that setup. None yet${div ? '' : ' (service unreachable)'}.</div>`;
      const boardPanel = board && board.ranked?.length
        ? `<table class="table"><thead><tr><th>trader</th><th>n</th><th>Brier</th><th>skill rank</th><th>PnL rank</th></tr></thead><tbody>${board.ranked.map(r => `<tr><td class="mono" style="font-size:11.5px">${esc(r.namespace)}</td><td class="mono">${r.n}</td><td class="mono">${b2(r.brier)}</td><td class="mono gold">#${r.brier_rank}</td><td class="mono">#${r.pnl_rank}</td></tr>`).join('')}</tbody></table>`
        : `<div class="muted">${esc(board?.note || 'Board unavailable.')}</div>`;
      const rows = tl.map(r => {
        const f = r.fields || {};
        const summary = r.type === 'CONVICTION' ? `${esc(f.dir)} · conf ${esc(f.conf)} · ${esc(f.vol)} · ${esc(f.structure)} · commit ${esc(f.commit)} · you ${esc(f.p_you)} / mkt ${esc(f.p_mkt)} / hlx ${esc(f.p_hlx)}${f.p_crowd && f.p_crowd !== 'na' ? ' / crowd ' + esc(f.p_crowd) : ''}${f.origin ? ' · via ' + esc(f.origin) : ''}`
          : r.type === 'OUTCOME' ? `<b style="color:${f.result === 'WIN' ? 'var(--alive)' : 'var(--coral)'}">${esc(f.result)}</b> · ${f.mode === 'commit' ? 'would have paid' : 'payoff'} ${esc(f.payoff)} · settled ${esc(f.settle_px)} vs ${esc(f.strike_px)}${f.reveal_ok === 'true' ? ' · <span style="color:var(--alive)">reveal ✓ hash matches on-chain</span>' : f.reveal_ok === 'false' ? ' · <b style="color:var(--coral)">reveal ✗</b>' : ''}${f.witness_usd && f.witness_usd !== 'na' ? ' · Tatum witness ' + esc(f.witness_usd) : ''}`
          : r.type === 'CALIBRATION' ? `${esc(f.bucket)} · n=${esc(f.n)} · won ${esc(f.wins)} · posterior ${esc(f.posterior)} · Brier you ${esc(f.brier_you)} / mkt ${esc(f.brier_mkt)} / hlx ${esc(f.brier_hlx)}`
          : r.type === 'LESSON' ? esc(f.text)
          : esc(r.text.slice(0, 160));
        const tx = f.tx && f.tx !== 'na' ? `<a class="mono" href="${explorer(f.tx)}" target="_blank" rel="noopener" style="color:var(--accent-deep)">${f.mode === 'commit' ? 'commit tx' : 'tx'} ${shortB(f.tx)} ↗</a>` : '';
        return `<div class="mem-row" style="display:grid;grid-template-columns:110px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)">
          <div><span class="badge" style="color:${TYPE_COLOR[r.type] || 'var(--ink-2)'}">${r.type}</span>${modeBadge(r)}<div class="muted mono" style="font-size:10px;margin-top:6px">${f.ts ? new Date(Number(f.ts) * 1000).toISOString().slice(5, 16).replace('T', ' ') : ''}</div></div>
          <div style="min-width:0"><div style="font-size:13.5px;line-height:1.5;overflow-wrap:anywhere">${summary}</div>
            <div class="row" style="gap:12px;margin-top:6px;flex-wrap:wrap;font-size:11px">${tx}
              <a class="mono" href="${walruscanBlobUrl(r.blob_id)}" target="_blank" rel="noopener" style="color:var(--accent-deep)" title="Walruscan (mainnet)">blob ${shortB(r.blob_id)} ↗</a>
              <button class="mono" data-proof="${esc(r.blob_id)}" style="font-size:11px;color:var(--accent-deep);background:none;border:0;padding:0;cursor:pointer" data-cursor>verify on mainnet ↗</button></div>
            <div class="proof-out" data-for="${esc(r.blob_id)}"></div></div></div>`;
      }).join('');
      host.innerHTML = banner + header + `
        <div class="grid-2 reveal" style="align-items:start;gap:18px">
          <div class="panel"><div class="section-title">who has been right · Brier per voice</div>${voices}
            <div class="muted" style="font-size:12.5px;margin-top:10px;line-height:1.5">${o.n >= 3 && bestK ? `Across ${o.n} settled convictions, <b>${VOICE[bestK]}</b> has been the best-calibrated voice.` : `Scores firm up after 3 settled convictions (n=${o.n || 0}). Lower Brier = better calibrated.`}</div></div>
          <div class="panel"><div class="section-title">reliability · stated vs realized</div><div style="display:grid;place-items:center">${rel}</div>
            <div class="muted mono" style="font-size:10.5px;text-align:center">on the dashed line = perfectly calibrated · above = you were better than you said</div></div>
        </div>
        ${Object.keys(t.reasons || {}).length ? `<div class="panel reveal d1" style="margin-top:18px"><div class="section-title">reasoning memory · opt-in</div>
          <div class="row" style="gap:10px;flex-wrap:wrap">${Object.entries(t.reasons).map(([c, v]) => `<span class="badge">${esc(c)} · won ${v.wins}/${v.n}</span>`).join('')}</div>
          <div class="muted" style="font-size:12.5px;margin-top:8px">Only theses you opted in were analyzed (plaintext to the Walrus Memory relayer). Categories come from a deterministic keyword classifier.</div></div>` : ''}
        <div class="panel reveal d1" style="margin-top:18px"><div class="section-title">memory dividend · did listening pay?</div>${divPanel}</div>
        <div class="panel reveal d1" style="margin-top:18px"><div class="section-title">timeline · every memory with its Walrus blob</div>${rows}</div>
        <div class="panel reveal d2" style="margin-top:18px"><div class="section-title">who to trust · ranked by calibration, not luck</div>${boardPanel}</div>`;
      host.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-proof]'); if (!b) return;
        const out = host.querySelector(`.proof-out[data-for="${CSS.escape(b.dataset.proof)}"]`);
        out.innerHTML = `<div class="muted mono" style="font-size:11px;margin-top:6px"><span class="sdot pending"></span> reading Sui mainnet via Tatum + Walrus mainnet aggregator…</div>`;
        try {
          const p = await api(`/memory/${addr}/proof/${encodeURIComponent(b.dataset.proof)}`);
          out.innerHTML = `<div class="mono" style="font-size:11px;margin-top:6px;line-height:1.6;color:${p.verdict === 'verified' ? 'var(--alive)' : 'var(--coral)'}">
            ${p.verdict === 'verified' ? '✓ verified' : '△ incomplete'} · Walrus mainnet blob ${p.walrus.fetched ? p.walrus.size + ' B (encrypted), sha256 ' + p.walrus.sha256.slice(0, 12) + '…' : 'not fetched'}
            · MemWal account ${shortA(p.memwal_account?.object_id)} lists our delegate key: ${p.memwal_account?.our_delegate_listed ? 'yes' : 'no'}
            · read via ${esc(p.read_via.gateway)} @ checkpoint ${p.read_via.checkpoint}
            · <a href="${apiBase()}/memory/${addr}/proof/${encodeURIComponent(b.dataset.proof)}" target="_blank" rel="noopener" style="color:var(--accent-deep)">raw ↗</a></div>`;
        } catch (err) { out.innerHTML = `<div class="muted" style="color:var(--coral);font-size:11px">proof failed: ${esc(err.message)}</div>`; }
      });
    } catch (e) {
      host.innerHTML = `<div class="empty"><h3>Couldn't recall memory</h3><p class="mono">${esc(e.message)}</p></div>`;
    }
  })();
  return { el };
}
