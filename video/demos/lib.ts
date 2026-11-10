// Shared helpers for the HELIX demo video (VIDEO_PIPELINE.md). Everything recorded is the LIVE site.
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const APP = 'https://helix-app-fovn.onrender.com';
export const API = 'https://helix-compiler.onrender.com';
export const DEMO_NS = 'helix-v1-4d922636976d';
export const live: Record<string, any> = JSON.parse(readFileSync(new URL('./live.json', import.meta.url), 'utf8'));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Hold until `ms` have passed since `t0` (so a scene lasts as long as its narration). */
export const holdUntil = async (t0: number, ms: number) => { const left = t0 + ms - Date.now(); if (left > 0) await sleep(left); };

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">';
const BASE_CSS = `
  :root { --ink:#16140F; --bg:#F3F1EA; --gold:#C58A2A; --gold-b:#E0A53C; --card:#1A1822; --fg:#EDE7D7; --mut:#9A9384; --alive:#1F8F86; }
  * { box-sizing: border-box; } html, body { margin:0; height:100%; }
  body { background: radial-gradient(1200px 700px at 70% 20%, #24212F 0%, #16140F 60%); color: var(--fg); font-family: 'Hanken Grotesk', system-ui, sans-serif;
    display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .wrap { width: 1500px; }
  .kick { font: 500 20px/1 'JetBrains Mono', monospace; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); margin-bottom: 34px; opacity:0; animation: up .7s .1s forwards cubic-bezier(.2,.7,.2,1); }
  h1 { font: 400 112px/1.02 'Instrument Serif', Georgia, serif; letter-spacing: -.02em; margin: 0; }
  h1 .l { display:block; opacity:0; animation: up .9s forwards cubic-bezier(.2,.7,.2,1); }
  h1 em { color: var(--gold-b); font-style: italic; }
  .sub { margin-top: 36px; font: 400 34px/1.35 'Hanken Grotesk'; color: var(--mut); opacity:0; animation: up .8s forwards cubic-bezier(.2,.7,.2,1); }
  .strike { position: relative; display:inline-block; }
  .strike::after { content:''; position:absolute; left:-2%; top:54%; height:6px; width:0; background: var(--gold-b); border-radius:3px; animation: strike .5s forwards cubic-bezier(.6,0,.2,1); }
  .row { display:flex; gap: 18px; flex-wrap: wrap; margin-top: 46px; opacity:0; animation: up .8s forwards; }
  .pill { font: 500 22px/1 'JetBrains Mono'; padding: 14px 22px; border: 1px solid rgba(237,231,215,.18); border-radius: 100px; color: var(--fg); }
  .pill b { color: var(--gold-b); font-weight: 500; }
  @keyframes up { from { opacity:0; transform: translateY(26px); } to { opacity:1; transform:none; } }
  @keyframes strike { to { width: 104%; } }
`;

