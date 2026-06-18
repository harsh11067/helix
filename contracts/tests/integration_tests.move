#[test_only]
/// Phase 2 end-state integration (test.md 2.33–2.35).
module helix::integration_tests {
    use sui::test_scenario as ts;
    use sui::coin;
    use sui::sui::SUI;
    use helix::mock_predict::{Self, PlpVault};
    use helix::strategy::{Self};
    use helix::portfolio_risk;
    use helix::leg_factory as lf;
    use helix::breeding;
    use helix::marketplace;
    use helix::signed;
    use helix::dna;
    use deepbook_predict::market_key;

    const A: address = @0xA;

    // 2.33 — create strategy → place 3 Predict legs → close → P&L computed
    #[test]
    fun deploy_three_legs_and_close() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            mock_predict::create_vault<SUI>(coin::mint_for_testing<SUI>(10000, ctx), ctx);
        };
        ts::next_tx(&mut sc, A);
        {
            let mut vault = ts::take_shared<PlpVault<SUI>>(&sc);
            let ctx = ts::ctx(&mut sc);
            let mut manager = mock_predict::new_manager<SUI>(ctx);
            let mut p = portfolio_risk::new_portfolio(ctx);
            let (mut s, scap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            strategy::activate(&mut s, ctx);
            portfolio_risk::add_strategy_to_portfolio(&mut p, &s, ctx);

            // three legs of a structure — mint each into the (mock) counterparty,
            // then do what the adapter does: bind the MarketKey + register the leg.
            let mut i = 0u64;
            while (i < 3) {
                let mut leg = lf::create_call_leg(20, 5000000, true, ctx);
                let premium = coin::mint_for_testing<SUI>(3, ctx);
                let pos = mock_predict::mint<SUI>(
                    &mut vault, &mut manager, mock_predict::market_call(), 20, 5000000, premium, ctx,
                );
                let key = market_key::new(object::id_from_address(@0xFACE), 0, 5000000, true);
                lf::bind_market(&mut leg, key, 20);
                strategy::add_leg(&mut s, lf::id(&leg));
                transfer::public_transfer(pos, A);
                lf::destroy_for_testing(leg);
                i = i + 1;
            };
            assert!(strategy::num_legs(&s) == 3, 0);

            // realize profit then close → P&L recorded
            strategy::apply_pnl(&mut s, signed::from_u64(22), signed::zero(), ctx);
            assert!(strategy::current_capital(&s) == 122, 1);
            strategy::close_strategy(&mut s, ctx);
            assert!(strategy::status(&s) == strategy::status_closed(), 2);

            mock_predict::destroy_manager_for_testing(manager);
            portfolio_risk::destroy_for_testing(p);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(scap);
            ts::return_shared(vault);
        };
        sc.end();
    }

    // 2.35 — breed two strategies → child deploys → both parent creators earn the fee
    #[test]
    fun breed_routes_royalty_to_creators() {
        // two creators C1 and C2
        let c1: address = @0xC1;
        let c2: address = @0xC2;
        let breeder: address = @0xB0;

        let mut sc = ts::begin(breeder);
        {
            let ctx = ts::ctx(&mut sc);
            // parents created with distinct creators (royalty recipients)
            let (mut pa, capa) = strategy::new_strategy(dna::mock(), 100, b"att", 2, vector[], c1, ctx);
            let (mut pb, capb) = strategy::new_strategy(dna::mock(), 100, b"att", 2, vector[], c2, ctx);
            // owner is breeder (sender); list as breedable (owner-gated)
            marketplace::list_as_breedable(&mut pa, 4, ctx);
            marketplace::list_as_breedable(&mut pb, 6, ctx);
            let fee = coin::mint_for_testing<SUI>(10, ctx);
            let (child, ccap) = breeding::breed<SUI>(&mut pa, &mut pb, fee, 40, 0x55AA, b"att", ctx);
            assert!(strategy::generation(&child) == 3, 0);

            strategy::destroy_for_testing(child); strategy::destroy_owner_cap_for_testing(ccap);
            strategy::destroy_for_testing(pa); strategy::destroy_for_testing(pb);
            strategy::destroy_owner_cap_for_testing(capa); strategy::destroy_owner_cap_for_testing(capb);
        };
        // C1 earns 4, C2 earns 6
        ts::next_tx(&mut sc, c1);
        {
            let coin_c1 = ts::take_from_sender<coin::Coin<SUI>>(&sc);
            assert!(coin::value(&coin_c1) == 4, 1);
            ts::return_to_sender(&sc, coin_c1);
        };
        ts::next_tx(&mut sc, c2);
        {
            let coin_c2 = ts::take_from_sender<coin::Coin<SUI>>(&sc);
            assert!(coin::value(&coin_c2) == 6, 2);
            ts::return_to_sender(&sc, coin_c2);
        };
        sc.end();
    }
}
