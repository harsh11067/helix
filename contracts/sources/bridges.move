/// Thin Move-side interfaces to the off-chain Nautilus TEE workloads and the
/// Sui-stack data services (architecture.md §3, §4, §8). These modules hold the
/// on-chain verification + storage-pointer logic; the heavy compute lives in the
/// Phase 3 TypeScript agents. Kept together as one file of small modules.

/// compiler_bridge — verifies a Nautilus Compiler attestation before a strategy
/// is created, and enforces the front-running `valid_until` window (§11.3).
module helix::compiler_bridge {
    const EAttestationExpired: u64 = 900;
    const EBadAttestation: u64 = 901;

    /// A compiler attestation as surfaced to the chain. `payload_digest` binds
    /// the DNA/PTB the TEE signed; `signature` is checked against the published
    /// enclave key (verification is stubbed for dev — see plan.md TEE risk note).
    public struct CompilerAttestation has copy, drop, store {
        enclave_key_id: u8,
        payload_digest: vector<u8>,
        signature: vector<u8>,
        valid_until_epoch: u64,
    }

    public fun new_attestation(
        enclave_key_id: u8, payload_digest: vector<u8>, signature: vector<u8>, valid_until_epoch: u64,
    ): CompilerAttestation {
        CompilerAttestation { enclave_key_id, payload_digest, signature, valid_until_epoch }
    }

    /// Stub: checks signature non-emptiness + expiry. Replace with ed25519::verify
    /// against the published enclave key once Nautilus integration lands. See
    /// tee/src/shared/attestation.ts (MOCK_TEE). (CLAUDE.md §6)
    ///
    /// Verify an attestation is well-formed and not expired. Returns the signed
    /// payload digest for the caller to bind into the StrategyObject.
    public fun verify(att: &CompilerAttestation, current_epoch: u64): vector<u8> {
        assert!(!att.signature.is_empty() && !att.payload_digest.is_empty(), EBadAttestation);
        assert!(att.valid_until_epoch >= current_epoch, EAttestationExpired);
        att.payload_digest
    }

    /// Stub: signature non-emptiness + expiry only. Replace with ed25519::verify
    /// against the published enclave key when Nautilus integration lands. (CLAUDE.md §6)
    public fun is_valid(att: &CompilerAttestation, current_epoch: u64): bool {
        !att.signature.is_empty() && !att.payload_digest.is_empty() && att.valid_until_epoch >= current_epoch
    }
}

/// hedger_bridge — interface the Nautilus Hedging Agent uses to attest a hedge.
/// The actual Greeks push + tolerance check live in `portfolio_risk::update_greeks`
/// (gated by `HedgerCap`); this carries the attestation envelope.
module helix::hedger_bridge {
    public struct HedgeAttestation has copy, drop, store {
        payload_digest: vector<u8>,
        signature: vector<u8>,
    }
    public fun new_hedge_attestation(payload_digest: vector<u8>, signature: vector<u8>): HedgeAttestation {
        HedgeAttestation { payload_digest, signature }
    }
    public fun bytes(a: &HedgeAttestation): vector<u8> { a.signature }
    /// Stub: signature non-emptiness only. Replace with ed25519::verify against the
    /// published enclave key once Nautilus integration lands. See attestation.ts. (CLAUDE.md §6)
    public fun is_valid(a: &HedgeAttestation): bool {
        !a.signature.is_empty() && !a.payload_digest.is_empty()
    }
}

/// walrus_adapter — on-chain pointers to Walrus blobs (architecture.md §8).
/// Backtests, equity curves, lineage records and attestation archives live on
/// Walrus; the chain stores only content-addressed blob ids.
module helix::walrus_adapter {
    const EEmptyBlob: u64 = 910;

    public struct BlobRef has copy, drop, store {
        blob_id: vector<u8>, // Walrus content-address
        kind: u8,            // 0 backtest, 1 equity-curve, 2 lineage, 3 attestation-archive
        size_bytes: u64,
    }

    public fun new_blob_ref(blob_id: vector<u8>, kind: u8, size_bytes: u64): BlobRef {
        assert!(!blob_id.is_empty(), EEmptyBlob);
        BlobRef { blob_id, kind, size_bytes }
    }
    public fun blob_id(b: &BlobRef): vector<u8> { b.blob_id }
    public fun kind(b: &BlobRef): u8 { b.kind }
}

/// compose_adapter — composition wrappers for the mainnet liquidity/leverage
/// legs (deepbook_margin + iron_bank). Stubbed shapes; wired to the real
/// packages on mainnet (architecture.md §6.3).
module helix::compose_adapter {
    /// Describes a leverage/yield leg to be composed atomically in the deploy PTB.
    public struct ComposeLeg has copy, drop, store {
        venue: u8,        // 0 deepbook_margin, 1 iron_bank, 2 spot CLOB
        notional: u64,
        leverage_x100: u16,
    }
    public fun margin_leg(notional: u64, leverage_x100: u16): ComposeLeg {
        ComposeLeg { venue: 0, notional, leverage_x100 }
    }
    public fun iron_bank_leg(notional: u64): ComposeLeg {
        ComposeLeg { venue: 1, notional, leverage_x100: 100 }
    }
    public fun spot_leg(notional: u64): ComposeLeg {
        ComposeLeg { venue: 2, notional, leverage_x100: 100 }
    }
    public fun venue(l: &ComposeLeg): u8 { l.venue }
    public fun notional(l: &ComposeLeg): u64 { l.notional }
}
