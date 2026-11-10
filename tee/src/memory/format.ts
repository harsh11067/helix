// format — the Walrus Memory record formats (TOTAL_RECALL.md §1, WIN_FEATURES.md §2).
//
// The serializer, parser and bucket helpers live in `records.ts` (pure; also bundled for the browser so the
// Memory Time Machine replays with the server's own code). This module re-exports them and adds the
// Node-only part: hashed namespaces.

import { createHash } from 'node:crypto';

export * from './records.ts';

export const NS_PREFIX = process.env.MEMWAL_NAMESPACE_PREFIX ?? 'helix-v1';

/** Namespace names are public on-chain: never the raw address, only a short hash. */
export function namespaceFor(address: string, prefix = NS_PREFIX): string {
  const h = createHash('sha256').update(String(address).trim().toLowerCase()).digest('hex');
  return `${prefix}-${h.slice(0, 12)}`;
}
export const REGISTRY_NS = `${NS_PREFIX}-registry`;
