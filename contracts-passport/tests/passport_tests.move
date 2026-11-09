#[test_only]
module helix_passport::passport_tests;

use helix_passport::gate_example;
use helix_passport::passport::{Self, AdminCap, AttestorRegistry, ForecasterPassport};
use helix_passport::vectors;
use std::unit_test::assert_eq;
use sui::clock::{Self, Clock};
use sui::display::Display;
use sui::package::Publisher;
use sui::test_scenario::{Self as ts, Scenario};

const ADMIN: address = @0xAD;

// === helpers ===

fun clock_at(sc: &mut Scenario, ms: u64): Clock {
    let mut c = clock::create_for_testing(sc.ctx());
    c.set_for_testing(ms);
    c
}

/// Publish (init) and set the test attestor key.
fun setup(): Scenario {
    let mut sc = ts::begin(ADMIN);
    passport::init_for_testing(sc.ctx());
    sc.next_tx(ADMIN);
    let cap = sc.take_from_sender<AdminCap>();
    let mut reg = sc.take_shared<AttestorRegistry>();
    passport::set_attestor(&cap, &mut reg, vectors::attestor_pubkey());
    ts::return_shared(reg);
    sc.return_to_sender(cap);
    sc
}

fun claim_as(sc: &mut Scenario, who: address, payload: vector<u8>, sig: vector<u8>) {
    sc.next_tx(who);
    let mut reg = sc.take_shared<AttestorRegistry>();
    let c = clock_at(sc, vectors::t0() + 1_000);
    passport::claim(&mut reg, payload, sig, &c, sc.ctx());
    c.destroy_for_testing();
    ts::return_shared(reg);
}

fun refresh_as(sc: &mut Scenario, who: address, payload: vector<u8>, sig: vector<u8>) {
    sc.next_tx(who);
    let mut p = sc.take_from_sender<ForecasterPassport>();
    let reg = sc.take_shared<AttestorRegistry>();
    let c = clock_at(sc, vectors::t0() + 2_000);
    passport::refresh(&mut p, &reg, payload, sig, &c);
    c.destroy_for_testing();
    ts::return_shared(reg);
    sc.return_to_sender(p);
}

// === init ===

#[test]
fun init_creates_registry_display_publisher_and_admin_cap() {
    let mut sc = ts::begin(ADMIN);
    passport::init_for_testing(sc.ctx());
    sc.next_tx(ADMIN);
    assert!(sc.has_most_recent_for_sender<AdminCap>());
    assert!(sc.has_most_recent_for_sender<Publisher>());
    let d = sc.take_from_sender<Display<ForecasterPassport>>();
    assert_eq!(d.version(), 1);
    assert_eq!(*d.fields().get(&b"name".to_string()), b"HELIX Forecaster Passport".to_string());
    assert_eq!(
        *d.fields().get(&b"image_url".to_string()),
        b"https://helix-compiler.onrender.com/passport/{ns}/card.svg".to_string(),
    );
    sc.return_to_sender(d);
    let reg = sc.take_shared<AttestorRegistry>();
    assert!(passport::attestor_pubkey(&reg).is_empty());
    assert_eq!(passport::attestor_version(&reg), 0);
    ts::return_shared(reg);
    sc.end();
}

// === TS <-> Move agreement (P4-02) ===

#[test]
fun ts_encoded_payload_decodes_to_the_same_fields() {
    let (o, ns, n, w, br, gap, neg, hid, bad, iss, exp) = passport::decode_for_testing(
        vectors::claim_payload(),
    );
    let (eo, ens, en, ew, ebr, egap, eneg, ehid, ebad, eiss, eexp) = vectors::claim_fields();
    assert_eq!(o, eo);
    assert_eq!(ns, ens.to_string());
    assert_eq!(n, en);
    assert_eq!(w, ew);
    assert_eq!(br, ebr);
    assert_eq!(gap, egap);
    assert_eq!(neg, eneg);
    assert_eq!(hid, ehid);
    assert_eq!(bad, ebad);
    assert_eq!(iss, eiss);
    assert_eq!(exp, eexp);
}

#[test]
fun ts_signatures_verify_with_sui_ed25519() {
    let pk = vectors::attestor_pubkey();
    assert!(sui::ed25519::ed25519_verify(&vectors::claim_sig(), &pk, &vectors::claim_payload()));
    assert!(sui::ed25519::ed25519_verify(&vectors::refresh_sig(), &pk, &vectors::refresh_payload()));
    assert!(sui::ed25519::ed25519_verify(&vectors::bob_sig(), &pk, &vectors::bob_payload()));
    assert!(!sui::ed25519::ed25519_verify(&vectors::rogue_sig(), &pk, &vectors::claim_payload()));
    assert!(
        sui::ed25519::ed25519_verify(&vectors::rogue_sig(), &vectors::rogue_pubkey(), &vectors::claim_payload()),
    );
}

// === claim ===

