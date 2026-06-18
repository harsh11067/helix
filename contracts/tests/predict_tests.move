#[test_only]
/// Verifies the strategy/leg + Predict-counterparty lifecycle against the
/// `mock_predict` stand-in. After the ADR-003 flip, the production
/// `predict_adapter` composes the REAL `deepbook_predict::` package, whose
/// shared objects (`Predict`, `PredictManager`, `OracleSVI`) cannot be
/// constructed inside `test_scenario`; that path is verified on testnet
/// (dry-run + real tx). These tests prove the same wrapper math and bookkeeping
/// — mint → bind market on leg → register on strategy → supply → settle →
/// redeem — using the deterministic mock as the counterparty.
module helix::predict_tests {
    use sui::test_scenario as ts;
    use sui::coin;
    use sui::sui::SUI;
    use helix::mock_predict::{Self, PlpVault};
    use helix::strategy;
    use helix::leg_factory as lf;
    use helix::dna;
    use deepbook_predict::market_key;

    const A: address = @0xA;

    #[test]
    fun mint_supply_settle_redeem() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            mock_predict::create_vault<SUI>(coin::mint_for_testing<SUI>(1000, ctx), ctx);
        };
        ts::next_tx(&mut sc, A);
        {
            let mut vault = ts::take_shared<PlpVault<SUI>>(&sc);
            let ctx = ts::ctx(&mut sc);
            let mut manager = mock_predict::new_manager<SUI>(ctx);
            let (mut s, scap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            let mut leg = lf::create_call_leg(50, 5000000, true, ctx);

            // 2.25/2.28/2.29 — mint a position, then do what the adapter does:
            // record the MarketKey on the leg and register the leg on the strategy.
            let premium = coin::mint_for_testing<SUI>(10, ctx);
            let mut pos = mock_predict::mint<SUI>(
                &mut vault, &mut manager, mock_predict::market_call(), 50, 5000000, premium, ctx,
            );
            let key = market_key::new(object::id_from_address(@0xFACE), 0, 5000000, true);
            lf::bind_market(&mut leg, key, 50);
            strategy::add_leg(&mut s, lf::id(&leg));

            assert!(mock_predict::position_count(&manager) == 1, 0);
            assert!(mock_predict::open_notional(&manager) == 50, 1);
            assert!(lf::has_market(&leg), 2);
            assert!(lf::bound_qty(&leg) == 50, 7);
            assert!(strategy::num_legs(&s) == 1, 3);

            // 2.26 — supply into the PLP vault
            mock_predict::supply<SUI>(&mut vault, coin::mint_for_testing<SUI>(200, ctx));
            assert!(mock_predict::liquidity(&vault) >= 1200, 4);

            // 2.27 — settle + redeem a winning position
            mock_predict::settle<SUI>(&mut vault, &mut pos, true);
            let payout = mock_predict::redeem_permissionless<SUI>(&mut vault, &mut manager, pos, ctx);
            assert!(coin::burn_for_testing(payout) == 50, 5);
            assert!(mock_predict::open_notional(&manager) == 0, 6);

            mock_predict::destroy_manager_for_testing(manager);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(scap);
            lf::destroy_for_testing(leg);
            ts::return_shared(vault);
        };
        sc.end();
    }

    #[test]
    fun losing_position_pays_zero() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            mock_predict::create_vault<SUI>(coin::mint_for_testing<SUI>(500, ctx), ctx);
        };
        ts::next_tx(&mut sc, A);
        {
            let mut vault = ts::take_shared<PlpVault<SUI>>(&sc);
            let ctx = ts::ctx(&mut sc);
            let mut manager = mock_predict::new_manager<SUI>(ctx);
            let (mut s, scap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            let mut leg = lf::create_binary_leg(30, 5000000, true, ctx);
            let premium = coin::mint_for_testing<SUI>(5, ctx);
            let mut pos = mock_predict::mint<SUI>(
                &mut vault, &mut manager, mock_predict::market_binary(), 30, 5000000, premium, ctx,
            );
            let key = market_key::new(object::id_from_address(@0xFACE), 0, 5000000, true);
            lf::bind_market(&mut leg, key, 30);
            strategy::add_leg(&mut s, lf::id(&leg));

            mock_predict::settle<SUI>(&mut vault, &mut pos, false);
            let payout = mock_predict::redeem_permissionless<SUI>(&mut vault, &mut manager, pos, ctx);
            assert!(coin::burn_for_testing(payout) == 0, 0);

            mock_predict::destroy_manager_for_testing(manager);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(scap);
            lf::destroy_for_testing(leg);
            ts::return_shared(vault);
        };
        sc.end();
    }
}
