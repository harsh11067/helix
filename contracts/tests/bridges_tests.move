#[test_only]
module helix::bridges_tests {
    use helix::compiler_bridge as cb;
    use helix::hedger_bridge as hb;
    use helix::walrus_adapter as wal;
    use helix::compose_adapter as comp;

    // compiler_bridge: a fresh attestation verifies and returns its payload digest
    #[test]
    fun compiler_attestation_verifies() {
        let att = cb::new_attestation(1, b"digest", b"sig", 100);
        assert!(cb::is_valid(&att, 50), 0);
        let digest = cb::verify(&att, 50);
        assert!(digest == b"digest", 1);
    }

    // 11.3 front-running mitigation: an expired attestation is rejected
    #[test, expected_failure]
    fun compiler_attestation_expired() {
        let att = cb::new_attestation(1, b"digest", b"sig", 10);
        let _ = cb::verify(&att, 50); // current epoch 50 > valid_until 10 → abort
    }

    #[test, expected_failure]
    fun compiler_attestation_empty_sig() {
        let att = cb::new_attestation(1, b"digest", b"", 100);
        let _ = cb::verify(&att, 50);
    }

    #[test]
    fun hedger_attestation_envelope() {
        let h = hb::new_hedge_attestation(b"d", b"s");
        assert!(hb::is_valid(&h), 0);
        assert!(hb::bytes(&h) == b"s", 1);
    }

    #[test]
    fun walrus_blob_refs() {
        let b = wal::new_blob_ref(b"blob123", 1, 4096);
        assert!(wal::blob_id(&b) == b"blob123", 0);
        assert!(wal::kind(&b) == 1, 1);
    }

    #[test, expected_failure]
    fun walrus_rejects_empty_blob() {
        let _ = wal::new_blob_ref(b"", 0, 0);
    }

    #[test]
    fun compose_legs() {
        let m = comp::margin_leg(1000, 300);
        let ib = comp::iron_bank_leg(500);
        let sp = comp::spot_leg(250);
        assert!(comp::venue(&m) == 0 && comp::notional(&m) == 1000, 0);
        assert!(comp::venue(&ib) == 1, 1);
        assert!(comp::venue(&sp) == 2 && comp::notional(&sp) == 250, 2);
    }
}
