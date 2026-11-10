/* HELIX — Tatum Ops panel (FINAL_PUSH T1). Every number comes from GET /ops/tatum, which the server
   computes from the counters at its single Tatum chokepoint; nothing here is estimated in the browser
   except formatting. Pure render function so it can be unit-tested. */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
const ms = (v) => (v == null ? '—' : `${Math.round(v)} ms`);
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

export function runwayText(o, now = Date.now()) {
  if (!o?.projected_exhaustion_iso) return o?.credits_used_dashboard_input == null ? 'set TATUM_CREDITS_USED to project' : '—';
  const t = Date.parse(o.projected_exhaustion_iso);
  const days = (t - now) / 86_400_000;
  const d = new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return `${d} IST (${days >= 1 ? days.toFixed(1) + ' days' : Math.max(0, Math.round(days * 24)) + ' h'})`;
}

const IFACE = {
  testnet: { name: 'Sui testnet · GraphQL', what: 'every read the app makes, event queries, the chain audit, and every transaction executed' },
  mainnet: { name: 'Sui mainnet · GraphQL', what: 'Walrus Memory proofs: the memory account object read on mainnet' },
  'grpc-testnet': { name: 'Sui testnet · gRPC', what: 'second-interface check behind every Passport "Verify": the commit transaction read via LedgerService/GetTransaction' },
  'grpc-mainnet': { name: 'Sui mainnet · gRPC', what: 'second-interface read of the Walrus Memory account in every memory proof' },
  rates: { name: 'Exchange-rate Data API', what: 'the price witness for BTC, ETH and SUI settlements' },
};

export function renderOps(o, now = Date.now()) {
  if (!o) return '<div class="empty"><h3>Ops data unavailable</h3><p>The server did not answer /ops/tatum.</p></div>';
  const banner = o.degraded
    ? `<div class="panel" style="border-color:var(--risk,#c0392b);margin-bottom:18px"><b>Live chain reads paused — showing cached data.</b> Tatum answered HTTP ${esc(o.degraded.status)} since ${new Date(o.degraded.since).toLocaleTimeString()}. Writes (commits, agents) are paused until it recovers. HELIX does not fall back to a public fullnode.</div>`
    : '';
  const rows = Object.entries(o.interfaces ?? {}).map(([k, v]) => {
    const ops = Object.entries(v.by_op ?? {}).slice(0, 6).map(([op, c]) => `<span class="mono">${esc(op)}</span> ${n(c)}`).join(' · ');
    return `<tr><td><b>${esc(IFACE[k]?.name ?? k)}</b><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(IFACE[k]?.what ?? '')}</div>
        ${k !== 'rates' && o.hosts?.[k] ? `<div class="mono muted" style="font-size:11.5px;margin-top:3px">${esc(o.hosts[k])}</div>` : ''}</td>
      <td class="mono">${n(v.calls_last_hour)}</td><td class="mono">${ms(v.p50_ms)} / ${ms(v.p95_ms)}</td><td class="mono">${pct(v.error_rate)}</td>
      <td style="font-size:12.5px">${ops || '<span class="muted">no calls this hour</span>'}</td></tr>`;
  }).join('');
  const memwalSui = Object.entries(o.memwal_sdk_sui_calls ?? {});
  const others = Object.entries(o.other_hosts ?? {}).filter(([h]) => !(o.memwal_sdk_sui_calls ?? {})[h]).map(([h, c]) => `<span class="mono">${esc(h)}</span> ${n(c)}`).join(' · ');
  const hourly = (o.hourly ?? []).map((h) => `<span class="mono">${new Date(h.hour).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span> ${n(h.calls)}`).join(' · ');
  return `${banner}
  <div class="grid-4" style="margin-bottom:18px">
    <div class="stat"><div class="k">Tatum calls · last hour</div><div class="v">${n(o.calls_last_hour)}</div></div>
    <div class="stat"><div class="k">Direct fullnode calls by HELIX</div><div class="v" data-fullnode>${n(o.direct_fullnode_calls)}</div></div>
    <div class="stat"><div class="k">Read cache hit rate</div><div class="v">${pct(o.cache_hit_rate)}</div></div>
    <div class="stat"><div class="k">Credit runway (est.)</div><div class="v" style="font-size:1.05rem;line-height:1.35">${esc(runwayText(o, now))}</div></div>
  </div>
  <div class="panel" style="margin-bottom:18px">
    <div class="section-title" style="margin:0 0 10px">Every Sui call goes through Tatum</div>
    <table class="table"><thead><tr><th>Tatum interface</th><th>Calls / h</th><th>p50 / p95</th><th>Errors</th><th>By operation</th></tr></thead><tbody>${rows}</tbody></table>
  </div>
  <div class="grid-2">
    <div class="panel"><div class="section-title" style="margin:0 0 8px">How it's spent</div>
      <p class="muted" style="margin:0 0 8px;font-size:13.5px">One server-side queue at the free plan's ${esc(String(o.plan ?? '').match(/ratelimit=(\d+)/)?.[1] ?? 3)} req/s with jittered backoff. Reads are cached briefly; the settlement watcher sleeps until each market's expiry; the Council and every passport share one incremental log of commit events; the chain audit re-checks 20 transactions per request.</p>
      <div style="font-size:13px">Calls per hour: ${hourly || '<span class="muted">—</span>'}</div>
      <div class="muted mono" style="font-size:11.5px;margin-top:8px">${n(o.calls_since_start)} calls since ${o.started_at ? new Date(o.started_at).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) + ' IST' : '—'} · ${n(o.retries)} retries · ${n(o.rate_limited)} rate-limited · ≈${esc(o.credits_per_call_est)} credits per call · ${n(o.credits_per_hour_est)} credits/h</div>
    </div>
    <div class="panel"><div class="section-title" style="margin:0 0 8px">Not Sui, so not through Tatum</div>
      <p class="muted" style="margin:0 0 8px;font-size:13.5px">Other services HELIX talks to, counted by host at the same process: the DeepBook Predict server, Pyth, Polymarket, the Walrus Memory relayer and Walrus aggregator.</p>
      <div style="font-size:13px;word-break:break-word">${others || '<span class="muted">none yet</span>'}</div>
      ${memwalSui.length ? `<p class="muted" style="margin:10px 0 0;font-size:12.5px">The Walrus Memory SDK opens its Seal session against the mainnet Sui endpoint its relayer advertises, and offers no way to pass our own client: ${memwalSui.map(([h, c]) => `<span class="mono">${esc(h)}</span> ${n(c)}`).join(' · ')}. Those calls belong to the memory layer, not to HELIX's Sui access.</p>` : ''}
    </div>
  </div>
  ${(o.recent_executions ?? []).length ? `<div class="panel" style="margin-top:18px"><div class="section-title" style="margin:0 0 8px">Latest transactions executed through Tatum</div>
    ${(o.recent_executions ?? []).map((e) => `<div class="mono" style="font-size:12.5px"><a href="https://suiscan.xyz/${esc(e.net)}/tx/${esc(e.digest)}" target="_blank" rel="noopener">${esc(e.digest)}</a> <span class="muted">${new Date(e.at).toLocaleTimeString()}</span></div>`).join('')}</div>` : ''}`;
}
