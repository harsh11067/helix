/* ============================================================
   HELIX — Use modes: one visual family, three motion grammars
   traders   → fast · directional · predictive
   builders  → modular · assembling · structured
   treasuries→ stable · heavy · measured
   ============================================================ */
(function () {
  const canvas = document.getElementById('uc-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, DPR = 1;

  const COPY = {
    traders: { h: 'For traders', p: 'Stop hand-building option legs. Move a few sliders to say what you believe, and watch the optimal structure compile against the live market — then bring it to life with one confirmation.' },
    builders: { h: 'For builders', p: 'Embed conviction-native markets into your app. Every strategy is an on-chain object with a verifiable record — composable, inspectable, and impossible to fake.' },
    treasuries: { h: 'For treasuries', p: 'Express a house view once and let it run. Living strategies monitor themselves, surface portfolio-wide risk in one picture, and flag breaches in plain language.' }
  };

  function pal() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, f) => cs.getPropertyValue(n).trim() || f;
    return {
      gold: g('--art-mid', '#D69A36'), goldHi: g('--art-hi', '#F7DB94'),
      bright: g('--accent-bright', '#E0A53C'), conv: g('--conv-bright', '#239B79'),
      faint: 'rgba(240,230,210,0.10)', faint2: 'rgba(240,230,210,0.05)'
    };
  }
  let P = pal();
  window.addEventListener('helix:theme', () => P = pal());

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    DPR = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return true;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  // ---------- TRADERS: fast scrolling trend + prediction cone + streaks ----------
  const traders = {
    series: [], streaks: [], phase: 0,
    init() {
      this.series = [];
      let y = 0.55;
      for (let i = 0; i < 64; i++) { y = clamp(y + (Math.random() - 0.46) * 0.05, 0.2, 0.85); this.series.push(y); }
      this.streaks = [];
      for (let i = 0; i < 14; i++) this.streaks.push({ x: Math.random(), y: 0.1 + Math.random() * 0.5, v: 0.5 + Math.random() * 0.8, len: 0.05 + Math.random() * 0.09 });
    },
    step(dt) {
      this.phase += dt * 2.0;
      if (this.phase >= 1) {
        const n = Math.floor(this.phase); this.phase -= n;
        let y = this.series[this.series.length - 1];
        for (let k = 0; k < n; k++) { y = clamp(y + (Math.random() - 0.44) * 0.06, 0.18, 0.86); this.series.push(y); this.series.shift(); }
      }
      for (const s of this.streaks) { s.x += s.v * dt; if (s.x > 1.15) { s.x = -0.15; s.y = 0.1 + Math.random() * 0.5; s.v = 0.5 + Math.random() * 0.8; } }
    },
    draw() {
      const n = this.series.length, padX = W * 0.08, w = W * 0.74;
      // streaks (fast directional)
      for (const s of this.streaks) {
        const x = s.x * W, y = s.y * H;
        const grd = ctx.createLinearGradient(x - s.len * W, y, x, y);
        grd.addColorStop(0, 'rgba(224,165,60,0)'); grd.addColorStop(1, P.bright);
        ctx.strokeStyle = grd; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - s.len * W, y); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // trend line
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const t = (i - this.phase) / (n - 1);
        const x = padX + t * w, y = (1 - this.series[i]) * H * 0.58 + H * 0.06;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = P.gold; ctx.lineWidth = 2; ctx.globalAlpha = 0.9; ctx.stroke();
      // fill under
      ctx.lineTo(padX + w, H); ctx.lineTo(padX, H); ctx.closePath();
      const fg = ctx.createLinearGradient(0, 0, 0, H);
      fg.addColorStop(0, 'rgba(214,154,54,0.16)'); fg.addColorStop(1, 'rgba(214,154,54,0)');
      ctx.fillStyle = fg; ctx.globalAlpha = 1; ctx.fill();
      // leading point + prediction cone (predictive)
      const ly = (1 - this.series[n - 1]) * H * 0.58 + H * 0.06, lx = padX + w;
      const slope = (this.series[n - 1] - this.series[n - 9]) * H * 0.58 / (8 / (n - 1) * w) * -1;
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = P.conv; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5;
      const proj = W * 0.16;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + proj, ly + slope * proj); ctx.stroke();
      // cone
      ctx.globalAlpha = 0.14; ctx.fillStyle = P.conv;
      ctx.beginPath(); ctx.moveTo(lx, ly);
      ctx.lineTo(lx + proj, ly + slope * proj - proj * 0.32);
      ctx.lineTo(lx + proj, ly + slope * proj + proj * 0.32); ctx.closePath(); ctx.fill();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1; ctx.fillStyle = P.goldHi; ctx.shadowColor = P.bright; ctx.shadowBlur = 12;
      ctx.beginPath(); arcHelper(lx, ly, 4); ctx.fill(); ctx.shadowBlur = 0;
    }
  };

  // ---------- BUILDERS: modules assemble into a structured blueprint lattice ----------
  const builders = {
    mods: [], t: 0, cycle: 0,
    init() {
      this.mods = []; this.t = 0; this.cycle = 0;
      const cols = 4, rows = 3, mw = 0.118, mh = 0.115, gx = 0.052, gy = 0.058;
      const totalW = cols * mw + (cols - 1) * gx, totalH = rows * mh + (rows - 1) * gy;
      const ox = 0.5 - totalW / 2, oy = 0.40 - totalH / 2;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const tx = ox + c * (mw + gx), ty = oy + r * (mh + gy);
        this.mods.push({ tx, ty, w: mw, h: mh, sx: Math.random() * 1.3 - 0.15, sy: ty + (Math.random() - 0.5) * 0.5, delay: (r * cols + c) * 0.07 + Math.random() * 0.08, x: 0, y: 0, a: 0 });
      }
    },
    step(dt) {
      this.t += dt * (reduce ? 0 : 1);
      if (this.t > 6.5) { this.t = 0; this.cycle++; for (const m of this.mods) { m.sx = Math.random() * 1.3 - 0.15; m.sy = m.ty + (Math.random() - 0.5) * 0.5; m.delay = Math.random() * 0.7; } }
    },
    draw() {
      const assembleEnd = 2.8;
      for (const m of this.mods) {
        const k = clamp((this.t - m.delay) / (assembleEnd - m.delay), 0, 1);
        const e = easeOut(k);
        m.x = lerp(m.sx, m.tx, e); m.y = lerp(m.sy, m.ty, e); m.a = k;
      }
      ctx.strokeStyle = P.conv; ctx.lineWidth = 1;
      for (let i = 0; i < this.mods.length; i++) for (let j = i + 1; j < this.mods.length; j++) {
        const a = this.mods[i], b = this.mods[j];
        const near = Math.abs(a.tx - b.tx) < 0.18 && Math.abs(a.ty - b.ty) < 0.20;
        if (!near) continue;
        const al = Math.min(a.a, b.a);
        if (al < 0.6) continue;
        ctx.globalAlpha = (al - 0.6) / 0.4 * 0.28;
        ctx.beginPath();
        ctx.moveTo((a.x + a.w / 2) * W, (a.y + a.h / 2) * H);
        ctx.lineTo((b.x + b.w / 2) * W, (b.y + b.h / 2) * H); ctx.stroke();
      }
      for (const m of this.mods) {
        const x = m.x * W, y = m.y * H, w = m.w * W, h = m.h * H;
        const a = clamp(m.a, 0, 1);
        ctx.globalAlpha = a * 0.14;
        const grd = ctx.createLinearGradient(x, y, x + w, y + h);
        grd.addColorStop(0, P.goldHi); grd.addColorStop(1, P.gold);
        ctx.fillStyle = grd; rr(x, y, w, h, 4); ctx.fill();
        ctx.globalAlpha = a * 0.55; ctx.strokeStyle = P.gold; ctx.lineWidth = 1.2;
        rr(x, y, w, h, 4); ctx.stroke();
        ctx.globalAlpha = a * 0.4; ctx.fillStyle = P.goldHi;
        rr(x + w * 0.16, y + h * 0.30, w * 0.5, h * 0.12, 2); ctx.fill();
        ctx.globalAlpha = a * 0.85; ctx.fillStyle = P.bright;
        ctx.beginPath(); arcHelper(x + w * 0.82, y + h * 0.36, Math.max(1.4, w * 0.04)); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  // ---------- TREASURIES: heavy, measured ballast + slow rings ----------
  const treasuries = {
    t: 0, bars: [0.34, 0.52, 0.44, 0.62, 0.40],
    init() { this.t = 0; },
    step(dt) { this.t += dt * (reduce ? 0 : 1); },
    draw() {
      const cx = W * 0.5, cy = H * 0.34;
      for (let i = 0; i < 3; i++) {
        const ph = (this.t * 0.18 + i / 3) % 1;
        const r = lerp(W * 0.09, W * 0.30, ph);
        ctx.globalAlpha = (1 - ph) * 0.22;
        ctx.strokeStyle = P.gold; ctx.lineWidth = 2;
        ctx.beginPath(); arcHelper(cx, cy, r); ctx.stroke();
      }
      const bob = Math.sin(this.t * 0.5) * H * 0.012;
      ctx.globalAlpha = 0.92;
      const mg = ctx.createRadialGradient(cx - 10, cy - 10 + bob, 4, cx, cy + bob, W * 0.1);
      mg.addColorStop(0, P.goldHi); mg.addColorStop(0.6, P.gold); mg.addColorStop(1, 'rgba(143,92,22,0.9)');
      ctx.fillStyle = mg; ctx.beginPath(); arcHelper(cx, cy + bob, W * 0.075); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = P.conv; ctx.setLineDash([2, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W * 0.14, cy + bob); ctx.lineTo(W * 0.86, cy + bob); ctx.stroke(); ctx.setLineDash([]);
      const n = this.bars.length, bw = W * 0.072, gap = W * 0.028;
      const tot = n * bw + (n - 1) * gap, x0 = cx - tot / 2, base = H * 0.62;
      for (let i = 0; i < n; i++) {
        const target = this.bars[i];
        const settle = (Math.sin(this.t * 0.4 + i * 0.9) * 0.5 + 0.5) * 0.06;
        const bh = (target - settle) * H * 0.34;
        const x = x0 + i * (bw + gap);
        ctx.globalAlpha = 0.82;
        const bg = ctx.createLinearGradient(0, base - bh, 0, base);
        bg.addColorStop(0, P.gold); bg.addColorStop(1, 'rgba(143,92,22,0.55)');
        ctx.fillStyle = bg; rr(x, base - bh, bw, bh, 3); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  function arcHelper(cx, cy, r) {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  const modes = { traders, builders, treasuries };
  let mode = 'traders';
  let switchT = 1;
  modes[mode].init();

  // ---- tabs ----
  const tabs = document.querySelectorAll('.uc-tab');
  const ucH = document.getElementById('uc-h'), ucP = document.getElementById('uc-p');
  const ucContainer = document.getElementById('uc-text-container');
  tabs.forEach(tab => tab.addEventListener('click', () => {
    const m = tab.dataset.uc; if (!m || m === mode) return;
    tabs.forEach(t => t.classList.remove('active')); tab.classList.add('active');
    
    // Smooth transition
    if (ucContainer) {
      ucContainer.classList.add('switching');
    }
    
    setTimeout(() => {
      if (ucH && COPY[m]) { ucH.textContent = COPY[m].h; ucP.textContent = COPY[m].p; }
      if (ucContainer) {
        ucContainer.classList.remove('switching');
      }
    }, 220);

    mode = m; modes[mode].init(); switchT = 0;
  }));

  // ---- loop ----
  let last = performance.now();
  function frame(now) {
    const r = canvas.getBoundingClientRect();
    if (W === 0 || H === 0 || Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) resize();
    if (W === 0 || H === 0) { requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    switchT = clamp(switchT + dt * 2.4, 0, 1);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    if (!modes[mode]) return;
    modes[mode].step(dt);
    ctx.save();
    ctx.globalAlpha = easeOut(switchT);
    modes[mode].draw();
    ctx.restore();
    requestAnimationFrame(frame);
  }
  window.addEventListener('load', resize);
  resize(); requestAnimationFrame(frame);
})();
