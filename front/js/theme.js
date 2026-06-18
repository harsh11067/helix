/* HELIX — compact day/night toggle (light is the default brand identity) */
(function () {
  const tg = document.getElementById('theme-toggle');
  if (!tg) return;
  const pill = document.getElementById('tt-pill');
  const btns = Array.from(tg.querySelectorAll('button'));
  const root = document.documentElement;

  const current = () => root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

  function sync() {
    const c = current();
    btns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeVal === c)));
    if (pill) pill.style.transform = `translateX(${(c === 'dark' ? 1 : 0) * 30}px)`;
  }
  function set(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('helix-theme', theme); } catch (e) {}
    window.dispatchEvent(new Event('helix:theme'));
    sync();
  }
  btns.forEach(b => b.addEventListener('click', () => set(b.dataset.themeVal)));
  // stay in sync if theme is changed elsewhere (e.g. Tweaks)
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  sync();
})();
