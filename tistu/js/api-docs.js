/* ============================================================
   HELIX — Credibility API docs (P3). Live numbers from GET /api/v1; nothing hard-coded.
   ============================================================ */
import { api, apiBase } from './sui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SUISCAN = (d) => `https://suiscan.xyz/testnet/tx/${d}`;

export function apiDocsHTML(p, base) {
  const ex = `${base}/api/v1/credibility/helix-v1-4d922636976d?bucket=up/high/choppy`;
  return `
    <div class="panel reveal" style="margin-bottom:18px">
      <div style="font-family:var(--serif);font-size:1.9rem;letter-spacing:-.02em">Credibility API — agents pay agents</div>
      <div class="muted" style="margin-top:8px;line-height:1.6;max-width:780px">A forecaster's record is worth something once it can't be faked. The summary is free; the per-setup detail costs
        <b class="mono">${esc(p.price)} ${esc(p.currency)}</b> per call, paid on Sui with the <a href="https://mpp.dev" target="_blank" rel="noopener" style="color:var(--accent-deep)">Machine Payments Protocol</a> — no account, no API key.
        ${p.enabled ? '' : ' <b style="color:var(--coral)">(paid tier currently off)</b>'}</div>
      <div class="row" style="gap:12px;flex-wrap:wrap;margin-top:14px">
        <span class="badge" style="font-size:13px;padding:8px 14px;color:var(--alive)">paid calls so far: ${p.paid_calls}</span>
        <span class="badge mono">treasury ${esc(String(p.recipient).slice(0, 10))}…</span><span class="badge mono">${esc(p.package)}</span></div></div>
    <div class="grid-2 reveal d1" style="align-items:start;gap:18px">
      <div class="panel"><div class="section-title" style="margin:0 0 10px">endpoints</div>
        <div class="row spread" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="mono" style="font-size:12px">GET /passport/:id</span><span class="badge">free</span></div>
        <div class="row spread" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="mono" style="font-size:12px">GET /api/v1/credibility/:id?bucket=</span><span class="badge" style="color:var(--accent-deep)">${esc(p.price)} ${esc(p.currency)}</span></div>
        <div class="muted" style="font-size:12.5px;margin-top:10px;line-height:1.55">Verification: ${esc(p.verification)}.</div>
        <div class="section-title" style="margin:16px 0 8px">try the 402</div>
        <pre class="mono" style="font-size:11px;white-space:pre-wrap;background:var(--bg-2);padding:10px;border-radius:8px">curl -i "${esc(ex)}"\n# → HTTP/1.1 402 Payment Required\n# → WWW-Authenticate: Payment id="…", method="sui", intent="charge", request="…"</pre></div>
      <div class="panel"><div class="section-title" style="margin:0 0 10px">pay from an agent (JS)</div>
        <pre class="mono" style="font-size:11px;white-space:pre-wrap;background:var(--bg-2);padding:10px;border-radius:8px">import { Mppx } from 'mppx/client';
import { sui } from '@suimpp/mpp/client';

const mppx = Mppx.create({ methods: [sui({ client, signer, currency })] });
const res = await mppx.fetch('${esc(ex)}');
// 402 → pays on Sui → signs the proof → retries → 200 + Payment-Receipt</pre>
        <div class="muted" style="font-size:12px;margin-top:8px">Full script: <span class="mono">tee/scripts/pay-credibility.mjs</span></div>
        <div class="section-title" style="margin:16px 0 8px">recent paid calls</div>
        ${(p.recent || []).length ? p.recent.map(r => `<div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--line);font-size:12px"><span class="mono">${esc(String(r.payer).slice(0, 10))}…</span><a class="mono" style="color:var(--accent-deep)" href="${SUISCAN(r.digest)}" target="_blank" rel="noopener">${esc(String(r.digest).slice(0, 10))}… ↗</a></div>`).join('') : '<div class="muted">None yet.</div>'}</div></div>`;
}

export function viewApiDocs({ $ }) {
  const el = document.createElement('div'); el.className = 'view view-enter';
  el.innerHTML = '<div id="apidocs"><div class="muted"><span class="sdot pending"></span> loading pricing…</div></div>';
  api('/api/v1').then(p => { $('#apidocs', el).innerHTML = apiDocsHTML(p, apiBase()); })
    .catch(e => { $('#apidocs', el).innerHTML = `<div class="empty"><h3>API unavailable</h3><p class="mono">${esc(e.message)}</p></div>`; });
  return { el };
}
