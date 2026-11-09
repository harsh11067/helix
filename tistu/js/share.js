/* ============================================================
   HELIX — share card + Walruscan links (pure, dependency-free; unit-tested in tistu/test)
   The card is a STANDALONE SVG (downloadable), so it uses literal colours taken
   from tistu/css/helix.css tokens instead of CSS variables.
   ============================================================ */

export const WALRUSCAN = 'https://walruscan.com/mainnet/blob/';
/** Verified 2026-11-09: renders our mainnet memory blob (size, Sui object id, epochs). */
export const walruscanBlobUrl = (blobId) => WALRUSCAN + encodeURIComponent(String(blobId ?? ''));

const T = { bg: '#F3F1EA', bg2: '#ECE8DD', ink: '#16140F', ink2: '#5B5648', ink3: '#8E8773', accent: '#C58A2A', accentDeep: '#9A6A18', alive: '#1F8F86', coral: '#C8553F', card: '#1A1822', cardFg: '#EDE7D7' };
const VOICES = [['you', 'You'], ['market', 'Predict market'], ['helix', 'HELIX model'], ['crowd', 'Polymarket crowd']];

export const xmlEscape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const fmtB = (b) => (b == null || !Number.isFinite(b) ? '—' : b.toFixed(2));

/** Wrap text into lines of at most `max` characters (word boundaries). */
export function wrap(text, max = 64, maxLines = 3) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,1}$/, '…');
  return lines;
}

/**
 * The share card (1200×630). `rec` = { namespace, n, wins, brier: {you,market,helix,crowd},
 * nCrowd, lesson, blobId, date }. Voices with no score show "—" (never a fabricated number).
 */
export function shareCardSVG(rec) {
  const n = Number(rec?.n ?? 0), wins = Number(rec?.wins ?? 0);
  const brier = rec?.brier ?? {};
  const scored = VOICES.filter(([k]) => brier[k] != null && Number.isFinite(brier[k]) && (k !== 'crowd' || (rec?.nCrowd ?? 0) >= 3));
  const best = n >= 3 && scored.length ? scored.slice().sort((a, b) => brier[a[0]] - brier[b[0]])[0][0] : null;
  const max = Math.max(0.5, ...scored.map(([k]) => brier[k]));
  const bars = VOICES.map(([k, label], i) => {
    const y = 250 + i * 62, b = brier[k], has = scored.some(([s]) => s === k);
    const w = has ? Math.max(6, (b / max) * 420) : 0;
    return `<text x="80" y="${y + 22}" font-size="24" fill="${T.ink2}">${xmlEscape(label)}</text>
  <rect x="330" y="${y}" width="420" height="30" rx="6" fill="${T.bg2}"/>
  ${has ? `<rect x="330" y="${y}" width="${w.toFixed(1)}" height="30" rx="6" fill="${k === best ? T.alive : T.accent}"/>` : ''}
  <text x="770" y="${y + 22}" font-size="24" font-family="ui-monospace,monospace" fill="${T.ink}">${has ? 'Brier ' + fmtB(b) : 'not scored'}${k === best ? '  ★' : ''}</text>`;
  }).join('\n  ');
  const lesson = rec?.lesson ? wrap(rec.lesson, 70, 2) : ['No lesson yet — HELIX writes one after 3 settled calls in a setup.'];
  const blob = String(rec?.blobId ?? '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Inter,Helvetica,Arial,sans-serif">
  <rect width="1200" height="630" fill="${T.bg}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${T.accent}"/>
  <text x="80" y="92" font-size="20" letter-spacing="4" fill="${T.ink3}">HELIX · WHO WAS RIGHT · WALRUS MEMORY (MAINNET)</text>
  <text x="80" y="160" font-size="58" font-family="Georgia,serif" fill="${T.ink}">${n} settled call${n === 1 ? '' : 's'} · won ${wins}</text>
  <text x="80" y="210" font-size="22" fill="${T.ink2}">Brier score per voice — lower is better calibrated${n < 3 ? ' (n &lt; 3: still noisy)' : ''}</text>
  ${bars}
  <rect x="80" y="505" width="1040" height="${lesson.length > 1 ? 64 : 40}" rx="10" fill="${T.card}"/>
  ${lesson.map((l, i) => `<text x="100" y="${532 + i * 26}" font-size="20" fill="${T.cardFg}">${xmlEscape(l)}</text>`).join('\n  ')}
  <text x="80" y="606" font-size="16" font-family="ui-monospace,monospace" fill="${T.ink3}">${xmlEscape(rec?.namespace ?? '')}${blob ? ' · blob ' + xmlEscape(blob) : ''}</text>
  <text x="1120" y="606" font-size="16" text-anchor="end" fill="${T.accentDeep}">${xmlEscape(rec?.date ?? '')}</text>
</svg>`;
}

/** X post intent tagging Tatum and the Walrus Foundation. */
export function xIntentUrl(rec, appUrl) {
  const n = Number(rec?.n ?? 0), wins = Number(rec?.wins ?? 0);
  const by = rec?.brier ?? {};
  const voice = n >= 3 && by.you != null && by.market != null
    ? ` My Brier ${fmtB(by.you)} vs the Predict market's ${fmtB(by.market)}.`
    : '';
  const text = `My HELIX record: ${n} settled BTC call${n === 1 ? '' : 's'}, won ${wins}.${voice} Every call, outcome and lesson lives on Walrus Memory (mainnet); every Sui call goes through Tatum. @Tatum_io @WalrusFoundation`;
  const p = new URLSearchParams({ text });
  if (appUrl) p.set('url', appUrl);
  return 'https://x.com/intent/post?' + p.toString();
}
