// sponsor — which passport transactions HELIX's gas sponsor may co-sign (P4-12).
//
// Pure predicate, same style as `sponsorRefusal` in memory/commit.ts: the integrator calls it from
// `sponsorRefusal` for transactions that are not a journal::commit, so the existing per-address
// daily cap, global hourly cap and "sponsor cannot be the sender" checks apply unchanged.
//
//   isSponsorablePassportCall(Transaction.from(b64).getData()) → null (allowed) | reason (refused)

import { normalizeSuiAddress } from '@mysten/sui/utils';

/** MIST. Measured on testnet (tx C61Q6o2q…, 7dnJmyEJ…): a claim costs 1M computation + 7.52M storage
 *  (2.67M rebated: it creates the passport and a registry entry); a refresh 1M + 3.28M (3.28M rebated).
 *  The budget must cover computation + storage before the rebate. */
export const PASSPORT_SPONSOR_GAS_BUDGET = 15_000_000;

const PKG = () => normalizeSuiAddress(process.env.PASSPORT_PACKAGE_ID ?? '0xe4241667de38a2df7c286a8f3fbbeeb481c3aed1adb4cf5a17e0337d2dd7f4e3');
const REG = () => normalizeSuiAddress(process.env.PASSPORT_REGISTRY_ID ?? '0x7c6acbeee7273c0c0ea60192811338ce1f08ab31f2a35536d815f5d9b6ec57a7');

/** Object id behind a PTB argument, whatever state the SDK left the input in. */
function inputObjectId(data: any, arg: any): string | null {
  if (arg?.$kind !== 'Input' && arg?.Input === undefined) return null;
  const inp = data?.inputs?.[arg.Input];
  const id = inp?.Object?.SharedObject?.objectId ?? inp?.Object?.ImmOrOwnedObject?.objectId ?? inp?.UnresolvedObject?.objectId ?? null;
  return id ? normalizeSuiAddress(id) : null;
}

/**
 * null when `txData` is exactly one `helix_passport::passport::claim` or `::refresh` call on the HELIX
 * registry with a gas budget within `PASSPORT_SPONSOR_GAS_BUDGET`; otherwise the reason to refuse.
 */
export function isSponsorablePassportCall(txData: any): string | null {
  const cmds: any[] = txData?.commands ?? [];
  const call = cmds[0]?.MoveCall;
  if (cmds.length !== 1 || !call) return 'HELIX only sponsors a single passport::claim or passport::refresh call';
  let pkg: string;
  try { pkg = normalizeSuiAddress(String(call.package)); } catch { return 'invalid package'; }
  if (pkg !== PKG() || call.module !== 'passport' || (call.function !== 'claim' && call.function !== 'refresh'))
    return 'HELIX only sponsors gas for helix_passport::passport::claim and ::refresh';
  if (call.typeArguments?.length) return 'unexpected type arguments';
  const args: any[] = call.arguments ?? [];
  const regArg = call.function === 'claim' ? args[0] : args[1];
  if (args.length !== (call.function === 'claim' ? 4 : 5)) return 'unexpected argument count';
  if (inputObjectId(txData, regArg) !== REG()) return 'not the HELIX passport registry';
  const budget = Number(txData?.gasData?.budget ?? Infinity);
  if (!Number.isFinite(budget) || budget > PASSPORT_SPONSOR_GAS_BUDGET) return 'sponsored gas budget too high';
  return null;
}
