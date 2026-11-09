/* ============================================================
   HELIX — On-chain Forecaster Passport control (P4, Lane B)
   A soulbound helix_passport::passport::ForecasterPassport: HELIX signs the
   record (Ed25519), the chain verifies it, and the object cannot be transferred.

   Mounted by the Passport page:
     mountOnchainPassport(el, {
       api,                  // sui.js `api(path, body?)` → JSON (throws on HTTP errors, err.status)
       address,              // connected Sui address, or null (read-only)
       ns,                   // memory namespace of the passport being viewed
       owner,                // address whose passport to show (defaults to `address`)
       signAndExecuteBytes,  // app.js signer: (b64) → { success, digest, changed, error }
       explorer,             // optional { tx: (digest) → url, object: (id) → url } (default Suiscan testnet)
       readOnly,             // true in Judge Mode
     }) → { reload }
   Renders nothing when the server has the feature off (routes 404).
   Every number shown is read from the chain or from the signed attestation.
   ============================================================ */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortId = (a) => a ? a.slice(0, 8) + '…' + a.slice(-6) : '';
const BADGES = [[1, 'Calibrated'], [2, 'Honest Loser'], [4, 'Contrarian'], [8, 'Council Member'], [16, 'Multi-asset']];
const SUISCAN = { tx: (d) => `https://suiscan.xyz/testnet/tx/${d}`, object: (o) => `https://suiscan.xyz/testnet/object/${o}` };

/** "Brier 0.18" from basis points; an unscored record (n = 0) shows no number. */
export function brierText(bps, n) {
  if (!n || bps == null || !Number.isFinite(Number(bps))) return 'not scored yet';
  return 'Brier ' + (Number(bps) / 10000).toFixed(2);
}
export function badgeList(bits) {
  return BADGES.filter(([b]) => (Number(bits) & b) !== 0).map(([, name]) => name);
}

