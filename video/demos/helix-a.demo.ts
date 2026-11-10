// Part A: hook → Proof-of-Forecast → Conviction Canvas (live re-pricing) → a REAL sponsored commit from a
// brand-new test wallet (generated key, 0 SUI; signing happens in Node, labelled on screen; no fake popup).
import { test } from '@argo-video/cli';
import { withOverlay } from '@argo-video/cli';
import { Ed25519Keypair } from '../../tee/node_modules/@mysten/sui/dist/keypairs/ed25519/index.mjs';
import { APP, live, card, slide, scrollToSel, holdUntil, tag, sleep } from './lib';

test('helix-a', async ({ page, narration }) => {
  test.setTimeout(12 * 60_000);
  // ---- a fresh test wallet exposed through Wallet Standard (same bridge as the e2e harness)
  const kp = Ed25519Keypair.generate();
  const address = kp.toSuiAddress(), pub = Array.from(kp.getPublicKey().toSuiBytes());
  await page.exposeFunction('__helixSign', async (b64: string) => ({ bytes: b64, signature: (await kp.signTransaction(Uint8Array.from(Buffer.from(b64, 'base64')))).signature }));
  await page.exposeFunction('__helixSignMsg', async (b64: string) => ({ bytes: b64, signature: (await kp.signPersonalMessage(Uint8Array.from(Buffer.from(b64, 'base64')))).signature }));
  await page.addInitScript(({ address, pub }) => {
    const account = { address, publicKey: new Uint8Array(pub), chains: ['sui:testnet'], features: ['sui:signTransaction', 'sui:signPersonalMessage'] };
    const wallet = {
      version: '1.0.0', name: 'HELIX Test Wallet', chains: ['sui:testnet'], accounts: [account],
      icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=',
      features: {
        'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
        'standard:events': { version: '1.0.0', on: () => () => {} },
        'sui:signTransaction': { version: '2.0.0', signTransaction: async ({ transaction }: any) => (window as any).__helixSign(await transaction.toJSON()) },
        'sui:signPersonalMessage': { version: '1.0.0', signPersonalMessage: async ({ message }: any) => (window as any).__helixSignMsg(btoa(String.fromCharCode(...message))) },
      },
    };
    window.addEventListener('wallet-standard:app-ready', (e: any) => { try { e.detail.register(wallet); } catch {} });
    try { window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: ({ register }: any) => register(wallet) })); } catch {}
  }, { address, pub });

  // ---------------------------------------------------------------- hook
  await card(page, `<div class="kick">Total Recall · built on Sui</div><h1><span class="l">Every prediction market</span><span class="l" style="animation-delay:.3s">forgets <em>you</em>.</span></h1>`);
  await narration.startRecording(page);
  narration.mark('hook');
  let t0 = Date.now(), dur = narration.durationFor('hook');
  await sleep(Math.min(5200, dur * 0.48));
  await card(page, `<div class="kick">the easiest thing in the world to fake</div><h1><span class="l"><span class="strike" style="--d:0">Delete the losers.</span></span><span class="l" style="animation-delay:.35s"><span class="strike">Screenshot the winners.</span></span></h1>
    <style>.strike::after{animation-delay:1.6s}.l:nth-child(2) .strike::after{animation-delay:2.3s}</style>`);
  await holdUntil(t0, dur + 300);

  // ---------------------------------------------------------------- promise
  narration.mark('promise');
  t0 = Date.now(); dur = narration.durationFor('promise');
  await card(page, `<div class="kick">HELIX</div><h1><span class="l">Proof-of-<em>Forecast</em></span></h1>
    <div class="sub" style="animation-delay:.5s">A track record you can't fake: committed on Sui, remembered on Walrus Memory, verified through Tatum.</div>
    <div class="row" style="animation-delay:1.1s"><span class="pill"><b>${live.commits}</b> calls on Sui</span><span class="pill"><b>${live.audit_ok}/${live.audited}</b> re-verified on chain</span><span class="pill"><b>${live.memories}</b> memories · Walrus mainnet</span></div>`);
  await holdUntil(t0, dur + 200);

  // ---------------------------------------------------------------- canvas (demo trader, read-only)
  await page.goto(`${APP}/app.html?demo=1#/canvas`, { waitUntil: 'domcontentloaded' });
  narration.mark('canvas');
  t0 = Date.now(); dur = narration.durationFor('canvas');
  await page.waitForSelector('#compiled[data-ready="1"]', { timeout: 90_000 });
  await withOverlay(page, 'canvas', async () => {
  await sleep(600);
  await slide(page, '#s-dir', 82, 1500);
  await slide(page, '#s-conf', 88, 1100);
  await slide(page, '#s-vol', 78, 1100);
  await slide(page, '#s-cap', 30, 1800);
  await slide(page, '#s-cap', 5, 1400);
  await sleep(900);
  await scrollToSel(page, '#compiled', 40, 1200).catch(() => {});
  const voices = await page.evaluate(() => { const t = [...document.querySelectorAll('.section-title')].find((x) => /voices/i.test(x.textContent || '')); return t ? t.getBoundingClientRect().top + scrollY - 260 : null; });
  if (voices != null) await page.evaluate(async (y) => { const y0 = scrollY, t0 = performance.now(); await new Promise<void>((d) => { const f = (t: number) => { const e = Math.min(1, (t - t0) / 1100); scrollTo(0, y0 + (y - y0) * (1 - Math.pow(1 - e, 3))); e < 1 ? requestAnimationFrame(f) : d(); }; requestAnimationFrame(f); }); }, voices);
  await holdUntil(t0, dur + 300);
  });

  // ---------------------------------------------------------------- commit (fresh test wallet, gas sponsored)
  await page.goto(`${APP}/app.html#/canvas`, { waitUntil: 'domcontentloaded' });
  narration.mark('commit');
  t0 = Date.now(); dur = narration.durationFor('commit');
  await tag(page, `fresh test wallet · generated key ${address.slice(0, 6)}…${address.slice(-4)} · 0 SUI · real Sui testnet tx`, 'bl');
  await page.waitForSelector('#compiled[data-ready="1"]', { timeout: 90_000 });   // app + wallet SDK loaded
  for (let k = 0; k < 4 && /connect/i.test((await page.textContent('#wallet')) || ''); k++) {
    await page.click('#wallet');
    const item = await page.waitForSelector('.wpick-item[data-i]', { timeout: 6_000 }).catch(() => null);
    if (item) { await sleep(500); await item.click(); await page.waitForFunction(() => !/connect/i.test(document.querySelector('#wallet')?.textContent || ''), null, { timeout: 10_000 }).catch(() => {}); }
    else { await page.keyboard.press('Escape').catch(() => {}); await sleep(1500); }
  }
  await page.waitForSelector('#compiled[data-ready="1"]', { timeout: 90_000 });
  await tag(page, `fresh test wallet · generated key ${address.slice(0, 6)}…${address.slice(-4)} · 0 SUI · real Sui testnet tx`, 'bl');
  await slide(page, '#s-dir', 75, 900);
  await page.waitForFunction(() => { const b = document.querySelector('#commit') as HTMLButtonElement | null; return !!b && !b.disabled && !document.querySelector('#compiled')?.classList.contains('updating'); }, null, { timeout: 60_000 });
  await sleep(500);
  await scrollToSel(page, '#commit', 520, 800).catch(() => {});
  await sleep(300);
  await page.evaluate(() => (document.querySelector('#commit') as HTMLButtonElement).click());
  await page.waitForFunction(() => /Committed on Sui testnet|Not committed/.test(document.querySelector('#deploy-out')?.textContent || ''), null, { timeout: 120_000 }).catch(() => {});
  await scrollToSel(page, '#deploy-out', 380, 700).catch(() => {});
  await tag(page, `fresh test wallet · generated key ${address.slice(0, 6)}…${address.slice(-4)} · 0 SUI · gas sponsored by HELIX`, 'bl');
  await holdUntil(t0, Math.max(dur + 600, 4000));
});
