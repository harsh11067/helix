// structures — enumerate candidate option structures for a conviction.
// Always yields ≥5 candidates (test 3.5) spanning directional, vertical-spread
// and volatility (long/short) shapes, each priced against the SVI surface.
import type { Candidate, Conviction, Leg } from '../shared/types.ts';
import { Market } from '../shared/types.ts';
import { priceStructure } from '../shared/pricing.ts';
import { horizonYears, type MarketSnapshot } from '../shared/mockOracle.ts';

const round500 = (x: number) => Math.round(x / 500) * 500;

export function enumerateCandidates(conv: Conviction, snap: MarketSnapshot): Candidate[] {
  const T = horizonYears(conv.horizonCode);
  const S = snap.spot;
  const atm = round500(S);
  const up1 = round500(S * 1.02);
  const up2 = round500(S * 1.05);
  const dn1 = round500(S * 0.98);
  const dn2 = round500(S * 0.95);
  // size so structure magnitudes scale with committed capital
  const q = Math.max(0.0001, (conv.capital / S) * 8);

  const defs: { name: string; market: number; legs: Leg[] }[] = [
    { name: 'Long Call', market: Market.CALL, legs: [{ type: 'call', strike: atm, qty: q }] },
    { name: 'Long Put', market: Market.PUT, legs: [{ type: 'put', strike: atm, qty: q }] },
    { name: 'Bull Call Spread', market: Market.SPREAD, legs: [
      { type: 'call', strike: atm, qty: q }, { type: 'call', strike: up2, qty: -q }] },
    { name: 'Bear Put Spread', market: Market.SPREAD, legs: [
      { type: 'put', strike: atm, qty: q }, { type: 'put', strike: dn2, qty: -q }] },
    { name: 'Long Straddle', market: Market.SPREAD, legs: [
      { type: 'call', strike: atm, qty: q }, { type: 'put', strike: atm, qty: q }] },
    { name: 'Short Strangle', market: Market.SPREAD, legs: [
      { type: 'call', strike: up1, qty: -q }, { type: 'put', strike: dn1, qty: -q }] },
    { name: 'Range Binary', market: Market.RANGE, legs: [
      { type: 'call', strike: dn1, qty: q }, { type: 'call', strike: up1, qty: -q }] },
  ];

  return defs.map((d) => ({
    name: d.name,
    marketCode: d.market,
    legs: d.legs,
    metrics: priceStructure(d.legs, S, snap.svi, T),
  }));
}
