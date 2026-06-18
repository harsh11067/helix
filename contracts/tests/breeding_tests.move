#[test_only]
module helix::breeding_tests {
    use sui::test_scenario as ts;
    use sui::coin;
    use sui::sui::SUI;
    use helix::breeding::{Self, BreedingEvent};
    use helix::strategy;
    use helix::marketplace;
    use helix::dna;

    const A: address = @0xA;

    // 2.3 / 2.6 / 2.7 / 2.8 — breed yields a valid child, correct generation,
    // offspring bumped, BreedingEvent + royalty config recorded.
    #[test]
    fun breed_produces_valid_child() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (mut pa, capa) = strategy::new_strategy(dna::mock(), 100, b"att", 1, vector[], A, ctx);
            let (mut pb, capb) = strategy::new_strategy(dna::mock(), 100, b"att", 3, vector[], A, ctx);
            marketplace::list_as_breedable(&mut pa, 2, ctx);
            marketplace::list_as_breedable(&mut pb, 3, ctx);
            let fee = coin::mint_for_testing<SUI>(5, ctx);
            let (child, ccap) = breeding::breed<SUI>(&mut pa, &mut pb, fee, 50, 0xABCDEF12, b"att", ctx);

            assert!(dna::is_valid(strategy::dna(&child)), 0);
            assert!(strategy::generation(&child) == 4, 1);           // max(1,3)+1
            assert!(strategy::initial_capital(&child) == 50, 2);
            assert!(strategy::parents(&child).length() == 2, 3);
            assert!(strategy::offspring_count(&pa) == 1, 4);
            assert!(strategy::offspring_count(&pb) == 1, 5);

            strategy::destroy_for_testing(child);
            strategy::destroy_for_testing(pa);
            strategy::destroy_for_testing(pb);
            strategy::destroy_owner_cap_for_testing(capa);
            strategy::destroy_owner_cap_for_testing(capb);
            strategy::destroy_owner_cap_for_testing(ccap);
        };
        ts::next_tx(&mut sc, A);
        {
            let evt = ts::take_from_sender<BreedingEvent>(&sc);
            assert!(breeding::royalty_split_bps(&evt) == 1000, 6);
            assert!(breeding::fee_paid(&evt) == 5, 7);
            ts::return_to_sender(&sc, evt);
        };
        sc.end();
    }

    // 2.4 — crossover splits genes roughly 50/50 (statistical over 100 breedings)
    // 2.5 — mutation rate reasonable (≤ 1 gene per breed = <5% of 21 genes)
    #[test]
    fun crossover_balance_and_mutation() {
        let a = dna::new(false, 10, 20, 1, 30, 2, 0, true, false, false, 100, 0, 40, 3, 60, 40, 800, false, 0, 0, vector[]);
        let b = dna::new(false, 90, 80, 9, 70, 3, 1, true, true, false, 200, 1, 40, 2, 60, 90, 1200, false, 0, 0, vector[]);

        let mut from_b = 0u64;
        let mut i = 0u64;
        while (i < 100) {
            let child = breeding::crossover(&a, &b, i); // small seeds → bit31 = 0, no mutation
            if (dna::confidence(&child) == 80) { from_b = from_b + 1; };
            assert!(dna::is_valid(&child), 100);
            assert!(dna::mutation_count(&child) == 0, 101);
            i = i + 1;
        };
        // confidence inherited from B in a balanced fraction
        assert!(from_b >= 30 && from_b <= 70, 0);

        // a seed with the mutation bits set mutates exactly one gene
        let seed_mut = (1u64 << 31) | (1u64 << 30); // mutate up
        let mutated = breeding::crossover(&a, &b, seed_mut);
        assert!(dna::mutation_count(&mutated) == 1, 1);
        assert!(dna::is_valid(&mutated), 2);
    }

    // 2.1 — breed requires both parents breedable
    #[test, expected_failure]
    fun breed_requires_breedable() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (mut pa, capa) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            let (mut pb, capb) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            // neither listed breedable
            let fee = coin::mint_for_testing<SUI>(0, ctx);
            let (child, ccap) = breeding::breed<SUI>(&mut pa, &mut pb, fee, 50, 1, b"att", ctx);
            strategy::destroy_for_testing(child); strategy::destroy_owner_cap_for_testing(ccap);
            strategy::destroy_for_testing(pa); strategy::destroy_for_testing(pb);
            strategy::destroy_owner_cap_for_testing(capa); strategy::destroy_owner_cap_for_testing(capb);
        };
        sc.end();
    }

    // 2.2 — breed requires the correct fee
    #[test, expected_failure]
    fun breed_requires_correct_fee() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (mut pa, capa) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            let (mut pb, capb) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            marketplace::list_as_breedable(&mut pa, 2, ctx);
            marketplace::list_as_breedable(&mut pb, 3, ctx);
            let fee = coin::mint_for_testing<SUI>(4, ctx); // should be 5
            let (child, ccap) = breeding::breed<SUI>(&mut pa, &mut pb, fee, 50, 1, b"att", ctx);
            strategy::destroy_for_testing(child); strategy::destroy_owner_cap_for_testing(ccap);
            strategy::destroy_for_testing(pa); strategy::destroy_for_testing(pb);
            strategy::destroy_owner_cap_for_testing(capa); strategy::destroy_owner_cap_for_testing(capb);
        };
        sc.end();
    }
}
