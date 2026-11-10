/* ============================================================
   HELIX — Ulysses Rules (N2): promises to your future self, kept by memory.
   • Memory page panel: your rules (RULE v1 memories on Walrus), create / pause / delete (delete = RULE_REMOVED,
     memory is append-only), and how your rule-breaking has scored ("You broke your own rules 4 times and lost 3").
   • Canvas gate: a matching rule turns the guardian line into a gate; commit is disabled until an override
     sentence (≥ 10 characters) is typed. The commit then carries override=true and an OVERRIDE v1 memory.
   Every write is signed by the connected wallet (personal message) and verified by the server before it
   touches the namespace. Judge Mode shows the demo trader's rules read-only. Pure HTML builders are unit-tested.
   Shown only when the server has FEATURE_RULES on (GET /rules/:address, else 404).
   ============================================================ */
import { walruscanBlobUrl } from './share.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const OVERRIDE_MIN_CHARS = 10;
export const overrideOk = (text) => typeof text === 'string' && text.trim().length >= OVERRIDE_MIN_CHARS;

/** Parameter inputs for one template (numbers get their range; choices a select). */
export function paramsFormHTML(template) {
  if (!template) return '';
  return `<div class="rule-params">${template.params.map(p => p.type === 'number'
    ? `<label>${esc(p.label)}<input class="hx-textarea mono" type="number" data-param="${esc(p.key)}" value="${p.default}" min="${p.min}" max="${p.max}" step="${p.step ?? 1}" style="padding:8px 10px"/></label>`
    : `<label>${esc(p.label)}<select class="hx-textarea mono" data-param="${esc(p.key)}" style="padding:8px 10px">${p.choices.map(c => `<option value="${esc(c)}"${c === p.default ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`).join('')}</div>`;
}

export function overrideRecordHTML(view) {
  const r = view?.override_record;
  if (!r || (r.n === 0 && r.pending === 0)) return `<div class="muted" style="font-size:12.5px">No overrides yet. When a rule binds a call and you proceed anyway, the override is remembered — and scored once the call settles.</div>`;
  const lesson = view.lesson || `You broke your own rules ${r.n + r.pending} time${r.n + r.pending === 1 ? '' : 's'}${r.n ? ` and lost ${r.losses} of the ${r.n} that settled` : ''}.`;
  return `<div style="line-height:1.55"><b>${esc(lesson)}</b></div>
    <div class="muted mono" style="font-size:10.5px;margin-top:6px">overrides settled ${r.n} · won ${r.wins} · lost ${r.losses} · pending ${r.pending} · PnL ${r.pnl >= 0 ? '+' : ''}${Number(r.pnl).toFixed(2)} dUSDC · from OVERRIDE and OUTCOME memories</div>`;
}

/**
 * The Rules panel. `view` = GET /rules/:address. `readOnly` = Judge Mode (demo trader, nothing can be signed);
 * `canSign` = a browser wallet that signs personal messages is connected.
 */
export function rulesPanelHTML(view, { readOnly = false, canSign = false } = {}) {
  if (!view) return '';
  const rules = view.rules || [];
  const rows = rules.length ? rules.map(r => `<div class="rule-row${r.status === 'paused' ? ' paused' : ''}" data-rule="${esc(r.id)}">
      <div><div style="font-size:13.5px;line-height:1.5">${esc(r.sentence)}</div>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:4px;font-size:11px"><span class="badge" style="color:${r.status === 'active' ? 'var(--alive)' : 'var(--ink-3)'}">${esc(r.status)}</span>
          ${r.blob_id ? `<a class="mono" href="${walruscanBlobUrl(r.blob_id)}" target="_blank" rel="noopener" style="color:var(--accent-deep)">RULE blob ${esc(r.blob_id.slice(0, 8))}… ↗</a>` : ''}</div></div>
      ${canSign && !readOnly ? `<div class="row" style="gap:6px"><button class="btn-soft" data-rule-act="${r.status === 'active' ? 'pause' : 'resume'}" data-id="${esc(r.id)}" data-cursor type="button">${r.status === 'active' ? 'Pause' : 'Resume'}</button>
        <button class="btn-soft" data-rule-act="remove" data-id="${esc(r.id)}" data-cursor type="button" title="writes a RULE_REMOVED memory; the rule's history stays on Walrus">Delete</button></div>` : ''}</div>`).join('')
    : `<div class="muted" style="padding:8px 0">${readOnly ? 'The demo trader has no rules yet.' : 'No rules yet. A rule is a promise to your future self: HELIX holds you to it at compile time, and remembers every time you break it.'}</div>`;
  const create = readOnly
    ? `<div class="muted" style="font-size:12.5px;margin-top:12px">Judge Mode — the demo trader's rules, read-only. Connect a wallet to write rules for yourself.</div>`
    : !canSign
      ? `<div class="muted" style="font-size:12.5px;margin-top:12px">Connect a browser wallet to write rules: each rule is a Walrus memory in your namespace, so the wallet signs it first (zkLogin sessions cannot sign personal messages yet).</div>`
      : `<div class="rules-form" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><div class="section-title" style="margin:0 0 8px">new rule</div>
        <select class="hx-textarea" id="rule-template" style="padding:8px 10px;width:100%">${(view.templates || []).map((t, i) => `<option value="${esc(t.id)}"${i === 0 ? ' selected' : ''}>${esc(t.title)} — “${esc(t.example)}”</option>`).join('')}</select>
        <div id="rule-params">${paramsFormHTML((view.templates || [])[0])}</div>
        <div class="row" style="gap:10px;margin-top:12px;align-items:center;flex-wrap:wrap"><button class="btn-solid" id="rule-create" data-cursor type="button">Create rule — sign with wallet</button>
          <span class="muted mono" style="font-size:10.5px">RULE v1 memory on Walrus · no free text: templates and parameters only</span></div>
        <div id="rule-out" class="muted" style="font-size:12.5px;margin-top:8px"></div></div>`;
  return `<div class="panel reveal d1" style="margin-top:18px" id="rules-panel"><div class="row spread" style="gap:10px;flex-wrap:wrap"><div class="section-title" style="margin:0">ulysses rules · promises kept by memory</div>
      <span class="badge">${view.active ?? rules.filter(r => r.status === 'active').length} active · ${rules.length} total</span></div>
    <div style="margin:12px 0 14px">${overrideRecordHTML(view)}</div>
    ${rows}${create}</div>`;
}

