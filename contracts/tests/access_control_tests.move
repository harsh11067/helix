#[test_only]
module helix::access_control_tests {
    use sui::test_scenario as ts;
    use helix::access_control::{Self, AdminCap, HedgerCap};

    const ADMIN: address = @0xAD;
    const HEDGER: address = @0xBE;

    // 1.17 — capabilities can be created and transferred
    #[test]
    fun admin_issues_and_transfers_hedger_cap() {
        let mut sc = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut sc);
            let admin = access_control::new_admin_for_testing(ctx);
            access_control::issue_hedger_cap(&admin, HEDGER, ctx);
            access_control::destroy_admin_for_testing(admin);
        };
        // hedger cap landed in HEDGER's inventory
        ts::next_tx(&mut sc, HEDGER);
        {
            let cap = ts::take_from_sender<HedgerCap>(&sc);
            ts::return_to_sender(&sc, cap);
        };
        sc.end();
    }

    // 1.18/1.19 are compile-time guarantees:
    //   * Functions requiring a cap take `&Cap` / `&AdminCap`; a caller without
    //     one cannot construct the call (no runtime test can exercise the absence).
    //   * Capabilities lack the `copy` ability, so a duplication attempt fails to
    //     compile. We document the intent here rather than write non-compiling code.
    #[test]
    fun admin_cap_exists() {
        let mut sc = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut sc);
            let admin: AdminCap = access_control::new_admin_for_testing(ctx);
            access_control::destroy_admin_for_testing(admin);
        };
        sc.end();
    }
}
