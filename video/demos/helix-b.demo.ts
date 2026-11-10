// Part B: Walrus Memory (timeline with blob ids, calibration) → Time Machine replay → memory changes the next
// call (suggestion + the trader's own rule gate) → Passport (hidden count from chain, Verify ✓✓ via 2 Tatum interfaces).
import { test } from '@argo-video/cli';
import { withOverlay } from '@argo-video/cli';
import { APP, card, slide, scrollToSel, scrollToY, holdUntil, sleep } from './lib';

const yOf = (page: any, finder: string) => page.evaluate((f: string) => {
  const el = f.startsWith('#') ? document.querySelector(f) : [...document.querySelectorAll('.section-title')].find((x) => new RegExp(f, 'i').test(x.textContent || ''));
  return el ? el.getBoundingClientRect().top + scrollY : null;
}, finder);

test('helix-b', async ({ page, narration }) => {
  test.setTimeout(12 * 60_000);
  await page.goto(`${APP}/app.html?demo=1#/memory`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tm-range', { timeout: 120_000 });
  await sleep(2500);
  await page.waitForFunction(() => /timeline/i.test(document.body.textContent || ''), null, { timeout: 60_000 }).catch(() => {});
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(600);
  await narration.startRecording(page);

  // ---------------------------------------------------------------- memory
  narration.mark('memory');
  let t0 = Date.now(), dur = narration.durationFor('memory');
  await withOverlay(page, 'memory', async () => {
    await sleep(Math.min(4500, dur * 0.3));                       // "N memories on Walrus", the time machine, the suggestion
    const hm = await yOf(page, '#tm-fun');
    if (hm != null) await scrollToY(page, hm - 100, 2200);        // humility meter + Brier per voice
    await sleep(Math.min(4000, dur * 0.25));
    const vo = await yOf(page, '#tm-voices');
    if (vo != null) await scrollToY(page, vo - 120, 1600);
    await holdUntil(t0, dur + 200);
  });

  // ---------------------------------------------------------------- learn (Time Machine)
  narration.mark('learn');
  t0 = Date.now(); dur = narration.durationFor('learn');
  const tmY = await yOf(page, '#tm');
  if (tmY != null) await scrollToY(page, tmY - 90, 900);
  await page.click('#tm-play').catch(() => {});
  await holdUntil(t0, Math.max(dur + 400, 10_800));             // the replay spans ~10 s

  // ---------------------------------------------------------------- effect (suggestion + rule gate on the Canvas)
  await page.goto(`${APP}/app.html?demo=1#/canvas`, { waitUntil: 'domcontentloaded' });
  narration.mark('effect');
  t0 = Date.now(); dur = narration.durationFor('effect');
  await page.waitForSelector('#compiled[data-ready="1"]', { timeout: 90_000 });
  await Promise.all([slide(page, '#s-dir', 85, 900), slide(page, '#s-conf', 92, 900)]);
  await slide(page, '#s-vol', 80, 700);
  await page.evaluate(() => { const s = document.querySelector('#s-hor') as HTMLInputElement; s.value = '1'; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => /binds this call/i.test(document.querySelector('#compiled')?.textContent || ''), null, { timeout: 12_000 }).catch(() => {});
  await sleep(500);
  const memY = await yOf(page, 'memory');
  if (memY != null) await scrollToY(page, memY - 140, 1100);
  await sleep(Math.max(1500, dur * 0.35));
  const gateY = await yOf(page, '#rules-gate');
  if (gateY != null) await scrollToY(page, gateY - 380, 1200);
  await holdUntil(t0, dur + 400);

  // ---------------------------------------------------------------- passport (verify ✓✓)
  await page.goto(`${APP}/passport.html?id=helix-v1-4d922636976d`, { waitUntil: 'domcontentloaded' });
  narration.mark('passport');
  t0 = Date.now(); dur = narration.durationFor('passport');
  await page.waitForSelector('#verify-all', { timeout: 90_000 });
  await sleep(Math.min(4200, dur * 0.25));
  const va = await yOf(page, '#verify-all');
  if (va != null) await scrollToY(page, va - 90, 1200);
  await page.click('#verify-all');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-verify-out]')].filter((x) => /✓✓/.test(x.textContent || '')).length >= 4, null, { timeout: 30_000 }).catch(() => {});
  await holdUntil(t0, dur + 900);
});