/** The Canvas gate: the rules that bind this conviction and the override box. Empty when nothing binds. */
export function rulesGateHTML(triggered, text = '') {
  if (!triggered?.length) return '';
  const ok = overrideOk(text);
  return `<div class="panel rules-gate" style="margin-top:18px">
    <div class="row spread" style="gap:10px;flex-wrap:wrap"><b style="color:var(--coral)">Your rule${triggered.length > 1 ? 's' : ''} bind${triggered.length > 1 ? '' : 's'} this call</b><span class="badge" style="color:var(--coral)">gate</span></div>
    ${triggered.map(h => `<div style="margin-top:10px;line-height:1.5"><div>“${esc(h.sentence)}”</div><div class="muted" style="font-size:12.5px">${esc(h.reason)}</div></div>`).join('')}
    <label class="ctrl-head" for="override-text" style="margin:14px 0 6px"><span class="lab">override — say why this time is different</span><span class="val mono" id="override-count">${text.trim().length}/${OVERRIDE_MIN_CHARS}</span></label>
    <textarea id="override-text" class="hx-textarea" rows="2" placeholder="At least ${OVERRIDE_MIN_CHARS} characters. This sentence becomes an OVERRIDE memory next to the conviction, and memory scores it when the call settles." data-cursor>${esc(text)}</textarea>
    <div class="muted mono" style="font-size:10.5px;margin-top:6px" id="override-hint">${ok ? 'override accepted — the commit will carry override=true' : 'commit stays disabled until the override is typed'}</div></div>`;
}

/** Enable/disable the commit + mint buttons from the gate state. Returns whether the gate is open. */
export function applyGate(root, triggered, text) {
  const gated = !!triggered?.length && !overrideOk(text);
  for (const id of ['commit', 'deploy']) {
    const b = root.querySelector(`#${id}`);
    if (!b || b.dataset.readonly === '1') continue;
    b.disabled = gated; b.setAttribute('aria-disabled', String(gated)); b.style.opacity = gated ? '.45' : ''; b.style.cursor = gated ? 'not-allowed' : '';
    b.title = gated ? 'your rule binds this call — type an override first' : '';
  }
  const c = root.querySelector('#override-count'); if (c) c.textContent = `${(text || '').trim().length}/${OVERRIDE_MIN_CHARS}`;
  const h = root.querySelector('#override-hint'); if (h) h.textContent = overrideOk(text) ? 'override accepted — the commit will carry override=true' : 'commit stays disabled until the override is typed';
  return !gated;
}

/** Wire the Rules panel: template → params, create / pause / resume / remove, each signed then posted. */
export function mountRulesPanel(host, view, { api, address, readOnly, signPersonalMessage, onChange }) {
  const panel = host.querySelector('#rules-panel');
  if (!panel || readOnly || !signPersonalMessage) return;
  const out = () => panel.querySelector('#rule-out');
  const say = (msg, bad = false) => { const o = out(); if (o) { o.textContent = msg; o.style.color = bad ? 'var(--coral)' : ''; } };
  const sign = async (action, extra) => {
    const m = await api('/rules/message', { action, address, ...extra });
    const { signature } = await signPersonalMessage(new TextEncoder().encode(m.message));
    return { address, ts: m.ts, signature };
  };
  panel.addEventListener('change', (e) => {
    if (!e.target.closest('#rule-template')) return;
    const t = (view.templates || []).find(x => x.id === e.target.value);
    panel.querySelector('#rule-params').innerHTML = paramsFormHTML(t);
  });
  panel.addEventListener('click', async (e) => {
    const create = e.target.closest('#rule-create'), act = e.target.closest('[data-rule-act]');
    if (!create && !act) return;
    const btn = create || act; btn.disabled = true;
    try {
      if (create) {
        const template = panel.querySelector('#rule-template').value;
        const params = Object.fromEntries([...panel.querySelectorAll('[data-param]')].map(i => [i.dataset.param, i.value]));
        say('sign the rule in your wallet…');
        const proof = await sign('create', { template, params });
        const r = await api('/rules/create', { template, params, ...proof });
        say(`rule written to Walrus · blob ${r.blob_id}`);
      } else {
        const id = act.dataset.id, a = act.dataset.ruleAct;
        say(`sign “${a}” in your wallet…`);
        const proof = await sign(a, { id });
        if (a === 'remove') await api('/rules/remove', { id, ...proof });
        else await api('/rules/pause', { id, paused: a === 'pause', ...proof });
        say(a === 'remove' ? 'RULE_REMOVED memory written' : `rule ${a}d`);
      }
      onChange?.();
    } catch (err) { say(err.message || 'failed', true); btn.disabled = false; }
  });
}
