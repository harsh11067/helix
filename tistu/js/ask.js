/* ============================================================
   HELIX — Ask your memory (P6). Lazy-loaded side panel (imported on first open).
   POST /ask answers from the forecaster's Walrus Memory: Walrus Memory's own `ask`
   ("Walrus ask") or, as the fallback, deterministic templates over the calibration
   ("from your stats"). Every answer lists the memories it used, each linked to Walruscan.
   No cited memories → "I don't have memories about that yet." Read-only: works in
   Judge Mode without a wallet.
   ============================================================ */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortB = (b) => (b ? b.slice(0, 6) + '…' + b.slice(-4) : '');
const shortA = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
export const walruscanUrl = (blobId) => 'https://walruscan.com/mainnet/blob/' + encodeURIComponent(String(blobId ?? ''));
const TYPE_COLOR = { CONVICTION: 'var(--accent)', OUTCOME: 'var(--alive)', CALIBRATION: 'var(--ink-2)', LESSON: 'var(--coral)' };

export function modeLabel(mode) {
  return mode === 'walrus-ask' ? 'Walrus ask' : 'from your stats';
}

/** Memory chips (type · blob id), each a Walruscan link; "+N more" when the answer drew on more. */
export function memoryChipsHTML(list, total) {
  const ms = Array.isArray(list) ? list : [];
  if (!ms.length) return '';
  const more = Math.max(0, Number(total || 0) - ms.length);
  return `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px">${ms.map(m => {
    const type = String(m.type || String(m.text || '').split(' ')[0] || 'MEMORY');
    return `<a class="badge mono" href="${esc(walruscanUrl(m.blob_id))}" target="_blank" rel="noopener" title="${esc(String(m.text || '').slice(0, 300))}"
      style="font-size:10.5px;text-decoration:none;color:${TYPE_COLOR[type] || 'var(--ink-2)'}">${esc(type)} · ${esc(shortB(m.blob_id))} ↗</a>`;
  }).join('')}${more ? `<span class="muted mono" style="font-size:10.5px;align-self:center">+${more} more</span>` : ''}</div>`;
}

