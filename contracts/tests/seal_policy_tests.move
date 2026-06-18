#[test_only]
module helix::seal_policy_tests {
    use sui::test_scenario as ts;
    use sui::coin;
    use sui::sui::SUI;
    use helix::seal_policy;
    use helix::marketplace;
    use helix::strategy::{Self, StrategyObject};
    use helix::dna;

    const A: address = @0xA; // owner / creator
    const B: address = @0xB; // copier
    const C: address = @0xC; // unrelated stranger

    // owner may decrypt: seal_approve passes when sender == owner and id matches
    #[test]
    fun owner_can_decrypt() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            let id = object::id(&s).to_bytes();
            seal_policy::seal_approve(id, &s, ctx); // sender = A = owner → no abort
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
        };
        sc.end();
    }

    // a stranger is denied
    #[test, expected_failure(abort_code = helix::seal_policy::ENoAccess)]
    fun stranger_denied() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            transfer::public_transfer(s, A);
            transfer::public_transfer(cap, A);
        };
        ts::next_tx(&mut sc, C);
        {
            let s = ts::take_from_address<StrategyObject>(&sc, A);
            let id = object::id(&s).to_bytes();
            let ctx = ts::ctx(&mut sc);                 // sender = C
            seal_policy::seal_approve(id, &s, ctx);     // C != owner → abort ENoAccess
            ts::return_to_address(A, s);
        };
        sc.end();
    }

    // wrong identity is denied even for the owner
    #[test, expected_failure(abort_code = helix::seal_policy::EBadIdentity)]
    fun bad_identity_denied() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            seal_policy::seal_approve(b"not-this-strategy", &s, ctx); // id mismatch → abort
            strategy::destroy_for_testing(s);
            strategy::destroy_owner_cap_for_testing(cap);
        };
        sc.end();
    }

    // a copier (paid to copy → holds CopyRelationship) may decrypt the original's thesis
    #[test]
    fun copier_can_decrypt() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (mut s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            marketplace::list_as_copyable(&mut s, 0, ctx); // 0% fee for the test
            transfer::public_transfer(s, A);
            transfer::public_transfer(cap, A);
        };
        ts::next_tx(&mut sc, B);
        {
            let mut original = ts::take_from_address<StrategyObject>(&sc, A);
            let id = object::id(&original).to_bytes();
            let ctx = ts::ctx(&mut sc);                       // sender = B
            let fee = coin::mint_for_testing<SUI>(0, ctx);
            let (derived, dcap, rel) = marketplace::copy_strategy<SUI>(&mut original, 500, fee, b"att", ctx);

            seal_policy::seal_approve_copier(id, &original, &rel, ctx); // B is copier → no abort

            strategy::destroy_for_testing(derived);
            strategy::destroy_owner_cap_for_testing(dcap);
            transfer::public_transfer(rel, B);
            ts::return_to_address(A, original);
        };
        sc.end();
    }

    // attach_thesis is owner-gated
    #[test, expected_failure(abort_code = helix::seal_policy::ENoAccess)]
    fun attach_thesis_owner_only() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let (s, cap) = strategy::new_strategy(dna::mock(), 100, b"att", 0, vector[], A, ctx);
            transfer::public_transfer(s, A);
            transfer::public_transfer(cap, A);
        };
        ts::next_tx(&mut sc, C);
        {
            let s = ts::take_from_address<StrategyObject>(&sc, A);
            let ctx = ts::ctx(&mut sc);                 // sender = C
            seal_policy::attach_thesis(&s, b"walrus-blob-id", ctx); // C != owner → abort
            ts::return_to_address(A, s);
        };
        sc.end();
    }
}
