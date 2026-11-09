/* ============================================================
   HELIX — Judge Mode (pure, dependency-free; unit-tested in tistu/test)
   app.html?demo=1 loads the demo trader (DEMO_ADDRESS on the compiler, GET /demo)
   READ-ONLY: the Memory page and Canvas compiles use its Walrus memory, and nothing
   can be signed for it. A connected wallet always takes precedence.
   ============================================================ */

export const DEMO_BANNER = 'Viewing demo trader — read only';
const isAddr = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a);

/** True when the page was opened with ?demo=1 (or ?demo=true). */
export function demoRequested(search) {
  const v = new URLSearchParams(String(search ?? '').replace(/^\?/, '')).get('demo');
  return v === '1' || v === 'true';
}

/** The address whose memory the page shows: your wallet if connected, else the demo trader. */
export function viewingAddress(state) {
  if (state?.account?.address) return state.account.address;
  return isAddr(state?.demo) ? state.demo : null;
}

/** Read-only = showing the demo trader with no wallet connected (minting impossible). */
export function isReadOnly(state) {
  return !state?.account?.address && isAddr(state?.demo);
}

/** Link to the demo trader from anywhere (landing, header). */
export const demoHref = (route = 'memory') => `app.html?demo=1#/${route}`;
