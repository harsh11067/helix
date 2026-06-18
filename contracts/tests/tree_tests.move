#[test_only]
module helix::tree_tests {
    use sui::test_scenario as ts;
    use sui::coin;
    use sui::sui::SUI;
    use helix::conviction_tree as ct;

    const A: address = @0xA;

    // 2.11 — outcome conditions
    #[test]
    fun evaluate_outcome() {
        let c = ct::outcome_condition(ct::outcome_succeeded());
        assert!(ct::evaluate_condition(&c, ct::outcome_succeeded(), 0), 0);
        assert!(!ct::evaluate_condition(&c, ct::outcome_failed(), 0), 1);
    }

    // 2.12 — state (price-based) conditions
    #[test]
    fun evaluate_state() {
        let gt = ct::state_condition(ct::metric_price(), ct::op_gt(), 50000);
        assert!(ct::evaluate_condition(&gt, 0, 60000), 0);
        assert!(!ct::evaluate_condition(&gt, 0, 40000), 1);
        let lt = ct::state_condition(ct::metric_price(), ct::op_lt(), 50000);
        assert!(ct::evaluate_condition(&lt, 0, 40000), 2);
    }

    // 2.13 — composite AND/OR/NOT
    #[test]
    fun evaluate_composite() {
        let leaves = vector[
            ct::leaf_outcome(ct::outcome_succeeded()),
            ct::leaf_state(ct::metric_price(), ct::op_gt(), 100),
        ];
        let and_c = ct::composite(ct::op_and(), leaves);
        assert!(ct::evaluate_condition(&and_c, ct::outcome_succeeded(), 200), 0);
        assert!(!ct::evaluate_condition(&and_c, ct::outcome_succeeded(), 50), 1);
        assert!(!ct::evaluate_condition(&and_c, ct::outcome_failed(), 200), 2);

        let or_c = ct::composite(ct::op_or(), vector[
            ct::leaf_outcome(ct::outcome_succeeded()),
            ct::leaf_state(ct::metric_price(), ct::op_gt(), 100),
        ]);
        assert!(ct::evaluate_condition(&or_c, ct::outcome_failed(), 200), 3); // state true
        assert!(!ct::evaluate_condition(&or_c, ct::outcome_failed(), 50), 4);

        let not_c = ct::composite(ct::op_not(), vector[ct::leaf_outcome(ct::outcome_succeeded())]);
        assert!(ct::evaluate_condition(&not_c, ct::outcome_failed(), 0), 5);
        assert!(!ct::evaluate_condition(&not_c, ct::outcome_succeeded(), 0), 6);
    }

    // 2.9 + 2.10 + 2.14 — link (requires collateral), activate when met
    #[test]
    fun link_and_activate() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let child = object::id_from_address(@0xC1);
            let parent = object::id_from_address(@0x91);
            let cond = ct::outcome_condition(ct::outcome_succeeded());
            let collat = coin::mint_for_testing<SUI>(40, ctx);
            let mut node = ct::link_to_parent<SUI>(child, parent, option::none(), cond, collat, ctx);
            assert!(ct::pledged_collateral(&node) == 40, 0);
            assert!(!ct::is_activated(&node), 1);
            ct::activate_node<SUI>(&mut node, ct::outcome_succeeded(), 0, 25);
            assert!(ct::is_activated(&node), 2);
            assert!(ct::borrowed_amount(&node) == 25, 3);
            // drain via cascade to consume the node + return collateral
            let returned = ct::cascade_failure<SUI>(node, ctx);
            assert!(coin::burn_for_testing(returned) == 40, 4);
        };
        sc.end();
    }

    // 2.10 — linking with zero collateral fails
    #[test, expected_failure]
    fun link_requires_collateral() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let cond = ct::outcome_condition(ct::outcome_succeeded());
            let zero = coin::zero<SUI>(ctx);
            let node = ct::link_to_parent<SUI>(
                object::id_from_address(@0x1), object::id_from_address(@0x2),
                option::none(), cond, zero, ctx,
            );
            let c = ct::cascade_failure<SUI>(node, ctx);
            coin::burn_for_testing(c);
        };
        sc.end();
    }

    // 2.15 — activate fails when condition not met
    #[test, expected_failure]
    fun activate_fails_when_unmet() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let cond = ct::outcome_condition(ct::outcome_succeeded());
            let collat = coin::mint_for_testing<SUI>(10, ctx);
            let mut node = ct::link_to_parent<SUI>(
                object::id_from_address(@0x1), object::id_from_address(@0x2),
                option::none(), cond, collat, ctx,
            );
            ct::activate_node<SUI>(&mut node, ct::outcome_failed(), 0, 0); // not met → abort
            let c = ct::cascade_failure<SUI>(node, ctx);
            coin::burn_for_testing(c);
        };
        sc.end();
    }

    // 2.16 + 2.17 — 3-level tree activates when the root resolves
    #[test]
    fun three_level_cascade() {
        let mut sc = ts::begin(A);
        {
            let ctx = ts::ctx(&mut sc);
            let root = object::id_from_address(@0xF0);
            // level 1 depends on root succeeding
            let mut n1 = ct::link_to_parent<SUI>(
                object::id_from_address(@0xC1), root, option::none(),
                ct::outcome_condition(ct::outcome_succeeded()),
                coin::mint_for_testing<SUI>(30, ctx), ctx,
            );
            let n1_id = object::id(&n1);
            // level 2 depends on level 1
            let mut n2 = ct::link_to_parent<SUI>(
                object::id_from_address(@0xC2), ct::strategy_id(&n1), option::some(n1_id),
                ct::outcome_condition(ct::outcome_succeeded()),
                coin::mint_for_testing<SUI>(20, ctx), ctx,
            );
            let n2_id = object::id(&n2);
            // level 3 depends on level 2
            let mut n3 = ct::link_to_parent<SUI>(
                object::id_from_address(@0xC3), ct::strategy_id(&n2), option::some(n2_id),
                ct::outcome_condition(ct::outcome_succeeded()),
                coin::mint_for_testing<SUI>(10, ctx), ctx,
            );
            ct::register_child(&mut n1, n2_id);
            ct::register_child(&mut n2, object::id(&n3));

            // root resolves succeeded → cascade down each level
            ct::activate_node<SUI>(&mut n1, ct::outcome_succeeded(), 0, 15);
            ct::activate_node<SUI>(&mut n2, ct::outcome_succeeded(), 0, 10);
            ct::activate_node<SUI>(&mut n3, ct::outcome_succeeded(), 0, 5);
            assert!(ct::is_activated(&n1) && ct::is_activated(&n2) && ct::is_activated(&n3), 0);
            assert!(ct::children(&n1).length() == 1, 1);

            coin::burn_for_testing(ct::cascade_failure<SUI>(n1, ctx));
            coin::burn_for_testing(ct::cascade_failure<SUI>(n2, ctx));
            coin::burn_for_testing(ct::cascade_failure<SUI>(n3, ctx));
        };
        sc.end();
    }
}
