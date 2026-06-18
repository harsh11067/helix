#[test_only]
module helix::leg_tests {
    use sui::test_scenario as ts;
    use helix::leg_factory as lf;

    const A: address = @0xA;

    // 2.30 — factory creates the correct leg type for each call
    #[test]
    fun creates_correct_types() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let call = lf::create_call_leg(10, 5000000, true, ctx);
            let put = lf::create_put_leg(10, 4800000, false, ctx);
            let spot = lf::create_spot_leg(20, true, ctx);
            let bin = lf::create_binary_leg(5, 5000000, true, ctx);
            let rng = lf::create_range_leg(8, 4900000, ctx);
            assert!(lf::leg_type(&call) == lf::leg_call(), 0);
            assert!(lf::leg_type(&put) == lf::leg_put(), 1);
            assert!(lf::leg_type(&spot) == lf::leg_spot(), 2);
            assert!(lf::leg_type(&bin) == lf::leg_binary(), 3);
            assert!(lf::leg_type(&rng) == lf::leg_range(), 4);
            assert!(!lf::has_market(&call), 5);
            lf::destroy_for_testing(call); lf::destroy_for_testing(put); lf::destroy_for_testing(spot);
            lf::destroy_for_testing(bin); lf::destroy_for_testing(rng);
        };
        sc.end();
    }

    // 2.31 — bundling creates all legs in one (atomic) call
    #[test]
    fun bundle_creates_all() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let specs = vector[
                lf::spec(lf::leg_call(), 10, 5000000, true),
                lf::spec(lf::leg_put(), 10, 4800000, false),
                lf::spec(lf::leg_spot(), 30, 0, true),
            ];
            let mut legs = lf::create_strategy_legs(specs, ctx);
            assert!(legs.length() == 3, 0);
            while (!legs.is_empty()) { lf::destroy_for_testing(legs.pop_back()); };
            legs.destroy_empty();
        };
        sc.end();
    }

    // 2.32 — an invalid spec aborts the whole bundle (atomic revert)
    #[test, expected_failure]
    fun bundle_reverts_on_invalid() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let specs = vector[
                lf::spec(lf::leg_call(), 10, 5000000, true),
                lf::spec(lf::leg_call(), 0, 5000000, true), // size 0 → abort
            ];
            let legs = lf::create_strategy_legs(specs, ctx);
            legs.destroy_empty(); // unreachable
        };
        sc.end();
    }
}
