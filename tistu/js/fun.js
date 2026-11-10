/* ============================================================
   HELIX — the fun layer (NEXT_BIG.md §5). Every number is computed from chain or memory, n shown;
   anything not yet measurable is hidden rather than drawn.
     F1 live proof ticker · F3 humility meter · F4 Beat the Market
   ============================================================ */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function ago(ms, now = Date.now()) {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/** F1 — "N commits · M settled · last settled 3 min ago · hidden 0" */
export function tickerText(t, now = Date.now()) {
  if (!t || t.commits == null) return '';
  // chain audit (server re-fetches every commit through Tatum): shown only once an audit has completed
  const a = t.audit && t.audit.audited ? ` · audited ${t.audit.ok}/${t.audit.audited}${t.audit.ok === t.audit.audited ? ' ✓' : ' ✗'}` : '';
  return `${t.commits} commits on Sui · ${t.settled} settled · last settled ${ago(t.last_settled_ms, now)} · hidden ${t.hidden}${a}`;
}

/** F3 — a plain-words roast from the real gap (positive = more sure than right). */
export function roast(gapPts) {
  if (gapPts >= 25) return `You're ${gapPts} points sure-er than you are right.`;
  if (gapPts >= 10) return `A little hot: ${gapPts} points more confident than your record.`;
  if (gapPts > -10) return `Calibrated: within ${Math.abs(gapPts)} points of your record.`;
  return `Too humble: you win ${-gapPts} points more often than you claim.`;
}

/** F3 — semicircle gauge of the over-confidence gap (stated confidence − posterior win rate). Hidden when n < 3. */
export function humilityMeterHTML(overall) {
  if (!overall || overall.n < 3 || overall.gap_you == null) return '';
  const gap = Math.round(overall.gap_you * 100);
  const clamped = Math.max(-50, Math.min(50, gap));
  const ang = Math.PI * (1 - (clamped + 50) / 100);              // −50 → left, +50 → right
  const cx = 110, cy = 100, r = 80;
  const nx = cx + (r - 12) * Math.cos(ang), ny = cy - (r - 12) * Math.sin(ang);
  const color = Math.abs(gap) < 10 ? 'var(--alive)' : gap > 0 ? 'var(--coral)' : 'var(--accent)';
  return `<div class="panel"><div class="row spread"><div class="section-title" style="margin:0">humility meter</div><span class="badge">n = ${overall.n}</span></div>
    <div class="row" style="gap:18px;align-items:center;flex-wrap:wrap;margin-top:8px">
      <svg viewBox="0 0 220 118" style="width:220px;max-width:100%" role="img" aria-label="over-confidence gap ${gap} points">
        <path d="M30 100 A80 80 0 0 1 190 100" fill="none" stroke="var(--bg-2)" stroke-width="14" stroke-linecap="round"/>
        <path d="M30 100 A80 80 0 0 1 110 20" fill="none" stroke="color-mix(in srgb,var(--accent) 45%,transparent)" stroke-width="14" stroke-linecap="round"/>
        <path d="M110 20 A80 80 0 0 1 190 100" fill="none" stroke="color-mix(in srgb,var(--coral) 45%,transparent)" stroke-width="14" stroke-linecap="round"/>
        <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="5" fill="var(--ink)"/>
        <text x="26" y="116" font-size="9" fill="var(--ink-3)" font-family="var(--mono)">humble</text>
        <text x="194" y="116" font-size="9" fill="var(--ink-3)" font-family="var(--mono)" text-anchor="end">hot</text>
      </svg>
      <div style="flex:1;min-width:200px"><div class="mono" style="font-size:2rem;color:${color}">${gap >= 0 ? '+' : ''}${gap} pts</div>
        <div style="font-size:14px;line-height:1.5;margin-top:4px">${esc(roast(gap))}</div>
        <div class="muted mono" style="font-size:10.5px;margin-top:6px">stated confidence ${Math.round((overall.mean_p_you ?? 0) * 100)}% · posterior win rate ${Math.round(overall.posterior * 100)}% (Beta(2,2) prior)</div></div></div></div>`;
}

/** F4 — today's scoreboard on shared windows. */
export function beatTheMarketHTML(today) {
  if (!today) return '';
  const name = { you: 'You', market: 'Market', council: 'Council' };
  const keys = Object.keys(today.score);
  const line = keys.map(k => `${name[k]} <b class="mono" style="font-size:1.3rem">${today.score[k]}</b>`).join(' <span class="muted">–</span> ');
  return `<div class="panel"><div class="row spread"><div class="section-title" style="margin:0">beat the market · today (UTC)</div><span class="badge">${today.n} settled</span></div>
    ${today.n ? `<div style="margin-top:10px;font-size:15px">${line}</div>
      <div class="muted" style="font-size:12px;margin-top:6px;line-height:1.5">Each of today's settled calls goes to the voice that put the most probability on what happened${keys.includes('council') ? ' — the Council only on windows where it was live' : ''}.</div>`
      : '<div class="muted" style="margin-top:8px">Nothing has settled today yet.</div>'}</div>`;
}
