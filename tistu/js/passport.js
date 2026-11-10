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
  const owner = r.data.transaction.sender?.address;
  // T2: the same transaction through Tatum's second interface (gRPC, read by the server: Tatum gRPC isn't grpc-web).
  // Never a faked second check: if gRPC can't answer, the row says "1 interface".
  let grpc = { ok: false, reason: 'unavailable' };
  try {
    const g = await fetch(base + '/verify/' + encodeURIComponent(digest) + '/grpc').then(x => x.ok ? x.json() : null);
    const e = g?.events?.[0];
    if (g && e) grpc = { ok: e.hash === memHex && g.success === true && (!owner || String(g.sender).toLowerCase() === String(owner).toLowerCase()), hash: e.hash, checkpoint: g.checkpoint, reason: e.hash === memHex ? (g.success ? 'sender differs' : 'tx failed') : 'hash differs' };
  } catch (err) { /* stays unavailable */ }
  return { ok: chainHex === memHex, chainHex, memHex, owner, grpc, interfaces: chainHex === memHex ? (grpc.ok ? 2 : 1) : 0 };
}
/** Row text for a verification result (pure, tested). */
export function verifyResultHTML(v) {
  if (!v.ok) return `<span style="color:var(--coral)">✗ ${esc(v.reason || 'mismatch')}</span>${v.chainHex ? ` <span class="muted">chain ${v.chainHex.slice(0, 10)}… · memory ${v.memHex.slice(0, 10)}…</span>` : ''}`;
  if (v.grpc?.ok) return `<span style="color:var(--alive)">✓✓ match</span> <span class="muted">sha256 ${v.memHex.slice(0, 10)}… = on-chain · verified via 2 Tatum interfaces (GraphQL + gRPC)</span>`;
  if (v.grpc && v.grpc.reason !== 'unavailable') return `<span style="color:var(--coral)">✓ GraphQL match · ✗ gRPC ${esc(v.grpc.reason)}</span>`;
  return `<span style="color:var(--alive)">✓ match</span> <span class="muted">sha256 ${v.memHex.slice(0, 10)}… = on-chain · 1 Tatum interface (gRPC unavailable)</span>`;
}

