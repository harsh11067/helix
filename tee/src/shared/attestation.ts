// MOCK_TEE: HMAC-SHA256 with published mock key. Structurally-correct attestation
// pattern; swap for AWS Nitro attestation doc + KMS-signed quote when enclave key
// is issued. Production-blocking, not demo-blocking. (CLAUDE.md §6)
//
// attestation — MOCK_TEE attestation signing/verification.
//
// In production the Compiler/Hedger run inside an AWS Nitro Enclave and emit a
// real attestation document verified on-chain. For local dev (plan.md TEE risk
// mitigation) we HMAC-sign the payload digest with a fixed enclave key and set
// `mock: true`. The on-chain `compiler_bridge::verify` checks the same shape
// (payload digest non-empty, signature non-empty, valid_until not expired).
import { createHash, createHmac } from 'node:crypto';
import type { Attestation } from './types.ts';

export const MOCK_TEE = process.env.HELIX_REAL_TEE !== '1';
const ENCLAVE_KEY = process.env.HELIX_ENCLAVE_KEY ?? 'helix-mock-enclave-key';
const ENCLAVE_KEY_ID = 1;

export function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function sign(payload: unknown, currentEpoch: number, ttlEpochs = 5): Attestation {
  const digest = sha256Hex(JSON.stringify(payload));
  const signature = createHmac('sha256', ENCLAVE_KEY).update(digest).digest('hex');
  return {
    enclaveKeyId: ENCLAVE_KEY_ID,
    payloadDigest: digest,
    signature,
    validUntilEpoch: currentEpoch + ttlEpochs,
    mock: MOCK_TEE,
  };
}

// Local mirror of compiler_bridge::verify — used by the indexer/hedger to
// sanity-check before submitting on-chain.
export function verify(att: Attestation, currentEpoch: number): boolean {
  if (!att.payloadDigest || !att.signature) return false;
  if (att.validUntilEpoch < currentEpoch) return false;
  const expected = createHmac('sha256', ENCLAVE_KEY).update(att.payloadDigest).digest('hex');
  return expected === att.signature;
}
