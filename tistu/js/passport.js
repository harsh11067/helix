/* ============================================================
   HELIX — Forecaster Passport (NEXT_BIG.md §3)
   A public, verifiable record for any forecaster, human or agent. Self-contained (no wallet SDK),
   so the standalone passport.html and embeds stay light.

   Verify needs no trust in HELIX: the browser fetches the commit transaction's on-chain event
   itself (read-only Tatum proxy), re-hashes the remembered conviction with WebCrypto, and compares.
   A text HELIX altered could not match the hash Sui recorded before the market settled.
   ============================================================ */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortA = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const shortB = (b) => b ? b.slice(0, 8) + '…' + b.slice(-4) : '';
const f2 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2));
const SUISCAN = (d) => `https://suiscan.xyz/testnet/tx/${d}`;
const WALRUSCAN = (b) => `https://walruscan.com/mainnet/blob/${encodeURIComponent(b)}`;
const APP = 'https://helix-app-fovn.onrender.com';

/** The committed body: the remembered line without the fields only known after signing. */
export const commitBody = (text) => String(text ?? '').split(' | ').filter(s => !/^(hash|tx|commit_tx)=/.test(s.trim())).join(' | ');
export const b64ToHex = (b64) => [...atob(b64)].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Independent check of one commit: chain hash (fetched here) vs sha256 of the remembered text. */
export async function verifyCommitInBrowser(base, digest, text) {
  const q = { query: 'query($d:String!){ transaction(digest:$d){ sender { address } effects { events { nodes { contents { type { repr } json } } } } } }', variables: { d: digest } };
  const r = await fetch(base + '/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) }).then(x => x.json());
  const ev = (r?.data?.transaction?.effects?.events?.nodes ?? []).find(n => String(n.contents?.type?.repr ?? '').endsWith('::journal::ConvictionCommitted'));
  if (!ev) return { ok: false, reason: 'no ConvictionCommitted event in that transaction' };
  const h = ev.contents.json.hash;
  const chainHex = Array.isArray(h) ? h.map(b => Number(b).toString(16).padStart(2, '0')).join('') : /^[0-9a-f]{64}$/i.test(h) ? h.toLowerCase() : b64ToHex(h);
  const memHex = await sha256Hex(commitBody(text));
  return { ok: chainHex === memHex, chainHex, memHex, owner: r.data.transaction.sender?.address };
}

function countdown(ms) {
  const s = Math.round((ms - Date.now()) / 1000);
  return s <= 0 ? 'settling…' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function commitRow(c) {
  const when = new Date(c.committed_ms).toISOString().slice(5, 16).replace('T', ' ');
  const call = c.call ? `${esc(c.call.dir)} · conf ${esc(c.call.conf)} · ${esc(c.call.structure)}${c.call.origin ? ` <span class="muted">· ${esc(c.call.origin)}</span>` : ''}` : '<span class="muted">—</span>';
  const status = c.status === 'settled' ? `<b style="color:${c.result === 'WIN' ? 'var(--alive)' : 'var(--coral)'}">${esc(c.result)}</b> <span class="mono">${c.payoff == null ? '' : (c.payoff >= 0 ? '+' : '') + c.payoff.toFixed(2)}</span>`
    : c.status === 'pending' ? `<span class="mono muted" data-countdown="${c.expiry_ms}">${countdown(c.expiry_ms)}</span>`
    : c.status === 'recording' ? '<span class="muted">recording…</span>'
    : '<b style="color:var(--coral)">hidden</b>';
  return `<tr>
    <td class="mono" style="font-size:11.5px;white-space:nowrap">${when}</td>
    <td style="font-size:12.5px">${call}</td>
    <td style="font-size:12.5px">${status}</td>
    <td style="font-size:11.5px;white-space:nowrap">
      ${c.digest ? `<a class="mono" style="color:var(--accent-deep)" href="${SUISCAN(c.digest)}" target="_blank" rel="noopener">commit ↗</a>` : ''}
      ${c.conviction_blob ? ` · <a class="mono" style="color:var(--accent-deep)" href="${WALRUSCAN(c.conviction_blob)}" target="_blank" rel="noopener">memory ↗</a>` : ''}
      ${c.outcome_blob ? ` · <a class="mono" style="color:var(--accent-deep)" href="${WALRUSCAN(c.outcome_blob)}" target="_blank" rel="noopener">outcome ↗</a>` : ''}</td>
    <td>${c.text && c.digest ? `<button class="btn-soft" data-verify="${esc(c.digest)}" style="padding:4px 12px;font-size:12px" data-cursor>Verify</button><div class="mono" data-verify-out="${esc(c.digest)}" style="font-size:10.5px;margin-top:4px"></div>` : ''}</td>
  </tr>`;
}

export function passportShareUrls(p, base) {
  const id = p.namespace;
  const link = `${APP}/passport.html?id=${encodeURIComponent(id)}`;
  const text = `My HELIX Forecaster Passport: ${p.n_settled} settled BTC calls, won ${p.wins}${p.n_settled >= 3 && p.brier != null ? `, Brier ${f2(p.brier)}` : ''}. Committed ${p.committed} on Sui${p.hidden == null ? '' : `, hidden ${p.hidden}`}. @Tatum_io @WalrusFoundation`;
  return {
    link, card: `${base}/passport/${encodeURIComponent(id)}/card.svg`, json: `${base}/passport/${encodeURIComponent(id)}.json`,
    x: 'https://x.com/intent/post?' + new URLSearchParams({ text, url: link }).toString(),
    embed: `<iframe src="${APP}/passport.html?id=${encodeURIComponent(id)}&embed=1" width="380" height="164" style="border:0" title="HELIX Forecaster Passport"></iframe>`,
  };
}

/** Compact embeddable badge. */
export function passportEmbedHTML(p) {
  return `<a href="${APP}/passport.html?id=${encodeURIComponent(p.namespace)}" target="_blank" rel="noopener" style="display:block;text-decoration:none;color:inherit">
    <div class="panel" style="padding:14px 16px;max-width:380px">
      <div class="row spread"><b>HELIX Forecaster Passport</b><span class="badge" style="color:${p.hidden === 0 ? 'var(--alive)' : 'var(--coral)'}">hidden ${p.hidden ?? '?'}</span></div>
      <div class="row" style="gap:16px;margin-top:10px;font-size:13px">
        <span><span class="muted">settled</span> <b class="mono">${p.n_settled}</b></span><span><span class="muted">won</span> <b class="mono">${p.wins}</b></span>
        <span><span class="muted">Brier</span> <b class="mono">${p.n_settled ? f2(p.brier) : '—'}</b></span><span><span class="muted">committed</span> <b class="mono">${p.committed}</b></span></div>
      <div class="muted mono" style="font-size:10.5px;margin-top:8px">${esc(p.namespace)} · verifiable on Sui + Walrus</div></div></a>`;
}

export function passportHTML(p, base, signature) {
  const gap = p.gap_you == null ? null : Math.round(p.gap_you * 100);
  const share = passportShareUrls(p, base);
  const stat = (k, v, color) => `<div class="stat"><div class="k">${k}</div><div class="v" style="${color ? 'color:' + color : ''}">${v}</div></div>`;
  const setup = (s, label) => s ? `<div class="row spread" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>${label} <span class="mono muted">${esc(s.bucket)}</span></span><span class="mono">won ${s.wins}/${s.n} · posterior ${(s.posterior * 100).toFixed(0)}%</span></div>` : '';
  return `
    <div class="panel reveal" style="margin-bottom:18px">
      <div class="row spread" style="flex-wrap:wrap;gap:14px;align-items:flex-start">
        <div><div class="muted mono" style="font-size:11px;letter-spacing:.12em">HELIX FORECASTER PASSPORT · PROOF-OF-FORECAST</div>
          <div style="font-family:var(--serif);font-size:2rem;letter-spacing:-.02em;margin-top:6px">${p.kind === 'agent' ? `Council agent · ${esc(p.agent)}` : 'Forecaster'} <span class="mono muted" style="font-size:1rem">${shortA(p.address)}</span></div>
          <div class="muted mono" style="font-size:11.5px;margin-top:4px">${esc(p.namespace)} · ${p.memory_count} memories on Walrus (mainnet)</div></div>
        <div style="text-align:right">
          <div class="badge" style="font-size:13px;padding:8px 14px;color:${p.hidden === 0 ? 'var(--alive)' : 'var(--coral)'};border-color:color-mix(in srgb,${p.hidden === 0 ? 'var(--alive)' : 'var(--coral)'} 45%,transparent)">committed ${p.committed} · shown ${p.shown ?? '—'} · hidden ${p.hidden ?? 'unknown'}</div>
          <div class="muted" style="font-size:11.5px;margin-top:6px;max-width:300px">counted from ConvictionCommitted events on Sui — a hidden call would show here</div>
          <div class="row" style="gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px">${(p.badge_names || []).map(b => `<span class="badge" style="color:var(--accent-deep)">★ ${esc(b)}</span>`).join('')}</div></div></div>
      <div class="grid-4" style="gap:10px;margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
        ${stat('settled', p.n_settled)}${stat('won', p.wins)}${stat('Brier (you)', p.n_settled ? f2(p.brier) : '—')}
        ${stat('confidence gap', gap == null || !p.n_settled ? '—' : (gap >= 0 ? '+' : '') + gap + ' pts', gap != null && gap > 10 ? 'var(--coral)' : '')}
        ${stat('posterior win rate', p.n_settled ? Math.round(p.posterior * 100) + '%' : '—')}</div></div>
    <div class="grid-2 reveal d1" style="align-items:start;gap:18px">
      <div class="panel"><div class="section-title" style="margin:0 0 8px">setups (n ≥ 3)</div>
        ${p.setups?.length ? setup(p.best_setup, 'best') + (p.worst_setup ? setup(p.worst_setup, 'worst') : '') : '<div class="muted">No setup has 3 settled calls yet.</div>'}
        ${p.latest_lesson ? `<div class="row" style="gap:9px;margin-top:14px;align-items:flex-start"><span class="sdot pending" style="margin-top:5px;flex:0 0 auto"></span><span style="font-size:13.5px;line-height:1.5">${esc(p.latest_lesson.text)} <a class="mono" style="color:var(--accent-deep);font-size:11px" href="${WALRUSCAN(p.latest_lesson.blob_id)}" target="_blank" rel="noopener">lesson ↗</a></span></div>` : ''}</div>
      <div class="panel"><div class="section-title" style="margin:0 0 8px">share · embed · verify the signature</div>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <a class="btn-soft" href="${share.x}" target="_blank" rel="noopener" data-cursor>Post on X</a>
          <a class="btn-soft" href="${share.card}" target="_blank" rel="noopener" data-cursor>Card (SVG)</a>
          <a class="btn-soft" href="${share.json}" target="_blank" rel="noopener" data-cursor>Signed JSON</a>
          <a class="btn-soft" href="${base}/.well-known/helix-attestation.json" target="_blank" rel="noopener" data-cursor>Attestor key</a></div>
        <div class="muted" style="font-size:12px;margin-top:10px">Embed this passport anywhere:</div>
        <textarea class="hx-textarea mono" rows="3" readonly style="font-size:11px;margin-top:6px;width:100%">${esc(share.embed)}</textarea>
        ${signature ? `<div class="muted mono" style="font-size:10.5px;margin-top:6px;overflow-wrap:anywhere">signed ed25519 · key ${esc(signature.pubkey_hex.slice(0, 16))}… · sig ${esc(signature.sig_b64.slice(0, 22))}…</div>` : ''}
        <div id="onchain-passport" style="margin-top:12px"></div></div></div>
    <div class="panel reveal d2" style="margin-top:18px;padding:0;overflow:auto">
      <div class="row spread" style="padding:18px 22px"><div class="section-title" style="margin:0">every commit · one click from proof</div>
        <button class="btn-soft" id="verify-all" data-cursor>Verify all on this page</button></div>
      <table class="table"><thead><tr><th>committed (UTC)</th><th>call</th><th>result</th><th>proof</th><th>verify</th></tr></thead>
        <tbody>${(p.commits || []).map(commitRow).join('') || '<tr><td colspan="5" class="muted">No commits yet.</td></tr>'}</tbody></table></div>`;
}

/** Render a passport into `host`; wires Verify buttons and countdowns. */
export async function renderPassport(host, id, { base, embed = false, onMount } = {}) {
  host.innerHTML = `<div class="muted"><span class="sdot pending"></span> reading the passport from Walrus Memory and Sui…</div>`;
  let data;
  try {
    const r = await fetch(`${base}/passport/${encodeURIComponent(id)}`);
    data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  } catch (e) {
    host.innerHTML = `<div class="empty"><h3>No passport yet</h3><p>${esc(e.message)}</p></div>`;
    return null;
  }
  const p = data.passport;
  if (embed) { host.innerHTML = passportEmbedHTML(p); return p; }
  host.innerHTML = passportHTML(p, base, data.signature);
  const rows = new Map((p.commits || []).map(c => [c.digest, c]));
  const verify = async (digest) => {
    const out = host.querySelector(`[data-verify-out="${CSS.escape(digest)}"]`);
    if (!out) return;
    out.innerHTML = '<span class="muted">checking Sui…</span>';
    try {
      const v = await verifyCommitInBrowser(base, digest, rows.get(digest).text);
      out.innerHTML = v.ok
        ? `<span style="color:var(--alive)">✓ match</span> <span class="muted">sha256 ${v.memHex.slice(0, 10)}… = on-chain</span>`
        : `<span style="color:var(--coral)">✗ ${esc(v.reason || 'mismatch')}</span>${v.chainHex ? ` <span class="muted">chain ${v.chainHex.slice(0, 10)}… · memory ${v.memHex.slice(0, 10)}…</span>` : ''}`;
    } catch (e) { out.innerHTML = `<span style="color:var(--coral)">couldn't reach Sui (${esc(e.message)})</span>`; }
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-verify]'); if (b) verify(b.dataset.verify);
    if (e.target.closest('#verify-all')) [...rows.keys()].filter(d => d && rows.get(d).text).forEach((d, i) => setTimeout(() => verify(d), i * 400));
  });
  const timer = setInterval(() => {
    if (!host.isConnected) { clearInterval(timer); return; }
    host.querySelectorAll('[data-countdown]').forEach(n => { n.textContent = countdown(Number(n.dataset.countdown)); });
  }, 1000);
  if (onMount) onMount(p, host.querySelector('#onchain-passport'));
  return p;
}
