/// On-chain commit–reveal journal for paper convictions (Total Recall "Commit mode").
///
/// A trader commits `sha256(canonical CONVICTION text)` together with the DeepBook
/// Predict market it is about and that market's expiry, BEFORE the market settles.
/// The event is public and timestamped by the Sui clock, so a record built from these
/// events cannot be backdated (expiry must be in the future at commit time) or
/// cherry-picked (every commit by an address is enumerable). The plaintext lives in
/// Walrus Memory; anyone can re-hash it and compare.
///
/// Stateless by design: no objects, no capabilities — an additive, upgrade-compatible
/// module that costs only gas.
module helix::journal;

use sui::clock::Clock;
use sui::event;

/// The committed expiry is not strictly in the future.
const EExpiryNotInFuture: u64 = 0;
/// The hash is not a 32-byte digest.
const EInvalidHashLength: u64 = 1;

const HASH_LENGTH: u64 = 32;

/// Emitted once per commit. Identity: the package version that first defined this module.
public struct ConvictionCommitted has copy, drop {
    owner: address,
    hash: vector<u8>,
    oracle: address,
    expiry_ms: u64,
    committed_ms: u64,
}

/// Commit to a conviction about `oracle` (a Predict market id) settling at `expiry_ms`.
public fun commit(
    hash: vector<u8>,
    oracle: address,
    expiry_ms: u64,
    clock: &Clock,
    ctx: &TxContext,
) {
    let now = clock.timestamp_ms();
    assert!(expiry_ms > now, EExpiryNotInFuture);
    assert!(hash.length() == HASH_LENGTH, EInvalidHashLength);
    event::emit(ConvictionCommitted {
        owner: ctx.sender(),
        hash,
        oracle,
        expiry_ms,
        committed_ms: now,
    });
}

// === Event accessors ===

public fun owner(e: &ConvictionCommitted): address { e.owner }

public fun hash(e: &ConvictionCommitted): vector<u8> { e.hash }

public fun oracle(e: &ConvictionCommitted): address { e.oracle }

public fun expiry_ms(e: &ConvictionCommitted): u64 { e.expiry_ms }

public fun committed_ms(e: &ConvictionCommitted): u64 { e.committed_ms }
