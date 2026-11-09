/// HELIX Forecaster Passport: a soulbound, dynamic NFT that carries a forecaster's
/// calibration record (LANES.md §2, P4).
///
/// The record is computed off-chain by HELIX from Walrus Memory and the on-chain
/// `journal::commit` ledger, then signed with the HELIX attestation key (raw Ed25519
/// over the BCS bytes of `Attestation`). This module verifies that signature on-chain
/// with `sui::ed25519`, decodes the payload with `sui::bcs`, and mints or refreshes the
/// passport. Any protocol can read the passport through the public accessors below
/// (see `gate_example`).
///
/// Soulbound: `ForecasterPassport` has `key` but not `store`, so only this module can
/// transfer it, and this module never transfers it to anyone except its owner at mint.
/// Wallet transfers and PTB `TransferObjects` both need `store`, so they fail.
module helix_passport::passport;

use std::string::String;
use sui::bcs;
use sui::clock::Clock;
use sui::display;
use sui::dynamic_field as df;
use sui::ed25519;
use sui::event;
use sui::package;

// === Errors ===

/// `set_attestor` has not been called yet (the registry holds no public key).
const EAttestorNotSet: u64 = 0;
/// An Ed25519 public key must be 32 bytes.
const EBadPublicKey: u64 = 1;
/// The signature does not verify against the registry's attestor key (forged or tampered).
const EBadSignature: u64 = 2;
/// The attestation was issued for a different address.
const EOwnerMismatch: u64 = 3;
/// The attestation's `expires_ms` is not in the future.
const EExpired: u64 = 4;
/// Refresh with an attestation that is not strictly newer than the passport (rollback / replay).
const EStaleAttestation: u64 = 5;
/// Refresh with an attestation for a different memory namespace.
const ENamespaceMismatch: u64 = 6;
/// This address already holds a passport; use `refresh`.
const EAlreadyClaimed: u64 = 7;
/// The payload has bytes after the `Attestation` struct.
const EMalformedPayload: u64 = 8;

// === Badge bits (shared with the off-chain Passport, LANES.md §2) ===

const BADGE_CALIBRATED: u64 = 1;
const BADGE_HONEST_LOSER: u64 = 2;
const BADGE_CONTRARIAN: u64 = 4;
const BADGE_COUNCIL_MEMBER: u64 = 8;
const BADGE_MULTI_ASSET: u64 = 16;

// === Structs ===

/// One-time witness: claims the `Publisher` for `Display<ForecasterPassport>`.
public struct PASSPORT has drop {}

/// The passport. `key` only, no `store`: soulbound.
public struct ForecasterPassport has key {
    id: UID,
    owner: address,
    ns: String,
    n_settled: u64,
    wins: u64,
    brier_bps: u64,
    gap_bps: u64,
    gap_negative: bool,
    hidden: u64,
    badges: u64,
    issued_ms: u64,
    version: u64,
}

/// Shared. Holds the attestor's Ed25519 public key; `version` counts key changes.
/// Each claimed owner is recorded as a dynamic field (`ClaimKey(owner) -> passport ID`),
/// so an address holds at most one passport.
public struct AttestorRegistry has key {
    id: UID,
    pubkey: vector<u8>,
    version: u64,
}

/// Lets its holder set or rotate the attestor key.
public struct AdminCap has key, store {
    id: UID,
}

/// The signed payload, field order exactly as LANES.md §0 (BCS).
public struct Attestation has copy, drop {
    owner: address,
    ns: String,
    n_settled: u64,
    wins: u64,
    brier_bps: u64,
    gap_bps: u64,
    gap_negative: bool,
    hidden: u64,
    badges: u64,
    issued_ms: u64,
    expires_ms: u64,
}

/// Dynamic-field key on the registry: owner -> passport ID.
public struct ClaimKey(address) has copy, drop, store;

// === Events ===

public struct AttestorSet has copy, drop {
    pubkey: vector<u8>,
    version: u64,
}

public struct PassportClaimed has copy, drop {
    passport_id: ID,
    owner: address,
    ns: String,
    n_settled: u64,
    brier_bps: u64,
    badges: u64,
    issued_ms: u64,
}