function statsHTML(f) {
  const n = Number(f.n_settled ?? 0);
  const chips = badgeList(f.badges).map(b => `<span class="badge" style="color:var(--alive);border-color:color-mix(in srgb,var(--alive) 40%,transparent)">${esc(b)}</span>`).join(' ');
  return `<div class="row" style="gap:14px;flex-wrap:wrap;margin-top:10px;align-items:baseline">
      <span><b class="mono">${n}</b> settled</span>
      <span><b class="mono">${Number(f.wins ?? 0)}</b> won</span>
      <span class="mono">${esc(brierText(f.brier_bps, n))}</span>
      <span>hidden <b class="mono" style="color:${Number(f.hidden) ? 'var(--coral)' : 'var(--alive)'}">${Number(f.hidden ?? 0)}</b></span>
    </div>
    ${chips ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">${chips}</div>` : ''}`;
}

/** The changed passport object in an executed result, if the server reported it. */
export function passportIdFrom(res) {
  const hit = (res?.changed || []).find(c => String(c.type || '').endsWith('::passport::ForecasterPassport'));
  return hit ? hit.id : null;
}

export function mountOnchainPassport(el, opts) {
  const { api, ns, signAndExecuteBytes } = opts;
  const address = opts.address || null;
  const owner = opts.owner || address;
  const ex = { ...SUISCAN, ...(opts.explorer || {}) };
  const canSign = !!(address && owner && address.toLowerCase() === owner.toLowerCase() && signAndExecuteBytes && !opts.readOnly);
  let busy = false;

  const panel = (inner, tone) => `<div class="panel" style="padding:18px 20px${tone ? `;border-color:color-mix(in srgb,var(--${tone}) 45%,transparent)` : ''}">
      <div class="row spread" style="gap:10px;flex-wrap:wrap"><b>On-chain passport</b><span class="muted mono" style="font-size:10.5px">soulbound · Sui testnet</span></div>${inner}</div>`;

  async function load(fresh) {
    if (!owner) { el.innerHTML = ''; return; }
    el.innerHTML = panel(`<div class="muted" style="margin-top:8px"><span class="sdot pending"></span> reading the chain…</div>`);
    let s;
    try { s = await api(`/passport/${encodeURIComponent(ns)}/onchain?owner=${owner}${fresh ? '&fresh=1' : ''}`); }
    catch (e) {
      if (e.status === 404) { el.innerHTML = ''; return; }            // feature off on this server
      el.innerHTML = panel(`<div class="muted" style="margin-top:8px;color:var(--coral)">${esc(e.message || 'could not read the chain')}</div>`);
      return;
    }
    render(s);
  }

  function render(s, note) {
    const p = s.passport;
    if (!p) {
      el.innerHTML = panel(`<div class="muted" style="margin-top:8px;line-height:1.55">
          ${canSign
            ? 'Put this record on Sui as a soulbound object: HELIX signs it, <span class="mono">helix_passport</span> verifies the signature on-chain, and it can never be transferred. Any protocol can read it.'
            : 'No on-chain passport for this forecaster yet.'}</div>
        ${canSign ? `<button class="btn-solid" data-op="claim" data-cursor style="margin-top:14px">Mint on-chain passport</button>` : ''}
        <div data-out style="margin-top:12px">${note || ''}</div>`);
    } else {
      el.innerHTML = panel(`${statsHTML(p)}
        <div class="muted mono" style="font-size:10.5px;margin-top:10px">version ${Number(p.version)} · attested ${esc(new Date(Number(p.issued_ms)).toLocaleString())}${s.ns_matches === false ? ' · namespace ' + esc(p.ns) : ''}</div>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:14px">
          <a class="btn-soft" href="${esc(ex.object(p.id))}" target="_blank" rel="noopener" data-cursor>View on Suiscan ↗</a>
          ${canSign ? `<button class="btn-soft" data-op="refresh" data-cursor>Refresh</button>` : ''}
        </div>
        <div class="muted" style="font-size:12.5px;margin-top:10px">Visible in the owner's wallet · object <span class="mono">${esc(shortId(p.id))}</span></div>
        <div data-out style="margin-top:12px">${note || ''}</div>`);
    }
    el.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => act(b.dataset.op, s)));
  }

  async function act(op, s) {
    if (busy || !canSign) return; busy = true;
    const out = el.querySelector('[data-out]');
    el.querySelectorAll('[data-op]').forEach(b => { b.disabled = true; b.style.opacity = '0.6'; });
    out.innerHTML = `<div class="muted"><span class="sdot pending"></span> fetching a fresh HELIX attestation and building the transaction…</div>`;
    try {
      const t = await api(`/passport/${encodeURIComponent(ns)}/${op === 'claim' ? 'claim-tx' : 'refresh-tx'}`, { owner: address });
      out.innerHTML = `<div class="muted" style="line-height:1.55"><span class="sdot pending"></span> Confirm in your wallet: ${op === 'claim' ? 'mint' : 'refresh'} your passport with
        ${Number(t.fields.n_settled)} settled · ${esc(brierText(t.fields.brier_bps, t.fields.n_settled))} · hidden ${Number(t.fields.hidden)}.
        ${t.sponsored ? 'Gas is sponsored by HELIX.' : 'Gas only.'}</div>`;
      const res = await signAndExecuteBytes(t.txBytes);
      if (!res || !res.success) throw new Error((res && res.error) || 'transaction failed');
      const id = passportIdFrom(res) || t.passportId || null;
      const done = `<div class="panel" style="padding:14px 16px;border-color:color-mix(in srgb,var(--alive) 45%,transparent);background:var(--alive-soft)">
          <b style="color:var(--alive)">${op === 'claim' ? 'Passport minted on Sui' : 'Passport refreshed'}</b>
          <div class="muted" style="margin-top:6px;line-height:1.5">Verified on-chain against the HELIX attestor key. Visible in your wallet.</div>
          <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px">
            ${id ? `<a class="btn-soft" href="${esc(ex.object(id))}" target="_blank" rel="noopener" data-cursor>Passport on Suiscan ↗</a>` : ''}
            <a class="mono" style="color:var(--accent-deep);align-self:center" href="${esc(ex.tx(res.digest))}" target="_blank" rel="noopener">tx ${esc(shortId(res.digest))} ↗</a>
          </div></div>`;
      // the indexer catches up in a moment; show the success note on the reloaded state
      setTimeout(async () => {
        try { render(await api(`/passport/${encodeURIComponent(ns)}/onchain?owner=${owner}&fresh=1`), done); }
        catch (e) { out.innerHTML = done; }
      }, 2500);
      out.innerHTML = done;
    } catch (e) {
      const up = e.status === 409 && op === 'refresh';
      out.innerHTML = `<div class="${up ? 'muted' : ''}" style="${up ? '' : 'color:var(--coral)'}">${up ? 'Already up to date: no newer attestation yet.' : esc(e.message || 'rejected')}</div>`;
      el.querySelectorAll('[data-op]').forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    } finally { busy = false; }
  }

  load(false);
  return { reload: () => load(true) };
}
