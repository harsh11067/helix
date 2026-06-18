#[test_only]
/// Exercises accessors, setters and remaining branches not hit by the
/// behavior-focused suites, so per-module coverage clears the 80% bar (test 1.21).
module helix::coverage_tests {
    use sui::test_scenario as ts;
    use helix::strategy::{Self, StrategyObject};
    use helix::portfolio_risk::{Self, PortfolioRiskObject};
    use helix::access_control::{Self, MarketplaceCap, StrategyOwnerCap};
    use helix::dna;
    use helix::signed;

    const OWNER: address = @0xA;

    #[test]
    fun strategy_setters_and_getters() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let parent_ids = vector[];
            let (mut s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 2, parent_ids, OWNER, ctx);
            // social setters
            strategy::set_breedable(&mut s, true, 5);
            strategy::set_copyable(&mut s, true, 150);
            strategy::set_offspring_count(&mut s, 3);
            strategy::set_copies_count(&mut s, 7);
            assert!(strategy::is_breedable(&s) && strategy::breed_fee(&s) == 5, 0);
            assert!(strategy::is_copyable(&s) && strategy::copy_fee_bps(&s) == 150, 1);
            assert!(strategy::offspring_count(&s) == 3 && strategy::copies_count(&s) == 7, 2);
            // leg + dna/parents/fitness getters
            let sid = strategy::id(&s);
            strategy::add_leg(&mut s, sid);
            assert!(strategy::generation(&s) == 2, 3);
            assert!(strategy::parents(&s).is_empty(), 4);
            assert!(dna::is_valid(strategy::dna(&s)), 5);
            assert!(strategy::fitness_score(&s) == 100, 6);
            // gain path of apply_pnl (no kill switch)
            strategy::activate(&mut s, ctx);
            strategy::apply_pnl(&mut s, signed::from_u64(22), signed::from_u64(4), ctx);
            assert!(strategy::current_capital(&s) == 122, 7);
            assert!(strategy::status(&s) == strategy::status_active(), 8);

            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
        };
        sc.end();
    }

    #[test]
    fun portfolio_remove_tolerances_hedge() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let mut p = portfolio_risk::new_portfolio(ctx);
            let (s, scap) = strategy::new_strategy(dna::mock(), 50, b"att", 0, vector[], OWNER, ctx);
            let hedger = access_control::new_hedger_for_testing(ctx);

            portfolio_risk::add_strategy_to_portfolio(&mut p, &s, ctx);
            // adding the same strategy again is idempotent
            portfolio_risk::add_strategy_to_portfolio(&mut p, &s, ctx);
            assert!(portfolio_risk::strategy_count(&p) == 1, 0);

            portfolio_risk::set_tolerances(&mut p, 1000, 800, true, ctx);
            assert!(portfolio_risk::delta_tolerance(&p) == 1000, 1);
            assert!(portfolio_risk::vega_tolerance(&p) == 800, 2);
            assert!(portfolio_risk::auto_hedge_enabled(&p), 3);

            portfolio_risk::update_greeks(
                &mut p, &hedger,
                false, 100, false, 50, true, 25, true, 60, false, 5, b"att",
            );
            let _d = portfolio_risk::net_delta(&p);
            let _v = portfolio_risk::net_vega(&p);

            portfolio_risk::record_hedge(&mut p, &hedger, b"hedge-attestation");
            assert!(portfolio_risk::hedge_actions_count(&p) == 1, 4);

            portfolio_risk::remove_strategy_from_portfolio(&mut p, strategy::id(&s), ctx);
            assert!(portfolio_risk::strategy_count(&p) == 0, 5);

            access_control::destroy_hedger_for_testing(hedger);
            portfolio_risk::destroy_for_testing(p);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(scap);
        };
        sc.end();
    }

    #[test]
    fun access_control_caps() {
        let mut sc = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut sc);
            let admin = access_control::new_admin_for_testing(ctx);
            access_control::issue_marketplace_cap(&admin, OWNER, ctx);

            // owner cap helpers
            let dummy_id = object::id_from_address(@0xBEEF);
            let ocap: StrategyOwnerCap = access_control::new_owner_cap(dummy_id, ctx);
            assert!(access_control::owner_cap_strategy_id(&ocap) == dummy_id, 0);
            access_control::assert_owns(&ocap, dummy_id);
            transfer::public_transfer(ocap, OWNER);

            // breeder cap constructor
            let bcap = access_control::new_breeder_cap(ctx);
            transfer::public_transfer(bcap, OWNER);

            access_control::destroy_admin_for_testing(admin);
        };
        ts::next_tx(&mut sc, OWNER);
        {
            let mcap = ts::take_from_sender<MarketplaceCap>(&sc);
            ts::return_to_sender(&sc, mcap);
        };
        sc.end();
    }
}
