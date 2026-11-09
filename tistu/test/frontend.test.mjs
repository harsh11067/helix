// Frontend logic tests (pure modules; no browser, no network):
//   node --test tistu/test/*.test.mjs
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { walruscanBlobUrl, shareCardSVG, xIntentUrl, xmlEscape, wrap } from '../js/share.js';
import { demoRequested, viewingAddress, isReadOnly, demoHref, DEMO_BANNER } from '../js/demo.js';

const A = '0x16a384bb220c70d4590425b14563118b7a05b5fa00dfe55757dba315663c8884';
const B = '0x527b492889b09497ac01122deb34eb62d514bcce24af3223614be3e76fd3b23c';

test('Walruscan link uses the verified mainnet blob URL format', () => {
  assert.equal(walruscanBlobUrl('lPennTeJyJcUTpCfz2WT3lAlBQVEbekX9b0U61L7Vek'),
    'https://walruscan.com/mainnet/blob/lPennTeJyJcUTpCfz2WT3lAlBQVEbekX9b0U61L7Vek');
  assert.ok(!walruscanBlobUrl('a/b?c').includes('/b?'), 'blob id is URL-encoded');
});

test('share card: Brier per voice, n, lesson, blob id; best voice starred; escapes XML', () => {
  const svg = shareCardSVG({
    namespace: 'helix-v1-4d922636976d', n: 6, wins: 2, nCrowd: 1,
    brier: { you: 0.36, market: 0.22, helix: 0.27, crowd: 0.1 },
    lesson: 'up/high/choppy: Won 2/6 here; stated confidence runs ~45 points hot. <Size down> & wait',
    blobId: 'lPennTeJyJcUTpCfz2WT3lAlBQVEbekX9b0U61L7Vek', date: '2026-11-09',
  });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /6 settled calls · won 2/);
  for (const s of ['Brier 0.36', 'Brier 0.22', 'Brier 0.27']) assert.ok(svg.includes(s), s);
  assert.match(svg, /Brier 0\.22  ★/, 'lowest Brier (market) is starred');
  assert.ok(!svg.includes('Brier 0.10'), 'crowd with n_crowd < 3 is not scored');
  assert.match(svg, /blob lPennTeJyJcUTpCfz2WT3lAlBQVEbekX9b0U61L7Vek/);
  assert.ok(svg.includes('&lt;Size down&gt; &amp; wait'), 'lesson text is XML-escaped');
  assert.ok(!svg.includes('var(--'), 'standalone SVG: no CSS variables');
});

test('share card is honest with no history', () => {
  const svg = shareCardSVG({ n: 0, wins: 0, brier: {} });
  assert.match(svg, /0 settled calls · won 0/);
  assert.equal((svg.match(/not scored/g) || []).length, 4);
  assert.ok(!svg.includes('★'));
  assert.match(svg, /No lesson yet/);
});

test('X intent tags @Tatum_io and @WalrusFoundation and is URL-encoded', () => {
  const u = new URL(xIntentUrl({ n: 6, wins: 2, brier: { you: 0.36, market: 0.22 } }, 'https://helix-app-fovn.onrender.com/app.html'));
  assert.equal(u.origin + u.pathname, 'https://x.com/intent/post');
  const text = u.searchParams.get('text');
  assert.match(text, /@Tatum_io/); assert.match(text, /@WalrusFoundation/);
  assert.match(text, /6 settled BTC calls, won 2/); assert.match(text, /Brier 0\.36 vs the Predict market's 0\.22/);
  assert.equal(u.searchParams.get('url'), 'https://helix-app-fovn.onrender.com/app.html');
  assert.ok(!/Brier/.test(new URL(xIntentUrl({ n: 1, wins: 1, brier: { you: 0.1, market: 0.2 } })).searchParams.get('text')), 'no Brier claim with n < 3');
});

test('helpers: xmlEscape and wrap', () => {
  assert.equal(xmlEscape(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  const lines = wrap('one two three four five six seven', 10, 2);
  assert.equal(lines.length, 2); assert.ok(lines.every((l) => l.length <= 11));
});

test('Judge Mode: ?demo=1 detection', () => {
  assert.equal(demoRequested('?demo=1'), true);
  assert.equal(demoRequested('demo=true&x=1'), true);
  assert.equal(demoRequested('?demo=0'), false);
  assert.equal(demoRequested(''), false);
  assert.equal(demoHref(), 'app.html?demo=1#/memory');
  assert.equal(DEMO_BANNER, 'Viewing demo trader — read only');
});

test('Judge Mode: wallet always wins; demo is read-only only without a wallet', () => {
  assert.equal(viewingAddress({ demo: A }), A);
  assert.equal(isReadOnly({ demo: A }), true);
  assert.equal(viewingAddress({ demo: A, account: { address: B } }), B, 'connected wallet takes precedence');
  assert.equal(isReadOnly({ demo: A, account: { address: B } }), false, 'minting enabled once a wallet connects');
  assert.equal(viewingAddress({ demo: 'not-an-address' }), null);
  assert.equal(isReadOnly({ demo: null }), false);
  assert.equal(viewingAddress({}), null);
});
