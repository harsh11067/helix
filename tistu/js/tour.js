/* HELIX — F9 guided tour: six short stops through the demo trader, for someone seeing HELIX for the first
   time. Opt-in (app.html?demo=1&tour=1, or "Take the 60-second tour" on the demo banner), skippable at any
   step, and once finished or dismissed it never reappears on its own. Pure step data + a tiny DOM card. */

export const TOUR_STEPS = [
  { route: '#/canvas', title: 'State a conviction', body: 'Move a slider: the call is priced live against DeepBook Predict on Sui and the payoff follows your hand. Five voices weigh in, and the demo trader’s own memory (and rules) change the suggestion.' },
  { route: '#/memory', title: 'Everything is remembered', body: 'Every call, outcome, calibration and lesson is a Walrus Memory record on mainnet, each with its blob id. Press ▶ Replay on the time machine to watch memory learn.' },
  { route: '#/memory', anchor: 'timeline', title: 'Losses are lessons', body: 'Scroll the timeline: every memory links to Walruscan and verifies on mainnet. Any loss has “↺ Rematch with memory’s size”.' },
  { route: '#/passport', title: 'A record you can’t fake', body: 'Counted from chain events, not our database. “Verify all” re-hashes each call in your browser and checks Sui through two Tatum interfaces (✓✓). “Freeze a signed copy on Walrus” makes a snapshot anyone can verify later.' },
  { route: '#/council', title: 'Agents with memory', body: 'Four agents commit with their own keys and memory; memory decides whose voice counts. An allocator agent pays (HTTP 402 on Sui) to read a human’s record before trusting it.' },
  { route: null, href: 'ops.html', title: 'Every Sui call through Tatum', body: 'The Ops panel counts every call at one chokepoint: GraphQL and gRPC, testnet and mainnet, the price witness — and zero direct fullnode calls. Or run tee/scripts/verify-all.mjs and check everything yourself.' },
];

const KEY = 'helix-tour-done';
const done = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
const markDone = () => { try { localStorage.setItem(KEY, '1'); } catch (e) {} };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The card for step i (pure, tested). */
export function tourCardHTML(i) {
  const s = TOUR_STEPS[i], last = i === TOUR_STEPS.length - 1;
  return `<div class="mono" style="font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-deep)">tour · ${i + 1} / ${TOUR_STEPS.length}</div>
    <div style="font-family:var(--serif);font-size:1.45rem;margin:6px 0 6px">${esc(s.title)}</div>
    <div style="font-size:13.5px;line-height:1.55;color:var(--ink-2)">${esc(s.body)}</div>
    <div class="row spread" style="margin-top:12px;gap:8px">
      <button class="btn-soft" data-tour="skip" style="padding:6px 12px;font-size:12.5px" data-cursor>${last ? 'Close' : 'Skip tour'}</button>
      ${last ? `<a class="btn-solid" href="${esc(s.href)}" data-tour="end" style="padding:7px 14px;font-size:12.5px;text-decoration:none" data-cursor>Open the Ops panel</a>`
        : `<button class="btn-solid" data-tour="next" style="padding:7px 14px;font-size:12.5px" data-cursor>Next →</button>`}</div>`;
}

/** Start the tour (explicit) or resume it from the URL (?tour=1). Never auto-starts after it was finished/skipped. */
export function startTour({ force = false } = {}) {
  if (!force && done()) return null;
  document.getElementById('hx-tour')?.remove();
  const card = document.createElement('div');
  card.id = 'hx-tour'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'HELIX guided tour');
  card.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9000;width:min(380px,calc(100vw - 32px));padding:18px 20px;border-radius:18px;background:var(--surface);border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);box-shadow:0 24px 60px -24px rgba(0,0,0,.35)';
  document.body.appendChild(card);
  let i = 0;
  const show = () => {
    const s = TOUR_STEPS[i];
    card.innerHTML = tourCardHTML(i);
    if (s.route && location.hash !== s.route) location.hash = s.route;
    if (s.anchor) setTimeout(() => {
      const t = [...document.querySelectorAll('.section-title')].find((x) => new RegExp(s.anchor, 'i').test(x.textContent || ''));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 900);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  card.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tour]'); if (!a) return;
    if (a.dataset.tour === 'next') { i = Math.min(i + 1, TOUR_STEPS.length - 1); show(); }
    else if (a.dataset.tour === 'skip') { markDone(); card.remove(); }
    else if (a.dataset.tour === 'end') markDone();
  });
  show();
  return card;
}
