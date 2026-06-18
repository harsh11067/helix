/* HELIX — boot / preloader: editorial system waking up, then hand off to hero reveal */
(function () {
  const boot = document.getElementById('boot');
  const body = document.body;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function handoff() {
    body.classList.remove('booting');
    body.classList.add('booted');
    window.dispatchEvent(new Event('helix:boot'));
  }
  if (!boot) { handoff(); return; }

  const fill = document.getElementById('boot-fill');
  const pct = document.getElementById('boot-pct');
  const lbl = document.getElementById('boot-lbl');
  const stages = [[0, 'initializing protocol'], [32, 'loading conviction engine'], [62, 'syncing market state'], [86, 'compiling strategies'], [100, 'ready']];

  let p = 0, done = false;
  function finish() {
    if (done) return; done = true;
    boot.classList.add('done');
    handoff();
    setTimeout(() => { try { boot.remove(); } catch (e) {} }, 900);
  }
  if (reduce) { if (fill) fill.style.width = '100%'; if (pct) pct.textContent = '100%'; setTimeout(finish, 200); return; }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const speed = p < 76 ? 68 : 34;                 // decelerate near the end
    p = Math.min(100, p + speed * dt + Math.random() * 0.5);
    if (fill) fill.style.width = p.toFixed(1) + '%';
    if (pct) pct.textContent = Math.floor(p) + '%';
    for (let i = stages.length - 1; i >= 0; i--) { if (p >= stages[i][0]) { if (lbl) lbl.textContent = stages[i][1]; break; } }
    if (p >= 100) { setTimeout(finish, 380); return; }
    requestAnimationFrame(tick);
  }
  setTimeout(() => requestAnimationFrame(tick), 560);  // brief hold so the wordmark draws in
  setTimeout(finish, 5200);                            // hard safety
})();
