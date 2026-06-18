/// Capability-based permissions (architecture.md §11.2).
///
/// Every sensitive action requires a Move capability; the type system enforces
/// who can do what. Capabilities deliberately lack the `copy` ability, so they
/// cannot be duplicated (test 1.19 — a copy attempt fails to compile, which is
/// the guarantee we want). They are `store + key` so they can be held and
/// transferred but never forged.
module helix::access_control {

    /// Root capability minted once to the publisher. Gates issuance of the
    /// privileged TEE/marketplace capabilities.
    public struct AdminCap has key, store { id: UID }

    /// Held by the Nautilus Hedging Agent. Required to push Greeks updates and
    /// auto-hedge transactions onto a user's portfolio.
    public struct HedgerCap has key, store { id: UID }

    /// Granted on successful breeding-fee payment; consumed by `breeding::breed`.
    public struct BreederCap has key, store { id: UID }

    /// Held by the marketplace module for fee distribution.
    public struct MarketplaceCap has key, store { id: UID }

    /// Proves ownership of a specific strategy for off-object operations.
    public struct StrategyOwnerCap has key, store {
        id: UID,
        strategy_id: ID,
    }

    fun init(ctx: &mut TxContext) {
        transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    }

    // ---- admin-gated issuance ----

    public fun issue_hedger_cap(_admin: &AdminCap, recipient: address, ctx: &mut TxContext) {
        transfer::public_transfer(HedgerCap { id: object::new(ctx) }, recipient);
    }

    public fun issue_marketplace_cap(_admin: &AdminCap, recipient: address, ctx: &mut TxContext) {
        transfer::public_transfer(MarketplaceCap { id: object::new(ctx) }, recipient);
    }

    // ---- package-internal constructors (used by other HELIX modules) ----

    public(package) fun new_owner_cap(strategy_id: ID, ctx: &mut TxContext): StrategyOwnerCap {
        StrategyOwnerCap { id: object::new(ctx), strategy_id }
    }

    public(package) fun new_breeder_cap(ctx: &mut TxContext): BreederCap {
        BreederCap { id: object::new(ctx) }
    }

    public fun owner_cap_strategy_id(cap: &StrategyOwnerCap): ID { cap.strategy_id }

    /// Assert a `StrategyOwnerCap` matches the given strategy id.
    public fun assert_owns(cap: &StrategyOwnerCap, strategy_id: ID) {
        assert!(cap.strategy_id == strategy_id, EWrongStrategyCap);
    }

    const EWrongStrategyCap: u64 = 1;

    #[test_only]
    public fun new_admin_for_testing(ctx: &mut TxContext): AdminCap {
        AdminCap { id: object::new(ctx) }
    }

    #[test_only]
    public fun new_hedger_for_testing(ctx: &mut TxContext): HedgerCap {
        HedgerCap { id: object::new(ctx) }
    }

    #[test_only]
    public fun destroy_hedger_for_testing(cap: HedgerCap) {
        let HedgerCap { id } = cap;
        object::delete(id);
    }

    #[test_only]
    public fun destroy_admin_for_testing(cap: AdminCap) {
        let AdminCap { id } = cap;
        object::delete(id);
    }
}