/** A full-screen title card in the landing page's language (Instrument Serif, ink, gold). */
export async function card(page: Page, html: string) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}</style></head><body><div class="wrap">${html}</div></body></html>`);
  await page.evaluate(() => (document as any).fonts.ready);
}

/** Move a range input smoothly from its value to `to` over `ms` (input events, like a hand on the slider). */
export async function slide(page: Page, sel: string, to: number, ms = 1600) {
  await page.evaluate(async ([sel, to, ms]) => {
    const s = document.querySelector(sel as string) as HTMLInputElement; if (!s) return;
    const from = Number(s.value), steps = Math.max(8, Math.round((ms as number) / 40));
    for (let k = 1; k <= steps; k++) {
      const e = k / steps, eased = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
      s.value = String(Math.round(from + ((to as number) - from) * eased));
      s.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
    }
  }, [sel, to, ms] as const);
}

/** Smooth-scroll so that `sel` sits `offset` px below the top of the viewport. */
export async function scrollToSel(page: Page, sel: string, offset = 120, ms = 900) {
  await page.evaluate(async ([sel, offset, ms]) => {
    const el = typeof sel === 'string' ? document.querySelector(sel) : null; if (!el) return;
    const y0 = window.scrollY, y1 = Math.max(0, el.getBoundingClientRect().top + window.scrollY - (offset as number));
    const t0 = performance.now();
    await new Promise<void>((done) => { const f = (t: number) => { const e = Math.min(1, (t - t0) / (ms as number)); const k = e < .5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2; window.scrollTo(0, y0 + (y1 - y0) * k); e < 1 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
  }, [sel, offset, ms] as const);
}
export async function scrollToY(page: Page, y: number, ms = 900) {
  await page.evaluate(async ([y1, ms]) => {
    const y0 = window.scrollY, t0 = performance.now();
    await new Promise<void>((done) => { const f = (t: number) => { const e = Math.min(1, (t - t0) / ms); const k = e < .5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2; window.scrollTo(0, y0 + (y1 - y0) * k); e < 1 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
  }, [y, ms] as const);
}

/** A small on-screen label (honesty notes such as "fresh test wallet · generated key"). */
export async function tag(page: Page, text: string, where: 'tl' | 'tr' | 'bl' | 'br' = 'br') {
  await page.evaluate(([text, where]) => {
    document.getElementById('hx-video-tag')?.remove();
    const d = document.createElement('div'); d.id = 'hx-video-tag'; d.textContent = text as string;
    const pos = { tl: 'top:18px;left:18px', tr: 'top:18px;right:18px', bl: 'bottom:18px;left:18px', br: 'bottom:18px;right:18px' }[where as string];
    d.style.cssText = `position:fixed;${pos};z-index:2147483646;font:500 15px/1.3 'JetBrains Mono',monospace;padding:9px 14px;border-radius:10px;background:rgba(22,20,15,.86);color:#EDE7D7;border:1px solid rgba(224,165,60,.5);pointer-events:none`;
    document.body.appendChild(d);
  }, [text, where] as const);
}

/** A terminal that types out REAL captured output (label in the corner says so). */
export async function terminal(page: Page, title: string, lines: { t: string; cls?: string; pause?: number }[], typeMs = 14) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
    body { margin:0; height:100vh; background: radial-gradient(1200px 700px at 70% 20%, #24212F 0%, #16140F 60%); display:flex; align-items:center; justify-content:center; font-family:'JetBrains Mono',monospace; }
    .win { width: 1560px; border-radius: 18px; background:#0F0E0B; border:1px solid rgba(237,231,215,.12); box-shadow: 0 40px 120px rgba(0,0,0,.5); overflow:hidden; }
    .bar { padding: 14px 18px; display:flex; gap:9px; align-items:center; border-bottom:1px solid rgba(237,231,215,.08); color:#9A9384; font-size:15px; }
    .dot { width:12px; height:12px; border-radius:50%; background:#3a362c; } .bar span { margin-left: 12px; }
    pre { margin:0; padding: 26px 30px 34px; font-size: 21px; line-height: 1.62; color:#EDE7D7; white-space: pre-wrap; word-break: break-all; min-height: 520px; }
    .p { color:#E0A53C; } .ok { color:#3fb5a9; } .warn { color:#E07A5F; } .mut { color:#8E8773; }
    .lbl { position:fixed; right:22px; bottom:18px; font-size:14px; color:#8E8773; letter-spacing:.06em; }
  </style></head><body><div class="win"><div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span>${title}</span></div><pre id="o"></pre></div><div class="lbl">recorded output · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div></body></html>`);
  await page.evaluate(() => (document as any).fonts.ready);
  for (const l of lines) {
    await page.evaluate(async ([t, cls, typeMs]) => {
      const o = document.getElementById('o')!, span = document.createElement('span');
      if (cls) span.className = cls as string; o.appendChild(span);
      for (let i = 0; i < (t as string).length; i += 2) { span.textContent = (t as string).slice(0, i + 2); await new Promise((r) => setTimeout(r, typeMs as number)); }
      o.appendChild(document.createTextNode('\n'));
    }, [l.t, l.cls ?? '', typeMs] as const);
    if (l.pause) await sleep(l.pause);
  }
}