#[test]
fun claim_valid_mints_soulbound_passport_to_sender() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    sc.next_tx(vectors::alice());
    let p = sc.take_from_sender<ForecasterPassport>();
    let (eo, ens, en, ew, ebr, egap, eneg, ehid, ebad, eiss, _) = vectors::claim_fields();
    assert_eq!(p.owner(), eo);
    assert_eq!(p.ns(), ens.to_string());
    assert_eq!(p.n_settled(), en);
    assert_eq!(p.wins(), ew);
    assert_eq!(p.brier_bps(), ebr);
    assert_eq!(p.gap_bps(), egap);
    assert_eq!(p.gap_negative(), eneg);
    assert_eq!(p.hidden(), ehid);
    assert_eq!(p.badges(), ebad);
    assert_eq!(p.issued_ms(), eiss);
    assert_eq!(p.version(), 1);
    let reg = sc.take_shared<AttestorRegistry>();
    assert_eq!(passport::passport_of(&reg, vectors::alice()), option::some(object::id(&p)));
    assert!(passport::passport_of(&reg, vectors::bob()).is_none());
    ts::return_shared(reg);
    sc.return_to_sender(p);
    sc.end();
}

#[test, expected_failure(abort_code = passport::EBadSignature)]
fun claim_wrong_signer_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::rogue_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EBadSignature)]
fun claim_tampered_payload_aborts() {
    let mut sc = setup();
    let mut payload = vectors::claim_payload();
    // byte 54 = first byte of n_settled (32 owner + 1 len + 21 ns): 12 settled -> 112
    let b = &mut payload[54];
    *b = *b + 100;
    claim_as(&mut sc, vectors::alice(), payload, vectors::claim_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EOwnerMismatch)]
fun claim_owner_not_sender_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::bob(), vectors::claim_payload(), vectors::claim_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EExpired)]
fun claim_expired_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::expired_payload(), vectors::expired_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EAlreadyClaimed)]
fun claim_twice_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    claim_as(&mut sc, vectors::alice(), vectors::refresh_payload(), vectors::refresh_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EAttestorNotSet)]
fun claim_before_set_attestor_aborts() {
    let mut sc = ts::begin(ADMIN);
    passport::init_for_testing(sc.ctx());
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EMalformedPayload)]
fun claim_trailing_bytes_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::trailing_payload(), vectors::trailing_sig());
    sc.end();
}

// === refresh ===

#[test]
fun refresh_with_newer_attestation_updates_fields() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    refresh_as(&mut sc, vectors::alice(), vectors::refresh_payload(), vectors::refresh_sig());
    sc.next_tx(vectors::alice());
    let p = sc.take_from_sender<ForecasterPassport>();
    assert_eq!(p.n_settled(), 13);
    assert_eq!(p.wins(), 9);
    assert_eq!(p.brier_bps(), 1700);
    assert_eq!(p.gap_bps(), 300);
    assert!(p.gap_negative());
    assert_eq!(p.issued_ms(), vectors::t0() + 60_000);
    assert_eq!(p.version(), 2);
    sc.return_to_sender(p);
    sc.end();
}

#[test, expected_failure(abort_code = passport::EStaleAttestation)]
fun refresh_with_older_attestation_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    refresh_as(&mut sc, vectors::alice(), vectors::old_payload(), vectors::old_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EStaleAttestation)]
fun refresh_replaying_the_mint_attestation_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    refresh_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EStaleAttestation)]
fun refresh_replaying_an_earlier_refresh_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    refresh_as(&mut sc, vectors::alice(), vectors::refresh_payload(), vectors::refresh_sig());
    refresh_as(&mut sc, vectors::alice(), vectors::refresh_payload(), vectors::refresh_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::ENamespaceMismatch)]
fun refresh_other_namespace_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    refresh_as(&mut sc, vectors::alice(), vectors::other_ns_payload(), vectors::other_ns_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EOwnerMismatch)]
fun refresh_with_someone_elses_attestation_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    refresh_as(&mut sc, vectors::alice(), vectors::bob_payload(), vectors::bob_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EBadSignature)]
fun refresh_forged_aborts() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    refresh_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::rogue_sig());
    sc.end();
}

// === attestor key ===

#[test, expected_failure(abort_code = passport::EBadPublicKey)]
fun set_attestor_rejects_wrong_length_key() {
    let mut sc = setup();
    sc.next_tx(ADMIN);
    let cap = sc.take_from_sender<AdminCap>();
    let mut reg = sc.take_shared<AttestorRegistry>();
    passport::set_attestor(&cap, &mut reg, x"0102");
    ts::return_shared(reg);
    sc.return_to_sender(cap);
    sc.end();
}

#[test]
fun rotating_the_attestor_key_switches_which_signatures_verify() {
    let mut sc = setup();
    sc.next_tx(ADMIN);
    let cap = sc.take_from_sender<AdminCap>();
    let mut reg = sc.take_shared<AttestorRegistry>();
    passport::set_attestor(&cap, &mut reg, vectors::rogue_pubkey());
    assert_eq!(passport::attestor_version(&reg), 2);
    assert_eq!(passport::attestor_pubkey(&reg), vectors::rogue_pubkey());
    ts::return_shared(reg);
    sc.return_to_sender(cap);
    // the rogue key is now the attestor, so its signature is accepted
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::rogue_sig());
    sc.end();
}

