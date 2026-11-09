// assets/config — P5 multi-asset (LANES.md §3). Flag: FEATURE_ASSETS=1 (off → no routes, BTC-only as before).
//
// R1 follow-up (2026-11-09): DeepBook Predict v4 testnet lists ONE underlying. Every MarketCreated event
// (oldest 400 from 2026-09-12 and the newest 50) carries propbook_underlying_id = 1 (BTC), and the oracle
// registry holds exactly 1 source / 1 binding / 1 Block Scholes store. So ETH and SUI run in COMMIT mode,
// resolved by the Pyth price at expiry, with no Predict market voice.
//
// Pyth feed ids are from Hermes `GET /v2/price_feeds?query=…&asset_type=crypto` (Crypto.ETH/USD, Crypto.SUI/USD).

import { normalizeSuiAddress } from '@mysten/sui/utils';

export type Asset = 'BTC' | 'ETH' | 'SUI';
export type PythAsset = 'ETH' | 'SUI';
export const ASSETS: Asset[] = ['BTC', 'ETH', 'SUI'];

export const PYTH_FEEDS: Record<PythAsset, string> = {
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',   // Crypto.ETH/USD
  SUI: '0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744',   // Crypto.SUI/USD
};
export const ASSET_NAME: Record<Asset, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SUI: 'Sui' };

export const assetsEnabled = () => process.env.FEATURE_ASSETS === '1';
export const isPythAsset = (a: string): a is PythAsset => a === 'ETH' || a === 'SUI';
export function parseAsset(a: unknown): Asset | null {
  const s = String(a ?? '').trim().toUpperCase();
  return (ASSETS as string[]).includes(s) ? (s as Asset) : null;
}
/** The asset whose Pyth feed id is `x` (hex with or without 0x, or the journal oracle address). */
export function assetOfFeed(x: string | null | undefined): PythAsset | null {
  if (!x) return null;
  let a: string;
  try { a = normalizeSuiAddress(x.startsWith('0x') ? x : `0x${x}`); } catch { return null; }
  return (Object.entries(PYTH_FEEDS).find(([, f]) => f === a)?.[0] as PythAsset) ?? null;
}

// ---------------------------------------------------------------- Pyth sources
/** Pyth "Core compatible" on Sui testnet (docs.pyth.network/price-feeds/contract-addresses/sui). Wormhole-verified on-chain. */
export const PYTH_SUI_PACKAGE = process.env.PYTH_SUI_PACKAGE ?? '0xd1ac23e1582080e2e5d43dbad1cf463ea2337cdbbb1a9ca669e470cefb74d8fd';
export const PYTH_SUI_EVENT = `${PYTH_SUI_PACKAGE}::event::PriceFeedUpdateEvent`;
/** Hermes needs an API key for price updates (HTTP 401 without one, verified 2026-11-09); the feed list stays public. */
export const hermesBase = () => (process.env.PYTH_HERMES_URL ?? 'https://hermes.pyth.network').replace(/\/+$/, '');
export const hermesKey = () => process.env.PYTH_API_KEY?.trim() || null;