public struct PassportRefreshed has copy, drop {
    passport_id: ID,
    owner: address,
    n_settled: u64,
    brier_bps: u64,
    badges: u64,
    issued_ms: u64,
    version: u64,
}

// === Init ===

fun init(otw: PASSPORT, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let mut d = display::new_with_fields<ForecasterPassport>(
        &publisher,
        vector[
            b"name".to_string(),
            b"description".to_string(),
            b"image_url".to_string(),
            b"link".to_string(),
            b"project_url".to_string(),
        ],
        vector[
            b"HELIX Forecaster Passport".to_string(),
            // "·" is U+00B7 (UTF-8 C2 B7)
            b"{n_settled} settled \xC2\xB7 Brier {brier_bps} bps \xC2\xB7 hidden {hidden}".to_string(),
            b"https://helix-compiler.onrender.com/passport/{ns}/card.svg".to_string(),
            b"https://helix-app-fovn.onrender.com/app.html#/passport/{ns}".to_string(),
            b"https://helix-app-fovn.onrender.com".to_string(),
        ],
        ctx,
    );
    d.update_version();
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(d, ctx.sender());
    transfer::share_object(AttestorRegistry { id: object::new(ctx), pubkey: vector[], version: 0 });
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

// === Admin ===

/// Set or rotate the attestor's Ed25519 public key (32 bytes).
public fun set_attestor(_: &AdminCap, reg: &mut AttestorRegistry, pubkey: vector<u8>) {
    assert!(pubkey.length() == 32, EBadPublicKey);
    reg.pubkey = pubkey;
    reg.version = reg.version + 1;
    event::emit(AttestorSet { pubkey, version: reg.version });
}

// === Claim / refresh ===

/// Mint the sender's passport from a HELIX attestation. Verifies the Ed25519 signature
/// over `payload`, requires `owner == sender` and `expires_ms > now`, and allows one
/// passport per address.
public fun claim(
    reg: &mut AttestorRegistry,
    payload: vector<u8>,
    sig: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let a = verified(reg, payload, &sig, clock);
    assert!(a.owner == ctx.sender(), EOwnerMismatch);
    assert!(!df::exists(&reg.id, ClaimKey(a.owner)), EAlreadyClaimed);
    let p = ForecasterPassport {
        id: object::new(ctx),
        owner: a.owner,
        ns: a.ns,
        n_settled: a.n_settled,
        wins: a.wins,
        brier_bps: a.brier_bps,
        gap_bps: a.gap_bps,
        gap_negative: a.gap_negative,
        hidden: a.hidden,
        badges: a.badges,
        issued_ms: a.issued_ms,
        version: 1,
    };
    let passport_id = object::id(&p);
    df::add(&mut reg.id, ClaimKey(a.owner), passport_id);
    event::emit(PassportClaimed {
        passport_id,
        owner: a.owner,
        ns: a.ns,
        n_settled: a.n_settled,
        brier_bps: a.brier_bps,
        badges: a.badges,
        issued_ms: a.issued_ms,
    });
    transfer::transfer(p, a.owner);
}

/// Update a passport with a newer attestation. Same checks as `claim`, plus the
/// attestation must be for this passport's owner and namespace and its `issued_ms`
/// must be strictly greater than the passport's (anti-rollback: an old attestation,
/// including the one used to mint, can never be replayed).
/// Only the owner can pass `&mut ForecasterPassport`, since it is address-owned.
public fun refresh(
    p: &mut ForecasterPassport,
    reg: &AttestorRegistry,
    payload: vector<u8>,
    sig: vector<u8>,
    clock: &Clock,
) {
    let a = verified(reg, payload, &sig, clock);
    assert!(a.owner == p.owner, EOwnerMismatch);
    assert!(a.ns == p.ns, ENamespaceMismatch);
    assert!(a.issued_ms > p.issued_ms, EStaleAttestation);
    p.n_settled = a.n_settled;
    p.wins = a.wins;
    p.brier_bps = a.brier_bps;
    p.gap_bps = a.gap_bps;
    p.gap_negative = a.gap_negative;
    p.hidden = a.hidden;
    p.badges = a.badges;
    p.issued_ms = a.issued_ms;
    p.version = p.version + 1;
    event::emit(PassportRefreshed {
        passport_id: object::id(p),
        owner: p.owner,
        n_settled: a.n_settled,
        brier_bps: a.brier_bps,
        badges: a.badges,
        issued_ms: a.issued_ms,
        version: p.version,
    });
}

// === Passport accessors (any protocol can gate on these) ===

public fun owner(p: &ForecasterPassport): address { p.owner }

public fun ns(p: &ForecasterPassport): String { p.ns }

public fun n_settled(p: &ForecasterPassport): u64 { p.n_settled }

public fun wins(p: &ForecasterPassport): u64 { p.wins }

public fun brier_bps(p: &ForecasterPassport): u64 { p.brier_bps }

public fun gap_bps(p: &ForecasterPassport): u64 { p.gap_bps }

public fun gap_negative(p: &ForecasterPassport): bool { p.gap_negative }

public fun hidden(p: &ForecasterPassport): u64 { p.hidden }

public fun badges(p: &ForecasterPassport): u64 { p.badges }

public fun issued_ms(p: &ForecasterPassport): u64 { p.issued_ms }

public fun version(p: &ForecasterPassport): u64 { p.version }

/// True when every bit of `bit` is set (pass a badge value: 1, 2, 4, 8 or 16).
/// `bit == 0` is never a badge and returns false.
public fun has_badge(p: &ForecasterPassport, bit: u64): bool {
    bit != 0 && (p.badges & bit) == bit
}

public fun badge_calibrated(): u64 { BADGE_CALIBRATED }

public fun badge_honest_loser(): u64 { BADGE_HONEST_LOSER }

public fun badge_contrarian(): u64 { BADGE_CONTRARIAN }

public fun badge_council_member(): u64 { BADGE_COUNCIL_MEMBER }

public fun badge_multi_asset(): u64 { BADGE_MULTI_ASSET }

// === Registry accessors ===

public fun attestor_pubkey(reg: &AttestorRegistry): vector<u8> { reg.pubkey }

public fun attestor_version(reg: &AttestorRegistry): u64 { reg.version }

/// The passport ID claimed by `owner`, if any.
public fun passport_of(reg: &AttestorRegistry, owner: address): Option<ID> {
    if (df::exists(&reg.id, ClaimKey(owner))) {
        option::some(*df::borrow<ClaimKey, ID>(&reg.id, ClaimKey(owner)))
    } else {
        option::none()
    }
}

// === Internal ===

/// Signature check, BCS decode, expiry check.
fun verified(reg: &AttestorRegistry, payload: vector<u8>, sig: &vector<u8>, clock: &Clock): Attestation {
    assert!(reg.pubkey.length() == 32, EAttestorNotSet);
    assert!(ed25519::ed25519_verify(sig, &reg.pubkey, &payload), EBadSignature);
    let a = decode(payload);
    assert!(a.expires_ms > clock.timestamp_ms(), EExpired);
    a
}

/// BCS-decode an `Attestation`, rejecting trailing bytes.
fun decode(payload: vector<u8>): Attestation {
    let mut b = bcs::new(payload);
    let a = Attestation {
        owner: b.peel_address(),
        ns: b.peel_vec_u8().to_string(),
        n_settled: b.peel_u64(),
        wins: b.peel_u64(),
        brier_bps: b.peel_u64(),
        gap_bps: b.peel_u64(),
        gap_negative: b.peel_bool(),
        hidden: b.peel_u64(),
        badges: b.peel_u64(),
        issued_ms: b.peel_u64(),
        expires_ms: b.peel_u64(),
    };
    assert!(b.into_remainder_bytes().is_empty(), EMalformedPayload);
    a
}

// === Test-only ===

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(sui::test_utils::create_one_time_witness<PASSPORT>(), ctx)
}

#[test_only]
/// Decoded fields of a payload, in LANES.md §0 order (owner, ns, then the nine numbers/bool).
public fun decode_for_testing(
    payload: vector<u8>,
): (address, String, u64, u64, u64, u64, bool, u64, u64, u64, u64) {
    let a = decode(payload);
    (
        a.owner,
        a.ns,
        a.n_settled,
        a.wins,
        a.brier_bps,
        a.gap_bps,
        a.gap_negative,
        a.hidden,
        a.badges,
        a.issued_ms,
        a.expires_ms,
    )
}
