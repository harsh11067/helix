/* ============================================================
   HELIX — "Ask your memory" header button (P6). Tiny and eager: it only checks that the
   server has the feature on (GET /ask/suggestions) and adds the button next to the demo link.
   The panel itself (ask.js) is loaded with a dynamic import on the first click.
   ============================================================ */

/**
 * mountAskButton({ api, address: () => string|null, readOnly: () => boolean })
 * Renders nothing when the server has FEATURE_ASK off (the route 404s).
 */
export async function mountAskButton({ api, address, readOnly }) {
  let sugg = null;
  try { sugg = await api('/ask/suggestions'); } catch (e) { return null; }
  if (!sugg || !Array.isArray(sugg.questions)) return null;
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
