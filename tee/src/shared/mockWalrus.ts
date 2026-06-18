// mockWalrus — content-addressed blob store standing in for Walrus
// (architecture.md §8, plan Phase 3). Backtest reports and equity curves are
// stored here during dev; swapped for the real Walrus client before final.
import { sha256Hex } from './attestation.ts';

const store = new Map<string, string>();

export function put(data: unknown): string {
  const blob = typeof data === 'string' ? data : JSON.stringify(data);
  const blobId = sha256Hex(blob);
  store.set(blobId, blob);
  return blobId;
}

export function get(blobId: string): string | undefined {
  return store.get(blobId);
}

export function has(blobId: string): boolean {
  return store.has(blobId);
}
