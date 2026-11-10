/* ============================================================
   HELIX — "Ask your memory" header button (P6). Tiny and eager: it only checks that the
   server has the feature on (GET /ask/suggestions) and adds the button next to the demo link.
   The panel itself (ask.js) is loaded with a dynamic import on the first click.
   ============================================================ */

/**
 * mountAskButton({ api, address: () => string|null, readOnly: () => boolean })
 * Renders nothing when the server has FEATURE_ASK off (the route 404s).
 */
export async function mountAskButton({ api, address, readOnly, retryMs = 1500 }) {
  let sugg = null;
  // only a 404 means "feature off"; a slow or briefly unreachable server must not leave the header without the
  // button for the whole visit (seen while the service was busy), so other failures retry with backoff
  for (let k = 0; k < 4 && !sugg; k++) {
    try { sugg = await api('/ask/suggestions'); }
    catch (e) { if (e && e.status === 404) return null; if (k < 3) await new Promise((r) => setTimeout(r, retryMs * (k + 1))); }
  }
  if (!sugg) sugg = { questions: [] };                 // mount anyway: the panel loads and reports its own errors
  if (!Array.isArray(sugg.questions)) return null;
  const anchor = document.getElementById('demo-link');
  if (!anchor || document.getElementById('ask-open')) return null;
  const b = document.createElement('button');
  b.className = 'btn-soft'; b.id = 'ask-open'; b.type = 'button';
  b.setAttribute('data-cursor', '');
  b.title = 'Ask a question; the answer comes from Walrus Memory and cites the memories it used';
  b.textContent = 'Ask your memory';
  anchor.parentNode.insertBefore(b, anchor);
  let mod = null;
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      mod = mod || await import('./ask.js');
      mod.openAskPanel({ api, address: address(), readOnly: readOnly(), suggestions: sugg });
    } finally { b.disabled = false; }
  });
  return b;
}
