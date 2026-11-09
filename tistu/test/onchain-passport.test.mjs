// On-chain passport control (P4): pure helpers + render states with a stub element (no browser, no network).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mountOnchainPassport, brierText, badgeList, passportIdFrom } from '../js/onchain-passport.js';

const A = '0x' + 'ab'.repeat(32);
const NS = 'helix-v1-4d922636976d';
const stubEl = () => ({ innerHTML: '', querySelectorAll: () => [], querySelector: () => ({ innerHTML: '' }) });
const tick = () => new Promise((r) => setTimeout(r, 0));

test('onchain passport: Brier from bps, never a number when unscored; badge bits', () => {
  assert.equal(brierText(1800, 12), 'Brier 0.18');
  assert.equal(brierText(10000, 0), 'not scored yet');
  assert.deepEqual(badgeList(1 | 8), ['Calibrated', 'Council Member']);
  assert.deepEqual(badgeList(0), []);
  assert.equal(passportIdFrom({ changed: [{ id: '0x1', type: '0x2::coin::Coin<0x2::sui::SUI>' }, { id: '0xp', type: '0xe424::passport::ForecasterPassport' }] }), '0xp');
  assert.equal(passportIdFrom({ changed: [] }), null);
});

test('onchain passport: renders nothing when the server has the feature off (404)', async () => {
  const el = stubEl();
  mountOnchainPassport(el, { api: async () => { const e = new Error('not found'); e.status = 404; throw e; }, address: A, ns: NS, signAndExecuteBytes: async () => ({}) });
  await tick(); await tick();
  assert.equal(el.innerHTML, '');
});

test('onchain passport: owner with a passport sees chain numbers, Suiscan link and Refresh; a viewer gets no buttons', async () => {
  const passport = { id: '0x' + '5'.repeat(64), owner: A, ns: NS, n_settled: 12, wins: 8, brier_bps: 1800, hidden: 0, badges: 3, version: 2, issued_ms: 1794237271717, url: '' };
  const api = async () => ({ enabled: true, passport, ns_matches: true });
  const el = stubEl();
  mountOnchainPassport(el, { api, address: A, ns: NS, signAndExecuteBytes: async () => ({}) });
  await tick(); await tick();
  assert.match(el.innerHTML, /<b class="mono">12<\/b> settled/);
  assert.match(el.innerHTML, /Brier 0\.18/);
  assert.match(el.innerHTML, /Calibrated/);
  assert.match(el.innerHTML, /Honest Loser/);
  assert.match(el.innerHTML, /suiscan\.xyz\/testnet\/object\/0x5{64}/);
  assert.match(el.innerHTML, /data-op="refresh"/);
  const viewer = stubEl();
  mountOnchainPassport(viewer, { api, address: null, owner: A, ns: NS, readOnly: true });
  await tick(); await tick();
  assert.doesNotMatch(viewer.innerHTML, /data-op=/);
});

test('onchain passport: no passport → Mint button for the owner only', async () => {
  const api = async () => ({ enabled: true, passport: null });
  const el = stubEl();
  mountOnchainPassport(el, { api, address: A, ns: NS, signAndExecuteBytes: async () => ({}) });
  await tick(); await tick();
  assert.match(el.innerHTML, /Mint on-chain passport/);
  const other = stubEl();
  mountOnchainPassport(other, { api, address: '0x' + 'cd'.repeat(32), owner: A, ns: NS, signAndExecuteBytes: async () => ({}) });
  await tick(); await tick();
  assert.doesNotMatch(other.innerHTML, /Mint on-chain passport/);
  assert.match(other.innerHTML, /No on-chain passport/);
});
