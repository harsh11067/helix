#[test_only]
module helix::portfolio_tests {
    use sui::test_scenario as ts;
    use helix::portfolio_risk::{Self, PortfolioRiskObject};
    use helix::strategy::{Self, StrategyObject};
    use helix::access_control;
    use helix::dna;

    const OWNER: address = @0xA;
    const OTHER: address = @0xB;

    // 1.12 — init_portfolio creates a PortfolioRiskObject for the caller
    #[test]
    fun init_creates_for_caller() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let p = portfolio_risk::new_portfolio(ctx);
            assert!(portfolio_risk::owner(&p) == OWNER, 0);
            assert!(portfolio_risk::strategy_count(&p) == 0, 1);
            portfolio_risk::destroy_for_testing(p);
        };
        sc.end();
    }

    // 1.13 — add_strategy_to_portfolio: owner of both objects succeeds
    #[test]
    fun add_strategy_succeeds_for_owner() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let mut p = portfolio_risk::new_portfolio(ctx);
            let (s, cap) = strategy::new_strategy(dna::mock(), 50, b"att", 0, vector[], OWNER, ctx);
            portfolio_risk::add_strategy_to_portfolio(&mut p, &s, ctx);
            assert!(portfolio_risk::strategy_count(&p) == 1, 0);
            assert!(portfolio_risk::active_strategies(&p).contains(&strategy::id(&s)), 1);
            portfolio_risk::destroy_for_testing(p);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
        };
        sc.end();
    }

    // 1.13 (negative) — non-owner of portfolio cannot add
    #[test, expected_failure]
    fun add_strategy_fails_for_non_owner() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let p = portfolio_risk::new_portfolio(ctx);     // owner = OWNER
            transfer::public_transfer(p, OWNER);
        };
        ts::next_tx(&mut sc, OTHER);
        {
            let mut p = ts::take_from_address<PortfolioRiskObject>(&sc, OWNER);
            let ctx = ts::ctx(&mut sc);                     // sender = OTHER
            let (s, cap) = strategy::new_strategy(dna::mock(), 50, b"att", 0, vector[], OTHER, ctx);
            portfolio_risk::add_strategy_to_portfolio(&mut p, &s, ctx); // aborts: p.owner != OTHER
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
            ts::return_to_address(OWNER, p);
        };
        sc.end();
    }

    // 1.14/1.15 — update_greeks requires HedgerCap (type-enforced) + succeeds with attestation;
    //             tolerance breach detected.
    #[test]
    fun greeks_update_and_breach() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let mut p = portfolio_risk::new_portfolio(ctx);
            let hedger = access_control::new_hedger_for_testing(ctx);
            // default delta tolerance = 5000; push net delta 9000 (breach)
            portfolio_risk::update_greeks(
                &mut p, &hedger,
                false, 9000, false, 100, true, 50, false, 200, false, 10,
                b"tee-attestation",
            );
            assert!(portfolio_risk::delta_breached(&p), 0);

            // push within tolerance now
            portfolio_risk::update_greeks(
                &mut p, &hedger,
                false, 100, false, 100, true, 50, false, 200, false, 10,
                b"tee-attestation",
            );
            assert!(!portfolio_risk::delta_breached(&p), 1);

            access_control::destroy_hedger_for_testing(hedger);
            portfolio_risk::destroy_for_testing(p);
        };
        sc.end();
    }

    // 1.16 — update_greeks with invalid (empty) attestation fails
    #[test, expected_failure]
    fun greeks_update_empty_attestation_fails() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let mut p = portfolio_risk::new_portfolio(ctx);
            let hedger = access_control::new_hedger_for_testing(ctx);
            portfolio_risk::update_greeks(
                &mut p, &hedger,
                false, 100, false, 100, false, 50, false, 200, false, 10,
                b"",  // empty → EInvalidAttestation
            );
            access_control::destroy_hedger_for_testing(hedger);
            portfolio_risk::destroy_for_testing(p);
        };
        sc.end();
    }
}
