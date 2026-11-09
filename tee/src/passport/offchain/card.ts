// passport/offchain/card — the Passport as a 1200×630 SVG (share card, OG image, and the image the
// on-chain passport's Display points at). Literal colours from tistu/css/helix.css tokens. Real numbers
// only: anything not yet measurable is written as "—" or "not scored".

const T = { bg: '#F3F1EA', bg2: '#ECE8DD', ink: '#16140F', ink2: '#5B5648', ink3: '#8E8773', accent: '#C58A2A', accentDeep: '#9A6A18', alive: '#1F8F86', coral: '#C8553F', card: '#1A1822', cardFg: '#EDE7D7' };
const x = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const f2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(2));

function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((cur + ' ' + w).trim().length > max) { out.push(cur); cur = w; if (out.length === lines) break; } else cur = (cur + ' ' + w).trim();
  }
  if (cur && out.length < lines) out.push(cur);
  return out;
}

export function passportCardSVG(p: any): string {
  const who = p.kind === 'agent' ? `Council agent · ${p.agent}` : 'Forecaster';
  const hiddenKnown = p.hidden != null;
  const hidden = hiddenKnown ? Number(p.hidden) : NaN;
  const gap = p.gap_you == null ? null : Math.round(p.gap_you * 100);
  const lesson = p.latest_lesson?.text ? wrap(p.latest_lesson.text, 78, 2) : ['No lesson yet — HELIX writes one after 3 settled calls in a setup.'];
  const stat = (xx: number, label: string, value: string, color = T.ink) =>
    `<text x="${xx}" y="300" font-size="20" letter-spacing="2" fill="${T.ink3}">${x(label)}</text><text x="${xx}" y="360" font-size="56" font-family="Georgia,serif" fill="${color}">${x(value)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Inter,Helvetica,Arial,sans-serif">
  <rect width="1200" height="630" fill="${T.bg}"/>
  <rect width="1200" height="8" fill="${T.accent}"/>
  <text x="80" y="92" font-size="20" letter-spacing="4" fill="${T.ink3}">HELIX FORECASTER PASSPORT · PROOF-OF-FORECAST</text>
  <text x="80" y="160" font-size="54" font-family="Georgia,serif" fill="${T.ink}">${x(who)}</text>
  <text x="80" y="205" font-size="22" font-family="ui-monospace,monospace" fill="${T.ink2}">${x(p.namespace)} · ${x(String(p.address).slice(0, 10))}…${x(String(p.address).slice(-6))}</text>
  ${stat(80, 'SETTLED', String(p.n_settled ?? 0))}
  ${stat(300, 'WON', String(p.wins ?? 0))}
  ${stat(500, 'BRIER', p.n_settled ? f2(p.brier) : '—')}
  ${stat(720, 'CONFIDENCE GAP', gap == null || !p.n_settled ? '—' : `${gap >= 0 ? '+' : ''}${gap} pts`, gap != null && gap > 10 ? T.coral : T.ink)}
  ${stat(980, 'HIDDEN', hiddenKnown ? String(hidden) : '—', hidden === 0 ? T.alive : hiddenKnown ? T.coral : T.ink3)}
  <text x="80" y="420" font-size="22" fill="${T.ink2}">committed ${x(p.committed ?? 0)} on Sui · shown ${x(p.shown ?? 0)} on Walrus Memory · hidden ${hiddenKnown ? hidden : 'unknown'}${p.badge_names?.length ? ' · ' + x(p.badge_names.join(' · ')) : ''}</text>
  <rect x="80" y="460" width="1040" height="${lesson.length > 1 ? 84 : 56}" rx="10" fill="${T.card}"/>
  ${lesson.map((l, i) => `<text x="100" y="${496 + i * 30}" font-size="22" fill="${T.cardFg}">${x(l)}</text>`).join('\n  ')}
  <text x="80" y="606" font-size="16" fill="${T.ink3}">every call: hash committed on Sui before settlement · record on Walrus Memory (mainnet) · read through Tatum</text>
  <text x="1120" y="606" font-size="16" text-anchor="end" fill="${T.accentDeep}">${x(new Date(p.issued_ms ?? Date.now()).toISOString().slice(0, 10))}</text>
</svg>`;
}
