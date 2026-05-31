/* ============================================================
   HELIX — Hero artifact field (image-based)
   The amber conviction gems drift, orbit gently, breathe and
   parallax — the same living choreography as the original
   procedural field, now driven by the rendered gem sprites.
   The central crystal carries an additive glowing probability
   network that lights up and pulses.
   ============================================================ */
(function () {
  const stage = document.getElementById('hero-art');
  const frame = document.getElementById('hero-art-frame');
  if (!stage || !frame) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const IMG_W = 1672, IMG_H = 941;
  const C = [0.60, 0.48];               // composition centre (normalised in frame)

  // gem metadata (normalised home box within the frame) — area drives depth
  const META = [
    { id:0, cx:0.6181, cy:0.4766, area:151959 },
    { id:1, cx:0.8083, cy:0.7306, area:79325 },
    { id:2, cx:0.8394, cy:0.2322, area:26789 },
    { id:3, cx:0.4369, cy:0.5611, area:16427 },
    { id:4, cx:0.6950, cy:0.1185, area:12952 },
    { id:5, cx:0.9237, cy:0.4612, area:7538 },
    { id:6, cx:0.3932, cy:0.3560, area:7016 },
    { id:7, cx:0.4764, cy:0.1530, area:6722 },
    { id:8, cx:0.4943, cy:0.8050, area:5760 },
  ];
  const MAXA = 151959;

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const easeOut = t=>1-Math.pow(1-t,3);
  const easeIO = t=>t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const rand = (a,b)=>a+Math.random()*(b-a);

  const gems = [];
  for (const m of META) {
    const el = frame.querySelector(`.gem[data-id="${m.id}"]`);
    if (!el) continue;
    const depth = clamp(0.10 + (1 - Math.sqrt(m.area / MAXA)) * 0.70, 0.10, 0.74);
    gems.push({
      ...m, el, depth,
      ph: rand(0, Math.PI*2), ph2: rand(0, Math.PI*2), rotPh: rand(0, Math.PI*2),
      spd: rand(0.85, 1.2),
      orbBase: Math.atan2(m.cy - C[1], m.cx - C[0]) + rand(-0.4,0.4),
      orbSpeed: (m.id===0 ? 0.05 : rand(0.10,0.20)) * (Math.random()<0.5?1:-1),
      dispX: m.cx - C[0], dispY: m.cy - C[1],
      appear: 0.04 + (0.10 + (1 - Math.sqrt(m.area/MAXA))*0.70) * 0.34,
    });
  }
  const hero = gems.find(g=>g.id===0);

  // ---- network glow over the central crystal ----
  const netC = document.getElementById('gem-net');
  const nctx = netC ? netC.getContext('2d') : null;
  const NCX = 0.455, NCY = 0.555, NR = 0.205;   // network centre/scale within crystal box
  const NPTS = [
    [0.00,-0.34],[-0.30,-0.10],[0.32,-0.16],[-0.18,0.22],[0.22,0.26],
    [0.04,0.02],[-0.34,0.34],[0.40,0.10],[0.10,0.40]
  ];
  const NEDG = [[5,0],[5,1],[5,2],[5,3],[5,4],[1,6],[2,7],[4,8],[3,6],[0,2]];
  let netDPR = 1, netW = 0, netH = 0;

  // ---- frame sizing (cover) ----
  let FW = 0, FH = 0;
  function layout() {
    const r = stage.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const scale = Math.max(r.width / IMG_W, r.height / IMG_H);
    FW = IMG_W * scale; FH = IMG_H * scale;
    frame.style.width = FW + 'px';
    frame.style.height = FH + 'px';
    frame.style.left = (r.width - FW) / 2 + 'px';
    frame.style.top  = (r.height - FH) / 2 + 'px';
    // size the network canvas to the crystal box
    if (hero && netC) {
      const bw = hero.el.offsetWidth, bh = hero.el.offsetHeight;
      netDPR = Math.min(window.devicePixelRatio || 1, 2);
      netW = bw; netH = bh;
      netC.style.left = hero.el.style.left;
      netC.style.top = hero.el.style.top;
      netC.style.width = bw + 'px';
      netC.style.height = bh + 'px';
      netC.width = Math.round(bw * netDPR);
      netC.height = Math.round(bh * netDPR);
    }
  }

  // ---- intro / interaction ----
  let introT = reduce ? 1 : 0;
  let started = reduce;
  window.addEventListener('helix:boot', () => { started = true; });
  // fail-safe: if no boot event fires, start anyway
  setTimeout(() => { started = true; }, 1600);

  let motion = 1;
  window.addEventListener('helix:motion', e => { motion = e.detail; });
  const mouse = { x:0.5, y:0.5, tx:0.5, ty:0.5 };
  window.addEventListener('mousemove', e => {
    const r = stage.getBoundingClientRect();
    mouse.tx = clamp((e.clientX - r.left) / r.width, 0, 1);
    mouse.ty = clamp((e.clientY - r.top) / r.height, 0, 1);
  });

  function drawNet(t) {
    if (!nctx) return;
    nctx.setTransform(netDPR,0,0,netDPR,0,0);
    nctx.clearRect(0,0,netW,netH);
    const reveal = reduce ? 1 : easeOut(clamp((introT-0.55)/0.4,0,1));
    if (reveal <= 0.01) return;
    const cx = NCX*netW, cy = NCY*netH, R = NR*netW;
    nctx.globalCompositeOperation = 'lighter';
    // soft breathing core glow
    const pulse = 0.6 + 0.4*Math.sin(t*1.1);
    const glow = nctx.createRadialGradient(cx,cy,0,cx,cy,R*1.9);
    glow.addColorStop(0, `rgba(255,214,140,${0.22*reveal*pulse})`);
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    nctx.fillStyle = glow;
    nctx.beginPath(); nctx.arc(cx,cy,R*1.9,0,Math.PI*2); nctx.fill();
    // edges grow
    nctx.lineWidth = Math.max(0.8, R*0.012);
    for (let i=0;i<NEDG.length;i++){
      const k = clamp((reveal - i/NEDG.length)*2.2, 0, 1);
      if (k<=0) continue;
      const a=NPTS[NEDG[i][0]], b=NPTS[NEDG[i][1]];
      nctx.globalAlpha = 0.55*k;
      nctx.strokeStyle = '#FFE7AE';
      nctx.beginPath();
      nctx.moveTo(cx+a[0]*R, cy+a[1]*R);
      nctx.lineTo(cx+lerp(a[0],b[0],k)*R, cy+lerp(a[1],b[1],k)*R);
      nctx.stroke();
    }
    // nodes twinkle
    for (let i=0;i<NPTS.length;i++){
      const k = clamp((reveal - i/NPTS.length)*2.4, 0, 1);
      if (k<=0) continue;
      const p=NPTS[i];
      const tw = 0.55 + 0.45*Math.sin(t*1.7 + i*1.3);
      nctx.globalAlpha = (0.5+0.5*tw)*k;
      const rad = R*(i===5?0.060:0.034)*(0.7+0.3*k);
      nctx.fillStyle = '#FFEFC4';
      nctx.shadowColor = '#FFD46E'; nctx.shadowBlur = R*0.12*tw;
      nctx.beginPath(); nctx.arc(cx+p[0]*R, cy+p[1]*R, rad, 0, Math.PI*2); nctx.fill();
    }
    nctx.shadowBlur = 0; nctx.globalAlpha = 1;
  }

  let last = performance.now();
  function frameLoop(now) {
    const r = stage.getBoundingClientRect();
    if (Math.abs(r.width - (FW? r.width:0)) >= 0 && (FW===0 || Math.abs(frame.offsetHeight)<2)) {}
    if (FW === 0 || Math.abs(r.height - parseFloat(frame.style.height||0)) > 1 || Math.abs(r.width) < 2) layout();
    const dt = Math.min(0.05, (now-last)/1000); last = now;
    if (started && introT < 1) introT = clamp(introT + dt/1.6, 0, 1);
    mouse.x += (mouse.tx-mouse.x)*0.05;
    mouse.y += (mouse.ty-mouse.y)*0.05;
    const t = now/1000;

    let heroTransform = '';
    for (const g of gems) {
      const e = easeOut(clamp((introT - g.appear)/0.5, 0, 1));
      const dispX = g.dispX * FW * 0.5 * (1-e);
      const dispY = g.dispY * FH * 0.5 * (1-e);
      const dq = (1 - g.depth);
      const wobX = reduce?0:Math.sin(t*0.5*g.spd + g.ph)  * FW*0.012 * (0.4+0.6*dq);
      const wobY = reduce?0:Math.cos(t*0.42*g.spd + g.ph2) * FH*0.015 * (0.4+0.6*dq);
      const oa = t*g.orbSpeed + g.orbBase;
      const orbX = reduce?0:Math.cos(oa) * FW*0.012 * dq;
      const orbY = reduce?0:Math.sin(oa) * FH*0.018 * dq;
      const parX = (mouse.x-0.5) * -FW*0.05 * dq * motion;
      const parY = (mouse.y-0.5) * -FH*0.05 * dq * motion;
      const tx = wobX + orbX + parX + dispX;
      const ty = wobY + orbY + parY + dispY;
      const breathe = reduce?1:1 + Math.sin(t*0.8 + g.ph)*0.012*dq;
      const sc = lerp(0.72, 1, e) * breathe;
      const rot = reduce?0:Math.sin(t*0.22 + g.rotPh) * 2.2 * dq;
      const tf = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      g.el.style.transform = tf;
      g.el.style.opacity = clamp(e*1.05, 0, 1).toFixed(3);
      if (g.id === 0) heroTransform = tf;
    }
    if (netC) { netC.style.transform = heroTransform; netC.style.opacity = hero ? hero.el.style.opacity : 1; }
    drawNet(t);
    requestAnimationFrame(frameLoop);
  }

  window.addEventListener('load', layout);
  window.addEventListener('resize', layout);
  layout();
  requestAnimationFrame(frameLoop);
})();
