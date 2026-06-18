#[test_only]
module helix::marketplace_tests {
    use sui::test_scenario as ts;
    use sui::coin;
    use sui::sui::SUI;
    use helix::marketplace;
    use helix::strategy::{Self, StrategyObject};
    use helix::dna;

    const A: address = @0xA; // original creator/owner
    const B: address = @0xB; // copier

    // 2.18 — list_as_copyable only callable by the strategy owner
    #[test, expected_failure]
    fun list_copyable_owner_only() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            transfer::public_transfer(s, A);
            transfer::public_transfer(cap, A);
        };
        ts::next_tx(&mut sc, B);
        {
            let mut s = ts::take_from_address<StrategyObject>(&sc, A);
            let ctx = ts::ctx(&mut sc);                  // sender = B
            marketplace::list_as_copyable(&mut s, 200, ctx); // owner A != B → abort
            ts::return_to_address(A, s);
        };
        sc.end();
    }

    // 2.19 / 2.20 / 2.21 — copy creates derived w/ copier capital, deducts fee, routes to creator
    #[test]
    fun copy_routes_fee_to_creator() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (mut s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            marketplace::list_as_copyable(&mut s, 200, ctx); // 2% copy fee
            transfer::public_transfer(s, A);
            transfer::public_transfer(cap, A);
        };
        ts::next_tx(&mut sc, B);
        {
            let mut original = ts::take_from_address<StrategyObject>(&sc, A);
            let ctx = ts::ctx(&mut sc);
            let fee = coin::mint_for_testing<SUI>(20, ctx);  // 1000 * 200 / 10000 = 20
            let (derived, dcap, rel) = marketplace::copy_strategy<SUI>(&mut original, 1000, fee, b"att", ctx);

            assert!(strategy::owner(&derived) == B, 0);            // copier owns it
            assert!(strategy::creator(&derived) == A, 1);          // creator preserved for royalties
            assert!(strategy::initial_capital(&derived) == 1000, 2);
            assert!(strategy::copies_count(&original) == 1, 3);
            assert!(marketplace::fees_paid_to_original(&rel) == 20, 4);
            assert!(marketplace::derived_strategy_id(&rel) == strategy::id(&derived), 5);

            strategy::destroy_for_testing(derived);
            strategy::destroy_owner_cap_for_testing(dcap);
            transfer::public_transfer(rel, B);
            ts::return_to_address(A, original);
        };
        // 2.21 — original creator A received the 20-fee coin
        ts::next_tx(&mut sc, A);
        {
            let received = ts::take_from_sender<coin::Coin<SUI>>(&sc);
            assert!(coin::value(&received) == 20, 6);
            ts::return_to_sender(&sc, received);
        };
        sc.end();
    }

    // 2.22 — performance fees from derived route to original creator over time
    #[test]
    fun performance_fee_accrues() {
        let mut sc = ts::begin(B);
        {
            let ctx = ts::ctx(&mut sc);
            // build a relationship via copy
            let (original, ocap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            // need owner == sender to list; here sender=B so make B the owner/creator for setup
            transfer::public_transfer(ocap, B);
            transfer::public_transfer(original, B);
        };
        ts::next_tx(&mut sc, B);
        {
            let mut original = ts::take_from_sender<StrategyObject>(&sc);
            let ctx = ts::ctx(&mut sc);
            marketplace::list_as_copyable(&mut original, 0, ctx); // 0% upfront for this test
            let fee = coin::mint_for_testing<SUI>(0, ctx);
            let (derived, dcap, mut rel) = marketplace::copy_strategy<SUI>(&mut original, 500, fee, b"att", ctx);

            // later: derived realizes profit; route a performance fee to creator (A)
            let perf = coin::mint_for_testing<SUI>(7, ctx);
            marketplace::route_performance_fee<SUI>(&mut rel, A, perf);
            assert!(marketplace::fees_paid_to_original(&rel) == 7, 0);

            strategy::destroy_for_testing(derived);
            strategy::destroy_for_testing(original);
            strategy::destroy_owner_cap_for_testing(dcap);
            transfer::public_transfer(rel, B);
        };
        sc.end();
    }

    // 2.23 — breedable listing sets fee structure
    #[test]
    fun list_breedable_sets_fee() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (mut s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            marketplace::list_as_breedable(&mut s, 12, ctx);
            assert!(strategy::is_breedable(&s) && strategy::breed_fee(&s) == 12, 0);
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
        };
        sc.end();
    }
}