function countdown(ms) {
  const s = Math.round((ms - Date.now()) / 1000);
  return s <= 0 ? 'settling…' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** T3: "3 sources agree ✓" — the settlement price vs every independent price recorded with it (pure, tested). */
export function priceChipHTML(p, limitBps = 50) {
  if (!p || !p.sources?.length) return '';
  const worst = Math.max(...p.sources.map(x => Math.abs(x.bps)));
  const n = p.sources.length + 1;
  const title = `Settled at ${p.settle} (${p.oracle}); ` + p.sources.map(x => `${x.name} ${x.usd} (${x.bps >= 0 ? '+' : ''}${x.bps} bps)`).join(', ');
  return worst <= limitBps
    ? `<div class="mono" style="font-size:10.5px;margin-top:3px;color:var(--ink-3)" title="${esc(title)}">${n} price sources agree ✓ · ≤${worst.toFixed(worst < 10 ? 1 : 0)} bps</div>`
    : `<div class="mono" style="font-size:10.5px;margin-top:3px;color:var(--coral)" title="${esc(title)}">price sources differ by ${worst.toFixed(0)} bps</div>`;
}

/** N3: signed snapshots of this passport frozen on Walrus, and the button that makes one (pure, tested). */
export function reportsHTML(p) {
  const rows = (p.reports || []).map(r => `<div class="mono" style="font-size:11.5px;margin-top:4px;overflow-wrap:anywhere">
      <a href="passport.html?report=${encodeURIComponent(r.blob_id)}" style="color:var(--accent-deep)">report ${esc(String(r.blob_id).slice(0, 12))}…</a>
      <span class="muted">· ${r.ts ? new Date(r.ts * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''} · committed ${esc(r.committed ?? '—')} · hidden ${esc(r.hidden ?? '—')} · ${esc(r.network || 'walrus')}</span></div>`).join('');
  return `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
      <div class="row spread" style="gap:10px;flex-wrap:wrap"><div class="muted" style="font-size:12.5px;max-width:420px">Freeze a <b>signed</b> copy of this passport as a Walrus blob: anyone can verify it later, even without HELIX.</div>
        <button class="btn-soft" id="freeze-report" data-cursor>Freeze a signed copy on Walrus</button></div>
      <div id="report-out" class="mono" style="font-size:11.5px;margin-top:6px;overflow-wrap:anywhere"></div>${rows}</div>`;
}

/** Verify a frozen report in the browser: raw Ed25519 over canonical JSON (WebCrypto). null = not supported here. */
export async function verifyReportSignature(doc) {
  const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v ?? null)
    : Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
    : `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  try {
    const hex = doc.signature.pubkey_hex, raw = new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
    const sig = Uint8Array.from(atob(doc.signature.sig_b64), c => c.charCodeAt(0));
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, new TextEncoder().encode(canonical(doc.report)));
  } catch (e) { return null; }
}

/** passport.html?report=<blob>: the frozen passport, fetched from a Walrus aggregator and verified in the browser. */
export async function renderReport(host, blobId, { base, aggregator = 'https://aggregator.walrus-testnet.walrus.space' } = {}) {
  host.innerHTML = `<div class="muted"><span class="sdot pending"></span> reading the report from Walrus…</div>`;
  let doc;
  try {
    const r = await fetch(`${aggregator}/v1/blobs/${encodeURIComponent(blobId)}`);
    if (!r.ok) throw new Error(`Walrus aggregator HTTP ${r.status}`);
    doc = await r.json();
    if (doc?.report?.kind !== 'helix-forecaster-report') throw new Error('not a HELIX forecaster report');
  } catch (e) { host.innerHTML = `<div class="empty"><h3>Report not found</h3><p>${esc(e.message)}</p></div>`; return null; }
  let wk = null; try { wk = await fetch(`${base}/.well-known/helix-attestation.json`).then(x => x.json()); } catch (e) {}
  const ok = await verifyReportSignature(doc);
  const keyMatch = wk ? wk.pubkey_hex === doc.signature.pubkey_hex : null;
  const verdict = ok === true && keyMatch !== false
    ? `<b style="color:var(--alive)">✓ signature valid</b> — Ed25519 by the HELIX attestor${keyMatch ? ' (matches the published key)' : ''}`
    : ok === false ? `<b style="color:var(--coral)">✗ signature invalid</b> — this copy was altered`
    : keyMatch === false ? `<b style="color:var(--coral)">✗ signed by an unknown key</b>`
    : `<span class="muted">this browser can't check Ed25519 — run <span class="mono">node tee/scripts/verify-report.mjs ${esc(blobId)}</span></span>`;
  const banner = `<div class="panel" style="margin-bottom:18px;border-color:color-mix(in srgb,var(--accent) 45%,transparent)">
    <div class="section-title" style="margin:0 0 6px">frozen forecaster report · ${esc(doc.report.walrus_network)}</div>
    <div style="font-size:14px">Issued ${esc(doc.report.issued_at.slice(0, 16).replace('T', ' '))} UTC · ${verdict}</div>
    <div class="mono muted" style="font-size:11px;margin-top:6px;overflow-wrap:anywhere">blob <a href="${aggregator}/v1/blobs/${esc(blobId)}" target="_blank" rel="noopener">${esc(blobId)}</a> · key ${esc(doc.signature.pubkey_hex.slice(0, 16))}… · <a href="passport.html?id=${encodeURIComponent(doc.report.passport.namespace)}">today's live passport →</a></div></div>`;
  host.innerHTML = banner + passportHTML(doc.report.passport, base, doc.signature);
  return doc;
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
    <td style="font-size:12.5px">${status}${c.status === 'settled' ? priceChipHTML(c.prices) : ''}</td>
    <td style="font-size:11.5px;white-space:nowrap">
      ${c.digest ? `<a class="mono" style="color:var(--accent-deep)" href="${SUISCAN(c.digest)}" target="_blank" rel="noopener">commit ↗</a>` : ''}
      ${c.conviction_blob ? ` · <a class="mono" style="color:var(--accent-deep)" href="${WALRUSCAN(c.conviction_blob)}" target="_blank" rel="noopener">memory ↗</a>` : ''}
      ${c.outcome_blob ? ` · <a class="mono" style="color:var(--accent-deep)" href="${WALRUSCAN(c.outcome_blob)}" target="_blank" rel="noopener">outcome ↗</a>` : ''}</td>
    <td>${c.text && c.digest ? `<button class="btn-soft" data-verify="${esc(c.digest)}" style="padding:4px 12px;font-size:12px" data-cursor>Verify</button><div class="mono" data-verify-out="${esc(c.digest)}" style="font-size:10.5px;margin-top:4px"></div>`
      : c.verified_at_settlement ? `<div class="mono muted" style="font-size:10.5px;max-width:190px" title="Walrus Memory search no longer returns this CONVICTION's text, so the browser can't re-hash it. The settlement watcher re-hashed it against the chain when it settled and wrote reveal_ok=true in the OUTCOME memory.">✓ verified at settlement<br>(memory search no longer returns the text)</div>` : ''}</td>
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
        ${reportsHTML(p)}
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
      out.innerHTML = verifyResultHTML(v);
    } catch (e) { out.innerHTML = `<span style="color:var(--coral)">couldn't reach Sui (${esc(e.message)})</span>`; }
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-verify]'); if (b) verify(b.dataset.verify);
    if (e.target.closest('#verify-all')) [...rows.keys()].filter(d => d && rows.get(d).text).forEach((d, i) => setTimeout(() => verify(d), i * 400));
    const fr = e.target.closest('#freeze-report');
    if (fr) {
      const out = host.querySelector('#report-out');
      fr.disabled = true; out.innerHTML = '<span class="muted">signing this passport and uploading it to Walrus…</span>';
      fetch(`${base}/passport/${encodeURIComponent(p.namespace)}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        .then(r => r.json().then(j => { if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; }))
        .then(j => { out.innerHTML = `<span style="color:var(--alive)">✓ frozen on ${esc(j.walrus_network)}</span> · <a href="passport.html?report=${encodeURIComponent(j.blob_id)}">open the signed report</a> · <a href="${esc(j.aggregator_url)}" target="_blank" rel="noopener">raw blob</a>${j.reused ? ' <span class="muted">(made in the last 10 min)</span>' : ''}`; })
        .catch(err => { out.innerHTML = `<span style="color:var(--coral)">${esc(err.message)}</span>`; })
        .finally(() => { fr.disabled = false; });
    }
  });
  const timer = setInterval(() => {
    if (!host.isConnected) { clearInterval(timer); return; }
    host.querySelectorAll('[data-countdown]').forEach(n => { n.textContent = countdown(Number(n.dataset.countdown)); });
  }, 1000);
  if (onMount) onMount(p, host.querySelector('#onchain-passport'));
  return p;
}
