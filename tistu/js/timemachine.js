/* ============================================================
   HELIX — Memory Time Machine (N1). A scrubber over timestamped memories: drag it back and the page
   re-renders from the memories that existed at that moment; press play and watch HELIX learn.
   The math is NOT reimplemented here: vendor/memory.js is the compiler's own records/calibration/rows
   modules, type-stripped (tistu/js/vendor/build-memory.mjs). Pure helpers are unit-tested in tistu/test.
   Shown only when the server has FEATURE_TIMEMACHINE on (GET /memory/:address/history, else 404).
   ============================================================ */
import { recordTs } from './vendor/memory.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** GET /memory/:address/history records → MemRecord shape the shared modules read (`f` = fields). */
export function toRecords(hist) {
  return (hist?.records || []).map(r => ({ type: r.type, version: 1, f: r.fields || {}, text: r.text || '', blob_id: r.blob_id, created_at: r.created_at }));
}

/** Distinct moments on the track, oldest first (one step per memory timestamp). */
export function stepsOf(records) {
  return [...new Set(records.map(recordTs))].sort((a, b) => a - b);
}
/** The instant step `i` replays: 0 = before the first memory; the last step = everything (Infinity → live state). */
export function atOfStep(steps, i) {
  if (i <= 0) return -Infinity;
  if (i >= steps.length) return Infinity;
  return steps[i - 1];
}
/** Position (0..1) of a timestamp on an index-based track: the first step at or after it. */
export function stepForTs(steps, ts) {
  const i = steps.findIndex(s => s >= ts);
  return i < 0 ? steps.length : i + 1;
}

export const tsLabel = (ts) => (ts == null || !Number.isFinite(ts) ? 'now' : new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');

/** The "current setup" the suggestion replays: the Canvas conviction if there is one, else the latest remembered one. */
export function setupFrom(state, hist, mem) {
  const c = state?.conv;
  if (c && mem) {
    return { bucket: mem.bucketKey(mem.dirWord(c.direction), c.confidence / 100, mem.volWord(c.volView)), commit: c.capital,
      p_you: mem.pYou(c.confidence), price: state.compile?.predict?.order?.ppcEst ?? null };
  }
  return hist?.setup ?? null;
}

export function suggestionHTML(st) {
  const s = st?.suggestion;
  if (!s) return `<span class="muted">No conviction to replay a suggestion for yet.</span>`;
  const pct = (p) => (p == null ? '—' : Math.round(p * 100) + '%');
  if (s.basis === 'no_history') return `for <span class="mono">${esc(s.bucket)}</span> at <b class="mono">${s.suggested}</b> dUSDC: memory had ${s.n} settled call${s.n === 1 ? '' : 's'} here — <span class="muted">not enough to change your size (needs 3)</span>`;
  const changed = Math.abs(s.suggested - (st.suggestion.commit ?? s.suggested)) >= 0.01;
  return `for <span class="mono">${esc(s.bucket)}</span>: memory suggests <b class="mono" style="color:var(--accent-deep)">${s.suggested}</b> dUSDC ${changed ? '' : ''}· posterior win rate ${pct(s.posterior)} · gap ${s.gap_you == null ? '—' : (s.gap_you >= 0 ? '+' : '') + Math.round(s.gap_you * 100) + ' pts'} · n=${s.n}`;
}

/** The scrubber panel markup. `moments` = [{ step, label }]. */
export function scrubberHTML(steps, moments, { title = 'memory time machine', id = 'tm' } = {}) {
  const N = steps.length;
  const marks = moments.map(m => `<span class="tm-mark" style="left:${(N ? m.step / N * 100 : 0).toFixed(2)}%" title="${esc(m.label)} · ${tsLabel(m.ts)}"></span>`).join('');
  return `<div class="panel tm reveal" id="${id}">
    <div class="row spread" style="gap:10px;flex-wrap:wrap"><div class="section-title" style="margin:0">${esc(title)}</div>
      <span class="badge mono" id="${id}-asof">as of now · n=—</span></div>
    <div class="tm-track"><input class="hx-range" type="range" id="${id}-range" min="0" max="${N}" step="1" value="${N}" aria-label="replay memories up to a moment" data-cursor/><div class="tm-marks">${marks}</div></div>
    <div class="row spread" style="gap:10px;flex-wrap:wrap;margin-top:8px">
      <div class="row" style="gap:8px"><button class="btn-soft" id="${id}-play" data-cursor type="button">▶ Replay</button><button class="btn-soft" id="${id}-now" data-cursor type="button">Now</button></div>
      <div class="muted mono" id="${id}-moment" style="font-size:11px">${N} memor${N === 1 ? 'y' : 'ies'} · ${moments.length} key moment${moments.length === 1 ? '' : 's'} marked · drag, or replay the whole span in ~10 s</div></div></div>`;
}

/**
 * Wire a rendered scrubber. `onStep(at, i)` re-renders the page for the instant `at` (seconds; ±Infinity).
 * Play runs the full span in `spanMs`. Returns { set(i), destroy() }.
 */
export function mountScrubber(root, steps, { onStep, moments = [], spanMs = 10_000, id = 'tm' } = {}) {
  const $ = (s) => root.querySelector(s);
  const range = $(`#${id}-range`), play = $(`#${id}-play`), now = $(`#${id}-now`), asof = $(`#${id}-asof`), momentEl = $(`#${id}-moment`);
  if (!range) return { set() {}, destroy() {} };
  const N = steps.length;
  let timer = null;
  const set = (i, { fromPlay = false } = {}) => {
    i = Math.max(0, Math.min(N, Math.round(i)));
    if (!fromPlay) stop();
    range.value = String(i);
    const at = atOfStep(steps, i);
    const st = onStep(at, i) || {};
    if (asof) asof.textContent = `as of ${i >= N ? 'now' : tsLabel(at)} · n=${st.n ?? '—'}`;
    const hit = moments.find(m => m.step === i);
    if (momentEl) momentEl.textContent = hit ? `★ ${hit.label}` : (i >= N ? 'live state — every memory counted' : i === 0 ? 'before the first memory' : `${i} of ${N} memories`);
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } if (play) play.textContent = '▶ Replay'; };
  const start = () => {
    stop();
    if (!N) return;
    let i = Number(range.value) >= N ? 0 : Number(range.value);
    set(i, { fromPlay: true });
    if (play) play.textContent = '❚❚ Pause';
    timer = setInterval(() => {
      if (!root.isConnected) return stop();
      i++;
      set(i, { fromPlay: true });
      if (i >= N) stop();
    }, Math.max(40, spanMs / Math.max(1, N)));
  };
  range.addEventListener('input', () => set(Number(range.value)));
  play?.addEventListener('click', () => (timer ? stop() : start()));
  now?.addEventListener('click', () => set(N));
  return { set, destroy: stop };
}