/** One answer card. */
export function answerHTML(r) {
  const cited = Array.isArray(r?.memories_used) ? r.memories_used : [];
  const walrus = r?.mode === 'walrus-ask';
  return `<div class="panel" style="padding:14px 16px">
      <div class="row spread" style="gap:8px;flex-wrap:wrap">
        <span class="badge" style="${walrus ? 'color:var(--alive);border-color:color-mix(in srgb,var(--alive) 40%,transparent)' : ''}">${esc(modeLabel(r?.mode))}</span>
        ${r?.n != null ? `<span class="muted mono" style="font-size:10.5px">n = ${Number(r.n)}</span>` : ''}
      </div>
      <div style="margin-top:10px;line-height:1.55">${esc(r?.answer || '')}</div>
      ${r?.note ? `<div class="muted" style="font-size:12px;margin-top:8px">${esc(r.note)}</div>` : ''}
      ${r?.unverified_numbers?.length && walrus ? `<div style="font-size:12px;margin-top:8px;color:var(--coral)">Not found in the cited memories: ${esc(r.unverified_numbers.join(', '))}</div>` : ''}
      ${cited.length ? `<div class="muted mono" style="font-size:10.5px;margin-top:12px">memories used (Walrus mainnet)</div>${memoryChipsHTML(cited, r.memories_total)}` : ''}
      ${r?.check?.answer ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
          <div class="muted mono" style="font-size:10.5px">checked against your stats${r.check.n != null ? ` · n = ${Number(r.check.n)}` : ''}</div>
          <div style="margin-top:6px;font-size:13px;line-height:1.5">${esc(r.check.answer)}</div>
          ${memoryChipsHTML(r.check.memories_used, r.check.memories_total)}</div>` : ''}
    </div>`;
}

let open = null;
export function closeAskPanel() {
  if (!open) return;
  open.el.remove(); removeEventListener('keydown', open.onKey); open = null;
}

/** openAskPanel({ api, address, readOnly, suggestions }) — one panel at a time. */
export function openAskPanel({ api, address, readOnly, suggestions }) {
  closeAskPanel();
  let who = address || null, busy = false;
  const el = document.createElement('aside');
  el.id = 'ask-panel';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Ask your memory');
  el.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);z-index:350;overflow-y:auto;'
    + 'background:var(--bg);color:var(--ink);border-left:1px solid var(--line);box-shadow:-18px 0 48px rgba(0,0,0,.18);padding:22px 18px 28px';
  const qs = (suggestions && suggestions.questions) || [];
  el.innerHTML = `<div class="row spread" style="gap:10px;align-items:flex-start">
      <div><b style="font-family:var(--serif);font-size:1.35rem">Ask your memory</b>
        <div class="muted" style="font-size:12.5px;margin-top:4px" data-who></div></div>
      <button class="btn-soft" data-close data-cursor aria-label="Close">Close</button>
    </div>
    <form data-form class="row" style="gap:8px;margin-top:16px">
      <input data-q class="mono" maxlength="400" placeholder="When am I most overconfident?" autocomplete="off"
        style="flex:1;min-width:0;padding:10px 12px;border-radius:10px;border:1px solid var(--line-2);background:var(--surface);color:var(--ink)">
      <button class="btn-solid" type="submit" data-cursor>Ask</button>
    </form>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:12px" data-chips>${qs.map(q => `<button class="chip" type="button" data-ask="${esc(q)}" data-cursor style="cursor:pointer">${esc(q)}</button>`).join('')}</div>
    <div data-out style="margin-top:16px;display:flex;flex-direction:column;gap:12px"></div>
    <div class="muted" style="font-size:11.5px;margin-top:18px;line-height:1.5">Answers come from Walrus Memory (mainnet): Walrus Memory's own <span class="mono">ask</span>, or HELIX's templates over your calibration when it can't answer. Every answer lists the memories it used. Read-only.</div>`;
  document.body.appendChild(el);
  const out = el.querySelector('[data-out]'), input = el.querySelector('[data-q]');

  const setWho = () => {
    el.querySelector('[data-who]').innerHTML = who
      ? `memory of <span class="mono">${esc(shortA(who))}</span>${readOnly ? ' · read-only demo' : ''}`
      : `No wallet connected. <button class="btn-soft" data-demo data-cursor style="padding:3px 10px;font-size:12px">Ask about the demo trader</button>`;
    const d = el.querySelector('[data-demo]');
    if (d) d.addEventListener('click', async () => {
      try { const r = await api('/demo'); if (r.address) { who = r.address; readOnly = true; setWho(); } }
      catch (e) { out.insertAdjacentHTML('afterbegin', `<div style="color:var(--coral)">${esc(e.message || 'demo unavailable')}</div>`); }
    });
  };
  setWho();

  async function ask(question) {
    const q = String(question || '').trim();
    if (!q || busy) return;
    if (!who) { out.insertAdjacentHTML('afterbegin', `<div class="muted">Connect a wallet, or ask about the demo trader first.</div>`); return; }
    busy = true;
    const slot = document.createElement('div');
    slot.innerHTML = `<div class="mono" style="font-size:12.5px;margin-bottom:6px">› ${esc(q)}</div><div class="muted"><span class="sdot pending"></span> asking Walrus Memory…</div>`;
    out.prepend(slot);
    try {
      const r = await api('/ask', { address: who, question: q }, { timeoutMs: 90000 });
      slot.innerHTML = `<div class="mono" style="font-size:12.5px;margin-bottom:6px">› ${esc(q)}</div>${answerHTML(r)}`;
    } catch (e) {
      slot.innerHTML = `<div class="mono" style="font-size:12.5px;margin-bottom:6px">› ${esc(q)}</div><div style="color:var(--coral)">${esc(e.message || 'could not ask right now')}</div>`;
    } finally { busy = false; }
  }

  el.querySelector('[data-close]').addEventListener('click', closeAskPanel);
  el.querySelector('[data-form]').addEventListener('submit', (ev) => { ev.preventDefault(); ask(input.value); input.value = ''; });
  el.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => ask(b.dataset.ask)));
  const onKey = (ev) => { if (ev.key === 'Escape') closeAskPanel(); };
  addEventListener('keydown', onKey);
  open = { el, onKey };
  input.focus();
  return el;
}
