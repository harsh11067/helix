/* HELIX — "intelligence matrix": a restrained living data grid behind Why Helix.
   Adapted from the background-boxes idea, but muted (gold / teal / faint violet),
   low-opacity, and ambient (no rainbow, no neon). */
(function () {
  const grid = document.getElementById('matrix-grid');
  const wrap = document.getElementById('matrix');
  if (!grid || !wrap) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CELL = 48;
  let cols = 0, rows = 0, cells = [];

  function tones() {
    const cs = getComputedStyle(document.documentElement);
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const a = dark ? 0.62 : 0.58;
    return [
      `rgba(214,154,54,${a})`,        // gold (dominant)
      `rgba(214,154,54,${a})`,
      `rgba(214,154,54,${a})`,
      `rgba(247,219,148,${a})`,       // light gold highlight
      `rgba(35,155,121,${a * 0.92})`, // teal (occasional)
      `rgba(110,91,214,${a * 0.62})`  // faint violet (rare)
    ];
  }
  let TONES = tones();
  window.addEventListener('helix:theme', () => { TONES = tones(); });

  function build() {
    const r = wrap.getBoundingClientRect();
    if (r.width < 2) return;
    cols = Math.ceil((r.width * 1.5) / CELL);
    rows = Math.ceil((r.height * 1.5) / CELL);
    cols = Math.min(cols, 40); rows = Math.min(rows, 26);
    grid.style.gridTemplateColumns = `repeat(${cols}, ${CELL}px)`;
    grid.style.gridTemplateRows = `repeat(${rows}, ${CELL}px)`;
    grid.innerHTML = '';
    cells = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < cols * rows; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      frag.appendChild(d);
      cells.push(d);
    }
    grid.appendChild(frag);
  }

  function pulse(idx, tone, hold) {
    const c = cells[idx];
    if (!c) return;
    c.style.background = tone;
    // fade back via CSS transition
    setTimeout(() => { if (c) c.style.background = 'transparent'; }, hold || 220);
  }

  let timer = null;
  function start() {
    if (reduce || cells.length === 0) return;
    stop();
    timer = setInterval(() => {
      // several independent twinkles each tick
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        pulse((Math.random() * cells.length) | 0, TONES[(Math.random() * TONES.length) | 0], 180 + Math.random() * 360);
      }
      // frequent short diagonal ripple (propagation across the lattice)
      if (Math.random() < 0.4 && cols > 6) {
        const start = (Math.random() * cells.length) | 0;
        const tone = TONES[(Math.random() * TONES.length) | 0];
        const dir = Math.random() < 0.5 ? (cols + 1) : (cols - 1);
        for (let s = 0; s < 6; s++) {
          const idx = start + s * dir;
          setTimeout(() => pulse(idx, tone, 260), s * 80);
        }
      }
    }, 300);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  build();
  // start only when the section is near view; pause when off-screen
  const io = new IntersectionObserver((es) => {
    es.forEach(e => e.isIntersecting ? start() : stop());
  }, { rootMargin: '120px' });
  io.observe(wrap);

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { build(); }, 250); });
})();
