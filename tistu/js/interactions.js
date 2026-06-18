/* ============================================================
   HELIX — interactions
   ============================================================ */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- nav scrolled state ---- */
  const nav = document.querySelector('.nav');
  const onScroll = () => { if (nav) nav.classList.toggle('scrolled', window.scrollY > 24); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---- duplicate marquee content for seamless loop ---- */
  document.querySelectorAll('.marquee-track').forEach(tr => {
    tr.innerHTML += tr.innerHTML;
  });

  /* ---- scroll reveal ---- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---- custom cursor ---- */
  if (matchMedia('(hover:hover)').matches && !reduce) {
    const dot = document.createElement('div'); dot.className = 'cursor-dot';
    document.body.appendChild(dot);
    let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y;
    addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; dot.style.opacity = 1; });
    addEventListener('mouseleave', () => dot.style.opacity = 0);
    (function loop() {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      dot.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();
    const isInteractive = el => el.closest('a,button,.hx-range,.uc-tab,[data-cursor]');
    addEventListener('mouseover', e => dot.classList.toggle('ring', !!isInteractive(e.target)));
  }

  /* ============================================================
     CONVICTION CANVAS — live probability cone + compile readout
     ============================================================ */
  const cc = document.getElementById('cc');
  if (cc) {
    const sliders = {
      dir:  cc.querySelector('#s-dir'),
      conf: cc.querySelector('#s-conf'),
      hor:  cc.querySelector('#s-hor'),
      vol:  cc.querySelector('#s-vol')
    };
    const out = {
      dir: cc.querySelector('#v-dir'), conf: cc.querySelector('#v-conf'),
      hor: cc.querySelector('#v-hor'), vol: cc.querySelector('#v-vol'),
      struct: cc.querySelector('#o-struct'), structSub: cc.querySelector('#o-struct-sub'),
      win: cc.querySelector('#o-win'), profit: cc.querySelector('#o-profit'), loss: cc.querySelector('#o-loss')
    };
    const cone = {
      user: cc.querySelector('#cone-user'),
      mkt:  cc.querySelector('#cone-mkt'),
      med:  cc.querySelector('#cone-med'),
      now:  cc.querySelector('#cone-now')
    };
    const HOR = ['~1 hour', '~1 day', '~1 week', '~1 month'];
    const dirWord = d => d < -0.55 ? 'Strong bear' : d < -0.18 ? 'Bearish' : d <= 0.18 ? 'Neutral' : d < 0.55 ? 'Bullish' : 'Strong bull';
    const confWord = c => c < 0.3 ? 'Tentative' : c < 0.6 ? 'Moderate' : c < 0.85 ? 'Confident' : 'High conviction';
    const volWord = v => v < 0.3 ? 'Calm' : v < 0.6 ? 'Choppy' : v < 0.85 ? 'Volatile' : 'Explosive';

    const X0 = 36, X1 = 584, BASE = 168, VB_H = 300;

    function conePath(spread, slope) {
      // returns {upper, lower, median} path strings across X0..X1
      const steps = 24; let up = '', lo = '', md = '';
      for (let i = 0; i <= steps; i++) {
        const tt = i / steps;
        const x = X0 + (X1 - X0) * tt;
        const mid = BASE - slope * tt; // median drifts by slope
        const w = spread * Math.sqrt(tt); // cone widens ~sqrt(time)
        const u = mid - w, l = mid + w;
        up += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + u.toFixed(1) + ' ';
        md += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + mid.toFixed(1) + ' ';
        lo = (i ? 'L' : 'M') + x.toFixed(1) + ' ' + l.toFixed(1) + ' ' + lo;
      }
      return { fill: up + lo + 'Z', median: md };
    }

    function update() {
      const d = (+sliders.dir.value) / 100 * 2 - 1;   // -1..1
      const c = (+sliders.conf.value) / 100;           // 0..1
      const h = +sliders.hor.value;                    // 0..3
      const v = (+sliders.vol.value) / 100;            // 0..1

      out.dir.textContent = dirWord(d);
      out.conf.textContent = confWord(c);
      out.hor.textContent = HOR[h];
      out.vol.textContent = volWord(v);

      // cone geometry
      const slope = d * 118;
      const userSpread = 30 + (1 - c) * 70 + v * 64;
      const mktSpread = 64 + v * 30;
      const u = conePath(userSpread, slope);
      const m = conePath(mktSpread, slope * 0.35);
      cone.user.setAttribute('d', u.fill);
      cone.med.setAttribute('d', u.median);
      cone.mkt.setAttribute('d', m.fill);
      const endY = BASE - slope;
      cone.now.setAttribute('cy', BASE);
      cc.querySelector('#cone-end').setAttribute('cy', Math.max(14, Math.min(VB_H - 14, endY)));

      // structure selection
      let name, sub;
      const ad = Math.abs(d);
      if (ad < 0.2 && v > 0.55) { name = 'Volatility Range'; sub = 'range bet · mint via predict'; }
      else if (ad < 0.2) { name = 'Range Binary'; sub = 'binary · pinned to oracle'; }
      else if (d > 0) { name = c > 0.6 ? 'Bracketed Up' : 'Up-Range Binary'; sub = (c > 0.6 ? 'bracketed range' : 'binary') + ' · BTC up-range'; }
      else { name = c > 0.6 ? 'Bracketed Down' : 'Down-Range Binary'; sub = (c > 0.6 ? 'bracketed range' : 'binary') + ' · BTC down-range'; }
      if (v > 0.55 && ad >= 0.2 && c > 0.5) sub += ' + hedge leg';
      out.struct.textContent = name;
      out.structSub.textContent = sub;

      // win prob + P/L (illustrative, responsive)
      const win = Math.round(Math.max(41, Math.min(78, 50 + c * 20 + ad * 6 - v * 5)));
      out.win.textContent = win + '%';
      const cap = 1000;
      const profit = Math.round((cap * 0.02) + ad * 22 + c * 16 + v * 18);
      const loss = Math.round(6 + (1 - c) * 12 + v * 6);
      out.profit.textContent = '+' + profit + ' dUSDC';
      out.loss.textContent = '-' + loss + ' dUSDC';
    }
    Object.values(sliders).forEach(s => s && s.addEventListener('input', update));
    update();

    // autoplay nudge: gently sweep direction once on first reveal (then stop)
    let played = false;
    new IntersectionObserver((es) => {
      es.forEach(e => {
        if (e.isIntersecting && !played && !reduce) {
          played = true;
          const target = 64, start = +sliders.dir.value, t0 = performance.now();
          (function anim(now) {
            const k = Math.min(1, (now - t0) / 1100);
            const ease = 1 - Math.pow(1 - k, 3);
            sliders.dir.value = start + (target - start) * ease;
            update();
            if (k < 1) requestAnimationFrame(anim);
          })(t0);
        }
      });
    }, { threshold: 0.4 }).observe(cc);
  }

  /* ============================================================
     Use-modes: tab switching + per-mode motion live in usemodes.js
     ============================================================ */
})();
