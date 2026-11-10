// Part C: the Council (weights from memory, the allocator that paid and rejected) → the paid API (real captured
// 402 → pay on Sui → 200 output, typed out, labelled "recorded output") → Ask with cited blobs → Tatum Ops → outro.
import { test } from '@argo-video/cli';
import { readFileSync } from 'node:fs';
import { APP, live, card, terminal, scrollToY, holdUntil, sleep } from './lib';

const yOf = (page: any, finder: string) => page.evaluate((f: string) => {
  const el = f.startsWith('#') ? document.querySelector(f) : [...document.querySelectorAll('.section-title')].find((x) => new RegExp(f, 'i').test(x.textContent || ''));
  return el ? el.getBoundingClientRect().top + scrollY : null;
}, finder);

test('helix-c', async ({ page, narration }) => {
  test.setTimeout(12 * 60_000);
  await page.goto(`${APP}/app.html?demo=1#/council`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#council', { timeout: 90_000 });
  await page.waitForFunction(() => /weight/i.test(document.querySelector('#council')?.textContent || ''), null, { timeout: 60_000 }).catch(() => {});
  await sleep(2500);
  await narration.startRecording(page);

  // ---------------------------------------------------------------- council
  narration.mark('council');
  let t0 = Date.now(), dur = narration.durationFor('council');
  await sleep(Math.min(6500, dur * 0.45));
  const al = await yOf(page, 'allocator');
  if (al != null) await scrollToY(page, al - 120, 1600);
  await holdUntil(t0, dur + 300);

  // ---------------------------------------------------------------- paid API (real captured output)
  narration.mark('paid');
  t0 = Date.now(); dur = narration.durationFor('paid');
  const out = readFileSync(new URL('./pay-run.txt', import.meta.url), 'utf8').trim().split('\n');
  const short = (s: string) => s.replace(/request="[^"]+"/, 'request="…"').replace(/digest=(\w{10})\w+/, 'digest=$1…').replace(/(paid: )(\w{10})\w+ \((https:\/\/suiscan\.xyz\/testnet\/tx\/)\w+\)/, '$1$2… ($3$2…)').replace(/"owner":"0x(\w{6})\w+"/, '"owner":"0x$1…"');
  await terminal(page, 'agent → GET /credibility/helix-v1-4d922636976d (MPP on Sui)', [
    { t: '$ node scripts/pay-credibility.mjs helix-v1-4d922636976d', cls: 'p', pause: 300 },
    { t: short(out[0]), cls: 'warn', pause: 500 },
    { t: short(out[1]), cls: 'mut', pause: 200 },
    { t: short(out[2]), cls: 'ok', pause: 300 },
    { t: short(out[3]), cls: 'ok', pause: 200 },
    { t: short(out[4]), pause: 0 },
  ], 9);
  await holdUntil(t0, dur + 300);

  // ---------------------------------------------------------------- ask (answers cite the blobs they used)
  await page.goto(`${APP}/app.html?demo=1#/memory`, { waitUntil: 'domcontentloaded' });
  narration.mark('ask');
  t0 = Date.now(); dur = narration.durationFor('ask');
  let ask = await page.waitForSelector('#ask-open', { timeout: 20_000 }).catch(() => null);
  if (!ask) { await page.reload({ waitUntil: 'domcontentloaded' }); ask = await page.waitForSelector('#ask-open', { timeout: 25_000 }).catch(() => null); }
  await sleep(400);
  if (ask) await page.click('#ask-open');
  else await page.evaluate(async () => { const api = (p: string, b?: any) => fetch('https://helix-compiler.onrender.com' + p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : undefined).then((r) => r.json());
    const sugg = await api('/ask/suggestions').catch(() => ({ questions: ['When am I most overconfident?'] }));
    const m = await import('/js/ask.js' as any); m.openAskPanel({ api, address: '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884', readOnly: true, suggestions: sugg }); });
  await page.waitForSelector('[data-ask]', { timeout: 20_000 }).catch(() => {});
  await sleep(500);
  await page.click('[data-ask]').catch(() => {});
  await page.waitForFunction(() => /walruscan|·\s*\w{6}/i.test(document.querySelector('[data-out]')?.innerHTML || ''), null, { timeout: 45_000 }).catch(() => {});
  await holdUntil(t0, Math.max(dur + 1800, 5000));

  // ---------------------------------------------------------------- ops (every Sui call through Tatum)
  await page.goto(`${APP}/ops.html`, { waitUntil: 'domcontentloaded' });
  narration.mark('ops');
  t0 = Date.now(); dur = narration.durationFor('ops');
  await page.waitForSelector('[data-fullnode]', { timeout: 60_000 });
  await sleep(Math.min(4500, dur * 0.45));
  const tbl = await yOf(page, 'Every Sui call');
  if (tbl != null) await scrollToY(page, tbl - 160, 1300);
  await holdUntil(t0, dur + 300);

  // ---------------------------------------------------------------- outro
  narration.mark('outro');
  t0 = Date.now(); dur = narration.durationFor('outro');
  await card(page, `<div class="kick">HELIX · Proof-of-Forecast</div><h1><span class="l">A track record you</span><span class="l" style="animation-delay:.3s">can't <em>fake</em>.</span></h1>
    <div class="row" style="animation-delay:.9s"><span class="pill">helix-app-fovn.onrender.com</span><span class="pill">github.com/harsh11067/helix</span><span class="pill"><b>${live.audit_ok}/${live.audited}</b> audited via Tatum</span></div>
    <div class="sub" style="animation-delay:1.4s;font-size:26px">Sui testnet · Walrus Memory mainnet · Tatum gateway (GraphQL + gRPC) · DeepBook Predict</div>`);
  await holdUntil(t0, dur + 1500);
});
