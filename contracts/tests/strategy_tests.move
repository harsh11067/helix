#[test_only]
module helix::strategy_tests {
    use sui::test_scenario as ts;
    use helix::strategy::{Self, StrategyObject};
    use helix::signed;
    use helix::dna;

    const OWNER: address = @0xA;
    const OTHER: address = @0xB;

    // 1.5 — create_strategy creates StrategyObject with correct fields
    #[test]
    fun create_has_correct_fields() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let (s, cap) = strategy::new_strategy(dna::mock(), 30, b"attest", 0, vector[], OWNER, ctx);
            assert!(strategy::owner(&s) == OWNER, 0);
            assert!(strategy::creator(&s) == OWNER, 1);
            assert!(strategy::status(&s) == strategy::status_pending(), 2);
            assert!(strategy::initial_capital(&s) == 30, 3);
            assert!(strategy::current_capital(&s) == 30, 4);
            assert!(strategy::generation(&s) == 0, 5);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
        };
        sc.end();
    }

    // 1.8 + 1.10/1.11 — pending → active → closed, with one event per transition
    #[test]
    fun lifecycle_and_events() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let (s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], OWNER, ctx);
            transfer::public_transfer(s, OWNER);
            transfer::public_transfer(cap, OWNER);
        };
        let e1 = ts::next_tx(&mut sc, OWNER);
        assert!(ts::num_user_events(&e1) == 1, 10);   // StrategyCreated

        {
            let mut s = ts::take_from_sender<StrategyObject>(&sc);
            let ctx = ts::ctx(&mut sc);
            strategy::activate(&mut s, ctx);
            assert!(strategy::status(&s) == strategy::status_active(), 1);
            ts::return_to_sender(&sc, s);
        };
        let e2 = ts::next_tx(&mut sc, OWNER);
        assert!(ts::num_user_events(&e2) == 1, 11);   // StrategyActivated

        {
            let mut s = ts::take_from_sender<StrategyObject>(&sc);
            let ctx = ts::ctx(&mut sc);
            strategy::close_strategy(&mut s, ctx);
            assert!(strategy::status(&s) == strategy::status_closed(), 2);
            ts::return_to_sender(&sc, s);
        };
        let e3 = ts::next_tx(&mut sc, OWNER);
        assert!(ts::num_user_events(&e3) == 1, 12);   // StrategyClosed
        sc.end();
    }

    // 1.6 — close succeeds for owner (covered above). 1.7 — fails for non-owner.
    #[test, expected_failure]
    fun close_by_non_owner_fails() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let (s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], OWNER, ctx);
            transfer::public_transfer(s, OWNER);
            transfer::public_transfer(cap, OWNER);
        };
        ts::next_tx(&mut sc, OTHER);
        {
            let mut s = ts::take_from_address<StrategyObject>(&sc, OWNER);
            let ctx = ts::ctx(&mut sc);           // sender == OTHER
            strategy::close_strategy(&mut s, ctx); // aborts: ENotOwner
            ts::return_to_address(OWNER, s);
        };
        sc.end();
    }

    // 1.9 — drawdown kill-switch trips mark_dead
    #[test]
    fun drawdown_kills_strategy() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            // mock() has max_drawdown_bps = 900 (9%). Apply a 20-dUSDC loss on 100 = 2000 bps.
            let (mut s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], OWNER, ctx);
            strategy::activate(&mut s, ctx);
            assert!(strategy::status(&s) == strategy::status_active(), 0);
            strategy::apply_pnl(&mut s, signed::new(true, 20), signed::zero(), ctx);
            assert!(strategy::status(&s) == strategy::status_dead(), 1);
            assert!(strategy::current_capital(&s) == 80, 2);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
        };
        sc.end();
    }

    // 1.9 (negative) — a loss within tolerance does NOT kill
    #[test]
    fun small_loss_survives() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let (mut s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], OWNER, ctx);
            strategy::activate(&mut s, ctx);
            strategy::apply_pnl(&mut s, signed::new(true, 5), signed::zero(), ctx); // 500 bps < 900
            assert!(strategy::status(&s) == strategy::status_active(), 0);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
        };
        sc.end();
    }

    // create with empty attestation is rejected
    #[test, expected_failure]
    fun empty_attestation_rejected() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let (s, cap) = strategy::new_strategy(dna::mock(), 100, b"", 0, vector[], OWNER, ctx);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
        };
        sc.end();
    }
}
