/* ============================================================
   HELIX — Conviction Artifacts field
   A slow 3D constellation of amber crystal/glass "conviction
   objects": one hero artifact (a probability network) plus
   supporting satellites (charts, text, sparse nodes), bound
   into a single living system by relationship lines.
   Intro choreography: ambient drift → magnetic gather →
   formation → calm reveal. Subtle cursor parallax throughout.
   ============================================================ */
(function () {
  const canvas = document.getElementById('hero-field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = 1;
  let pal = readPalette();
  let motion = 1;
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, f) => (cs.getPropertyValue(n).trim() || f);
    return {
      hi: g('--art-hi', '#F7DB94'), mid: g('--art-mid', '#D69A36'),
      lo: g('--art-lo', '#8F5C16'), edge: g('--art-edge', '#5A3A0C'),
      core: g('--art-core', '#FFEBB0'),
      dark: document.documentElement.getAttribute('data-theme') === 'dark'
    };
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return true;
  }

  // ---- helpers ----
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const range = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function hexLerp(h1, h2, t) {
    const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const a = p(h1), b = p(h2);
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  }

  // ---- crystal silhouette generator (irregular faceted gem) ----
  function makeShape(n, seedRot, jit) {
    const outer = [];
    for (let i = 0; i < n; i++) {
      const a = seedRot + (i / n) * Math.PI * 2;
      const rr = 0.84 + (Math.sin(i * 12.9 + seedRot * 7.3) * 0.5 + 0.5) * jit;
      outer.push({ a, x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    // table (top facet) shifted toward light (up-left), shrunk
    const table = outer.map(o => ({ x: o.x * 0.46 - 0.10, y: o.y * 0.46 - 0.12 }));
    return { outer, table };
  }

  // ---- artifact constellation (intentional, not scattered) ----
  // nx,ny normalized to hero box; depth 0(near)..1(far); content type
  const SPEC = [
    { id: 'hero',  nx: 0.685, ny: 0.50, depth: 0.12, r: 132, content: 'network', n: 11, jit: 0.30, rot: 0.35 },
    { id: 's1',    nx: 0.88,  ny: 0.22, depth: 0.46, r: 50,  content: 'netmini', n: 9,  jit: 0.34, rot: 1.2, blur: 2.4 },
    { id: 's2',    nx: 0.93,  ny: 0.66, depth: 0.30, r: 60,  content: 'bars',    n: 10, jit: 0.30, rot: 0.7 },
    { id: 's3',    nx: 0.535, ny: 0.74, depth: 0.22, r: 58,  content: 'bars',    n: 10, jit: 0.26, rot: 2.1 },
    { id: 's4',    nx: 0.81,  ny: 0.88, depth: 0.16, r: 66,  content: 'bars',    n: 11, jit: 0.32, rot: 0.2 },
    { id: 's5',    nx: 0.585, ny: 0.275,depth: 0.52, r: 36,  content: 'sparse',  n: 8,  jit: 0.30, rot: 1.7, blur: 2.0 },
    { id: 'f1',    nx: 0.92,  ny: 0.10, depth: 0.82, r: 46,  content: 'none',    n: 9,  jit: 0.30, rot: 0.9, blur: 6 },
    { id: 'f2',    nx: 0.49,  ny: 0.13, depth: 0.88, r: 30,  content: 'none',    n: 8,  jit: 0.28, rot: 2.4, blur: 7 }
  ];
  // relationships (the organism): propagation flows hero → satellites
  const LINKS = [
    ['hero', 's1'], ['hero', 's2'], ['hero', 's3'], ['hero', 's4'],
    ['hero', 's5'], ['s2', 's4'], ['s1', 's5']
  ];

  const arts = {};
  const HERO_CX = 0.685, HERO_CY = 0.50;   // orbital centre (the hero artifact)
  function build() {
    for (const s of SPEC) {
      const shape = makeShape(s.n, s.rot, s.jit);
      // dispersed start = pushed outward from composition centre
      const dx = (s.nx - HERO_CX), dy = (s.ny - HERO_CY);
      const orbR = Math.hypot(dx, dy);
      const orbBase = Math.atan2(dy, dx);
      arts[s.id] = {
        ...s, shape,
        dispX: s.nx + dx * 0.6 + (Math.random() - 0.5) * 0.06,
        dispY: s.ny + dy * 0.6 + (Math.random() - 0.5) * 0.06,
        orbR, orbBase,
        orbSpeed: s.id === 'hero' ? 0 : (0.020 + Math.random() * 0.030) * (Math.random() < 0.5 ? 1 : -1),
        orb3d: Math.random() * Math.PI * 2,        // phase for depth oscillation
        flat: 0.62,                                 // ellipse flattening (3D tilt)
        wob: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.06,
        rotNow: s.rot,
        appear: s.id === 'hero' ? 0.0 : 0.10 + s.depth * 0.30,
        nodes: s.content === 'network' ? heroNodes() : null,
        _x: 0, _y: 0, _R: 0, _eDepth: s.depth
      };
    }
  }
  function heroNodes() {
    // a small probability network inside the hero artifact
    const pts = [
      [0.00, -0.34], [-0.30, -0.10], [0.32, -0.16], [-0.18, 0.22],
      [0.22, 0.26], [0.04, 0.02], [-0.34, 0.34], [0.40, 0.10], [0.10, 0.40]
    ];
    const edges = [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [1, 6], [2, 7], [4, 8], [3, 6], [0, 2]];
    return { pts, edges };
  }

  // ---- intro timeline ----
  let introT = reduce ? 1 : 0;
  let started = reduce;            // begins on boot hand-off
  let orbT = 0;                    // orbital clock (advances post-settle)
  const INTRO_DUR = 2.7; // seconds
  window.addEventListener('helix:boot', () => { started = true; });

  // ---- content drawers (clipped inside the table region) ----
  function drawNetwork(o, R, t, reveal) {
    const nd = o.nodes;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // edges
    ctx.lineWidth = Math.max(0.6, R * 0.012);
    for (let i = 0; i < nd.edges.length; i++) {
      const e = nd.edges[i];
      const k = clamp((reveal - i / nd.edges.length) * 2.2, 0, 1);
      if (k <= 0) continue;
      const a = nd.pts[e[0]], b = nd.pts[e[1]];
      ctx.globalAlpha = 0.5 * k;
      ctx.strokeStyle = pal.core;
      ctx.beginPath();
      ctx.moveTo(a[0] * R, a[1] * R);
      ctx.lineTo(lerp(a[0], b[0], k) * R, lerp(a[1], b[1], k) * R);
      ctx.stroke();
    }
    // nodes light up sequentially
    for (let i = 0; i < nd.pts.length; i++) {
      const p = nd.pts[i];
      const k = clamp((reveal - i / nd.pts.length) * 2.4, 0, 1);
      if (k <= 0) continue;
      const tw = 0.55 + 0.45 * Math.sin(t * 1.6 + i * 1.3);
      ctx.globalAlpha = (0.5 + 0.5 * tw) * k;
      const rad = R * (i === 5 ? 0.055 : 0.032) * (0.7 + 0.3 * k);
      ctx.fillStyle = pal.core;
      ctx.shadowColor = pal.hi; ctx.shadowBlur = R * 0.10 * tw;
      ctx.beginPath(); ctx.arc(p[0] * R, p[1] * R, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawBars(o, R, t, reveal) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = 5, bw = R * 0.13, gap = R * 0.07;
    const totalW = n * bw + (n - 1) * gap;
    const x0 = -totalW / 2, base = R * 0.34;
    const hs = [0.32, 0.55, 0.42, 0.74, 0.60];
    for (let i = 0; i < n; i++) {
      const k = clamp((reveal - i / n) * 2.2, 0, 1);
      const bh = R * 0.62 * hs[i] * k;
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = pal.core;
      ctx.fillRect(x0 + i * (bw + gap), base - bh, bw, bh);
    }
    ctx.restore();
  }
  function drawText(o, R, t, reveal) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lines = [0.9, 0.78, 0.85, 0.6, 0.72, 0.5];
    const lh = R * 0.13, y0 = -R * 0.28;
    for (let i = 0; i < lines.length; i++) {
      const k = clamp((reveal - i / lines.length) * 2.4, 0, 1);
      if (k <= 0) continue;
      ctx.globalAlpha = 0.34 * k;
      ctx.fillStyle = pal.core;
      const w = R * 0.66 * lines[i] * k;
      ctx.fillRect(-R * 0.30, y0 + i * lh, w, lh * 0.42);
    }
    ctx.restore();
  }
  function drawSparse(o, R, t, reveal) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pts = [[-0.18, -0.1], [0.12, 0.05], [-0.02, 0.2], [0.2, -0.14]];
    ctx.globalAlpha = 0.5 * reveal; ctx.strokeStyle = pal.core; ctx.lineWidth = R * 0.02;
    ctx.beginPath();
    pts.forEach((p, i) => { i ? ctx.lineTo(p[0] * R, p[1] * R) : ctx.moveTo(p[0] * R, p[1] * R); });
    ctx.stroke();
    pts.forEach(p => { ctx.globalAlpha = 0.7 * reveal; ctx.fillStyle = pal.core; ctx.beginPath(); ctx.arc(p[0] * R, p[1] * R, R * 0.028, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }

  // ---- draw a single faceted crystal ----
  const LX = -0.55, LY = -0.83; // light direction (up-left)

  // shared position + 3D-depth solver (orbit around the hero)
  function computePos(o, t) {
    const gather = easeIO(range(introT, 0.12, 0.62));
    let baseX = o.nx, baseY = o.ny, eDepth = o.depth;
    if (o.orbSpeed) {
      const ang = o.orbBase + orbT * o.orbSpeed;
      baseX = HERO_CX + o.orbR * Math.cos(ang);
      baseY = HERO_CY + o.orbR * Math.sin(ang) * o.flat;
      // depth oscillates as the satellite swings front/back → real 3D feel + draw order
      eDepth = clamp(o.depth + Math.sin(ang + o.orb3d) * 0.13, 0.04, 0.94);
    }
    const nx = lerp(o.dispX, baseX, gather);
    const ny = lerp(o.dispY, baseY, gather);
    const driftA = reduce ? 0 : (1 - eDepth);
    const wob = Math.sin(o.wob + t * 0.35) * 0.012 * driftA;
    const wob2 = Math.cos(o.wob * 1.3 + t * 0.27) * 0.010 * driftA;
    const par = (1 - eDepth) * 0.05 * motion;
    o._x = (nx + wob + (mouse.x - 0.5) * -par) * W;
    o._y = (ny + wob2 + (mouse.y - 0.5) * -par) * H;
    o._eDepth = eDepth;
    o._gather = gather;
  }

  function drawArtifact(o, t) {
    const gather = o._gather;
    const depth = o._eDepth;
    const px = o._x, py = o._y;

    const appearK = range(introT, o.appear, o.appear + 0.34);
    const scaleIn = o.id === 'hero' ? easeOut(range(introT, 0.0, 0.55)) : lerp(0.6, 1, gather);
    const breathe = reduce ? 1 : 1 + Math.sin(t * 0.8 + o.wob) * 0.012 * (1 - depth);
    const R = o.r * (1 - depth * 0.30) * scaleIn * breathe;
    o._R = R;
    const baseAlpha = clamp(1 - depth * 0.62, 0.28, 1) * appearK;
    if (baseAlpha <= 0.01) return;

    o.rotNow += o.spin * 0.016 * motion * (reduce ? 0 : 1);

    ctx.save();
    if (o.blur) { ctx.filter = `blur(${o.blur * (1 - gather * 0.4)}px)`; }
    ctx.translate(px, py);
    ctx.globalAlpha = baseAlpha;
    ctx.rotate(o.rotNow * 0.12);

    const S = o.shape;
    const oc = S.outer.map(p => ({ x: p.x * R, y: p.y * R }));
    const tb = S.table.map(p => ({ x: p.x * R, y: p.y * R }));

    // soft luminous halo behind (the "lit from within" glow)
    const halo = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.7);
    halo.addColorStop(0, hexLerp(pal.mid, '#000000', pal.dark ? 0.1 : 0.0).replace('rgb', 'rgba').replace(')', ',0.0)'));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.9);
    glow.addColorStop(0, withA(pal.mid, 0.28 * (1 - depth)));
    glow.addColorStop(1, withA(pal.mid, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // base fill (gives glassy body)
    ctx.beginPath(); polyPath(oc); ctx.closePath();
    const body = ctx.createLinearGradient(-R, -R, R, R);
    body.addColorStop(0, pal.hi); body.addColorStop(0.55, pal.mid); body.addColorStop(1, pal.lo);
    ctx.fillStyle = body; ctx.fill();

    // side facets (outer ring → table)
    const n = oc.length;
    for (let i = 0; i < n; i++) {
      const a = oc[i], b = oc[(i + 1) % n], c = tb[(i + 1) % n], d = tb[i];
      const mx = (a.x + b.x + c.x + d.x) / 4, my = (a.y + b.y + c.y + d.y) / 4;
      const len = Math.hypot(mx, my) || 1;
      const nrx = mx / len, nry = my / len;
      const lightDot = clamp(nrx * LX + nry * LY, -1, 1);
      const bright = clamp(0.40 + 0.60 * (lightDot * 0.5 + 0.5), 0, 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = hexLerp(pal.lo, pal.hi, bright);
      ctx.fill();
      // facet edge sheen
      ctx.globalAlpha = baseAlpha * 0.25;
      ctx.strokeStyle = withA(pal.core, 0.6); ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.globalAlpha = baseAlpha;
    }

    // table (top) facet — brightest, glassy
    ctx.beginPath(); polyPath(tb); ctx.closePath();
    const tg = ctx.createLinearGradient(-R * 0.4, -R * 0.5, R * 0.4, R * 0.4);
    tg.addColorStop(0, pal.core); tg.addColorStop(0.6, pal.hi); tg.addColorStop(1, pal.mid);
    ctx.fillStyle = tg; ctx.fill();

    // embedded financial content (clipped to outer)
    if (o.content !== 'none') {
      const reveal = o.id === 'hero' ? range(introT, 0.70, 1.0) : range(introT, 0.55, 0.9);
      const rv = reduce ? 1 : reveal;
      if (rv > 0.01) {
        ctx.save();
        ctx.beginPath(); polyPath(oc); ctx.closePath(); ctx.clip();
        ctx.globalAlpha = baseAlpha;
        if (o.content === 'network') drawNetwork(o, R, t, rv);
        else if (o.content === 'netmini') drawNetwork(o, R, t, rv);
        else if (o.content === 'bars') drawBars(o, R, t, rv);
        else if (o.content === 'text') drawText(o, R, t, rv);
        else if (o.content === 'sparse') drawSparse(o, R, t, rv);
        ctx.restore();
      }
    }
    if (!o.nodes && o.content === 'netmini') o.nodes = heroNodes();

    // crisp lit-edge highlight on outer (top-left arc)
    ctx.globalAlpha = baseAlpha * 0.9;
    ctx.lineWidth = Math.max(1, R * 0.02);
    for (let i = 0; i < n; i++) {
      const a = oc[i], b = oc[(i + 1) % n];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const len = Math.hypot(mx, my) || 1;
      const lightDot = (mx / len) * LX + (my / len) * LY;
      if (lightDot > 0.15) {
        ctx.strokeStyle = withA(pal.core, 0.85);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    // overall rim
    ctx.globalAlpha = baseAlpha * 0.4;
    ctx.strokeStyle = withA(pal.edge, 0.7); ctx.lineWidth = 1;
    ctx.beginPath(); polyPath(oc); ctx.closePath(); ctx.stroke();

    // specular glint
    ctx.globalAlpha = baseAlpha * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    const gx = -R * 0.34, gy = -R * 0.42;
    const sp = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 0.4);
    sp.addColorStop(0, withA('#ffffff', 0.8)); sp.addColorStop(1, withA('#ffffff', 0));
    ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(gx, gy, R * 0.4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function polyPath(pts) { pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); }
  function withA(hex, a) {
    if (hex[0] !== '#') return hex;
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ---- relationship lines (drawn behind artifacts) ----
  function drawLinks(t) {
    const reveal = reduce ? 1 : range(introT, 0.55, 0.9);
    if (reveal <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < LINKS.length; i++) {
      const A = arts[LINKS[i][0]], B = arts[LINKS[i][1]];
      if (!A || !B) continue;
      const k = clamp((reveal - i / LINKS.length * 0.5) * 1.6, 0, 1);
      if (k <= 0) continue;
      const depthFade = 1 - Math.max(A._eDepth, B._eDepth) * 0.6;
      // line grows from A toward B
      const ex = lerp(A._x, B._x, k), ey = lerp(A._y, B._y, k);
      ctx.globalAlpha = 0.16 * depthFade;
      ctx.strokeStyle = pal.mid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(A._x, A._y); ctx.lineTo(ex, ey); ctx.stroke();
      // travelling pulse (propagation) once settled
      if (introT >= 0.95 && !reduce) {
        const pp = ((t * 0.35) + i * 0.4) % 1;
        const cx = lerp(A._x, B._x, pp), cy = lerp(A._y, B._y, pp);
        const fade = Math.sin(pp * Math.PI);
        ctx.globalAlpha = 0.5 * fade * depthFade;
        ctx.fillStyle = pal.core; ctx.shadowColor = pal.hi; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }

  // ---- loop ----
  let last = performance.now();
  function frame(now) {
    const r = canvas.getBoundingClientRect();
    if (W === 0 || H === 0 || Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) resize();
    if (W === 0 || H === 0) { requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (started && introT < 1) introT = clamp(introT + dt / INTRO_DUR, 0, 1);
    // orbital clock eases in after the formation settles
    const orbGain = range(introT, 0.6, 1);
    if (!reduce) orbT += dt * orbGain;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    const t = now / 1000;

    ctx.clearRect(0, 0, W, H);
    // solve positions + effective depth, then sort far→near for correct overlap
    const all = Object.values(arts);
    for (const o of all) computePos(o, t);
    const order = all.sort((a, b) => b._eDepth - a._eDepth);
    drawLinks(t);
    for (const o of order) drawArtifact(o, t);

    requestAnimationFrame(frame);
  }

  // ---- events ----
  window.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = (e.clientX - r.left) / r.width;
    mouse.ty = (e.clientY - r.top) / r.height;
  });
  window.addEventListener('helix:theme', () => { pal = readPalette(); });
  window.addEventListener('helix:motion', e => { motion = e.detail; });
  window.addEventListener('load', resize);

  resize(); build(); requestAnimationFrame(frame);
})();