#[test, expected_failure(abort_code = passport::EBadSignature)]
fun old_key_signatures_fail_after_rotation() {
    let mut sc = setup();
    sc.next_tx(ADMIN);
    let cap = sc.take_from_sender<AdminCap>();
    let mut reg = sc.take_shared<AttestorRegistry>();
    passport::set_attestor(&cap, &mut reg, vectors::rogue_pubkey());
    ts::return_shared(reg);
    sc.return_to_sender(cap);
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    sc.end();
}

// === accessors + badges ===

#[test]
fun accessors_and_badges() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    sc.next_tx(vectors::alice());
    let p = sc.take_from_sender<ForecasterPassport>();
    // badges = 3 = Calibrated | Honest Loser
    assert!(p.has_badge(passport::badge_calibrated()));
    assert!(p.has_badge(passport::badge_honest_loser()));
    assert!(p.has_badge(3));
    assert!(!p.has_badge(passport::badge_contrarian()));
    assert!(!p.has_badge(passport::badge_council_member()));
    assert!(!p.has_badge(passport::badge_multi_asset()));
    assert!(!p.has_badge(0));
    assert_eq!(passport::badge_calibrated(), 1);
    assert_eq!(passport::badge_honest_loser(), 2);
    assert_eq!(passport::badge_contrarian(), 4);
    assert_eq!(passport::badge_council_member(), 8);
    assert_eq!(passport::badge_multi_asset(), 16);
    sc.return_to_sender(p);
    sc.end();
}

// === soulbound ===
// `ForecasterPassport` has `key` without `store`: `transfer::public_transfer`, PTB TransferObjects and
// wrapping in another object do not type-check outside this package. The compile-time proof lives in
// contracts-passport/negative/soulbound (a package that tries, and must fail to build; run by
// tee/test/passport-onchain.test.ts). Here: the passport is owned by its holder and nobody else.

#[test]
fun passport_is_owned_only_by_its_holder() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    sc.next_tx(vectors::alice());
    let id = ts::most_recent_id_for_address<ForecasterPassport>(vectors::alice());
    assert!(id.is_some());
    assert!(ts::most_recent_id_for_address<ForecasterPassport>(ADMIN).is_none());
    assert!(ts::most_recent_id_for_address<ForecasterPassport>(vectors::bob()).is_none());
    sc.end();
}

// === gate_example ===

#[test]
fun gate_admits_a_calibrated_forecaster() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    sc.next_tx(vectors::alice());
    let p = sc.take_from_sender<ForecasterPassport>();
    gate_example::assert_calibrated(&p, 2000, 10); // Brier 1800 < 2000, n 12 >= 10
    assert!(gate_example::is_calibrated(&p, 2200, 10));
    assert!(!gate_example::is_calibrated(&p, 1800, 10));
    assert!(!gate_example::is_calibrated(&p, 2200, 13));
    sc.return_to_sender(p);
    sc.end();
}

#[test, expected_failure(abort_code = gate_example::ETooFewSettled)]
fun gate_rejects_too_few_settled() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::bob(), vectors::bob_payload(), vectors::bob_sig());
    sc.next_tx(vectors::bob());
    let p = sc.take_from_sender<ForecasterPassport>();
    gate_example::assert_calibrated(&p, 5000, 10); // n 4 < 10
    sc.return_to_sender(p);
    sc.end();
}

#[test, expected_failure(abort_code = gate_example::ENotCalibrated)]
fun gate_rejects_an_uncalibrated_forecaster() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::bob(), vectors::bob_payload(), vectors::bob_sig());
    sc.next_tx(vectors::bob());
    let p = sc.take_from_sender<ForecasterPassport>();
    gate_example::assert_calibrated(&p, 2000, 3); // Brier 3100 >= 2000
    sc.return_to_sender(p);
    sc.end();
}

#[test]
fun gate_freshness_passes_within_max_age() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    sc.next_tx(vectors::alice());
    let p = sc.take_from_sender<ForecasterPassport>();
    let c = clock_at(&mut sc, vectors::t0() + 86_400_000);
    gate_example::assert_fresh(&p, &c, 86_400_000);
    c.destroy_for_testing();
    sc.return_to_sender(p);
    sc.end();
}

#[test, expected_failure(abort_code = gate_example::EStalePassport)]
fun gate_freshness_rejects_a_stale_passport() {
    let mut sc = setup();
    claim_as(&mut sc, vectors::alice(), vectors::claim_payload(), vectors::claim_sig());
    sc.next_tx(vectors::alice());
    let p = sc.take_from_sender<ForecasterPassport>();
    let c = clock_at(&mut sc, vectors::t0() + 86_400_001);
    gate_example::assert_fresh(&p, &c, 86_400_000);
    c.destroy_for_testing();
    sc.return_to_sender(p);
    sc.end();
}
