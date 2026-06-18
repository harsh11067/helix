/// PortfolioRiskObject — a user's unified portfolio risk picture
/// (architecture.md §2.3). Holds netted Greeks across all of the user's
/// strategies plus risk metrics and tolerances. Greeks are pushed by the
/// Nautilus Hedging Agent, which must present a `HedgerCap`.
module helix::portfolio_risk {
    use helix::signed::{Self, I64};
    use helix::events;
    use helix::access_control::HedgerCap;
    use helix::strategy::{Self, StrategyObject};

    const ENotOwner: u64 = 300;
    const EInvalidAttestation: u64 = 301;
    const EStrategyNotPresent: u64 = 302;

    // sensible defaults (scaled x100, like the Greeks themselves)
    const DEFAULT_DELTA_TOLERANCE: u64 = 5000;  // 50.00 net delta
    const DEFAULT_VEGA_TOLERANCE: u64 = 3000;   // 30.00 net vega

    public struct PortfolioRiskObject has key, store {
        id: UID,
        owner: address,
        active_strategies: vector<ID>,
        // cached Greeks (x100 fixed-point, signed)
        net_delta: I64,
        net_gamma: I64,
        net_theta: I64,
        net_vega: I64,
        net_rho: I64,
        // risk metrics
        portfolio_var_95: u64,
        portfolio_var_99: u64,
        max_drawdown_observed: u64,
        // user tolerances
        delta_tolerance: u64,
        vega_tolerance: u64,
        auto_hedge_enabled: bool,
        // hedge history
        hedge_actions_count: u64,
        last_hedge_attestation: vector<u8>,
    }

    public fun new_portfolio(ctx: &mut TxContext): PortfolioRiskObject {
        let owner = ctx.sender();
        let p = PortfolioRiskObject {
            id: object::new(ctx),
            owner,
            active_strategies: vector[],
            net_delta: signed::zero(),
            net_gamma: signed::zero(),
            net_theta: signed::zero(),
            net_vega: signed::zero(),
            net_rho: signed::zero(),
            portfolio_var_95: 0,
            portfolio_var_99: 0,
            max_drawdown_observed: 0,
            delta_tolerance: DEFAULT_DELTA_TOLERANCE,
            vega_tolerance: DEFAULT_VEGA_TOLERANCE,
            auto_hedge_enabled: false,
            hedge_actions_count: 0,
            last_hedge_attestation: vector[],
        };
        events::portfolio_created(object::id(&p), owner);
        p
    }

    public entry fun init_portfolio(ctx: &mut TxContext) {
        let p = new_portfolio(ctx);
        transfer::public_transfer(p, ctx.sender());
    }

    /// Add a strategy to the portfolio. Requires the caller to own BOTH the
    /// portfolio and the strategy (test 1.13).
    public fun add_strategy_to_portfolio(
        p: &mut PortfolioRiskObject, s: &StrategyObject, ctx: &TxContext,
    ) {
        assert!(p.owner == ctx.sender(), ENotOwner);
        assert!(strategy::owner(s) == ctx.sender(), ENotOwner);
        let sid = strategy::id(s);
        if (!p.active_strategies.contains(&sid)) {
            p.active_strategies.push_back(sid);
            events::strategy_added_to_portfolio(object::id(p), sid);
        }
    }

    public fun remove_strategy_from_portfolio(
        p: &mut PortfolioRiskObject, strategy_id: ID, ctx: &TxContext,
    ) {
        assert!(p.owner == ctx.sender(), ENotOwner);
        let (found, idx) = p.active_strategies.index_of(&strategy_id);
        assert!(found, EStrategyNotPresent);
        p.active_strategies.remove(idx);
        events::strategy_removed_from_portfolio(object::id(p), strategy_id);
    }

    public fun set_tolerances(
        p: &mut PortfolioRiskObject, delta_tol: u64, vega_tol: u64, auto_hedge: bool, ctx: &TxContext,
    ) {
        assert!(p.owner == ctx.sender(), ENotOwner);
        p.delta_tolerance = delta_tol;
        p.vega_tolerance = vega_tol;
        p.auto_hedge_enabled = auto_hedge;
    }

    /// Push a fresh Greeks vector. Gated by `HedgerCap` (test 1.14: callers
    /// without the cap cannot even form this call). A non-empty TEE attestation
    /// is required (test 1.15/1.16). Emits `GreeksUpdated` with a breach flag.
    public fun update_greeks(
        p: &mut PortfolioRiskObject,
        _hedger: &HedgerCap,
        delta_neg: bool, delta_mag: u64,
        gamma_neg: bool, gamma_mag: u64,
        theta_neg: bool, theta_mag: u64,
        vega_neg: bool, vega_mag: u64,
        rho_neg: bool, rho_mag: u64,
        attestation: vector<u8>,
    ) {
        assert!(!attestation.is_empty(), EInvalidAttestation);
        p.net_delta = signed::new(delta_neg, delta_mag);
        p.net_gamma = signed::new(gamma_neg, gamma_mag);
        p.net_theta = signed::new(theta_neg, theta_mag);
        p.net_vega  = signed::new(vega_neg, vega_mag);
        p.net_rho   = signed::new(rho_neg, rho_mag);

        let breached =
            signed::magnitude_gt(&p.net_delta, p.delta_tolerance)
            || signed::magnitude_gt(&p.net_vega, p.vega_tolerance);

        events::greeks_updated(
            object::id(p),
            delta_neg, delta_mag, vega_neg, vega_mag, breached,
        );
    }

    /// Record an executed auto-hedge (called after a hedge PTB succeeds).
    public fun record_hedge(p: &mut PortfolioRiskObject, _hedger: &HedgerCap, attestation: vector<u8>) {
        assert!(!attestation.is_empty(), EInvalidAttestation);
        p.hedge_actions_count = p.hedge_actions_count + 1;
        p.last_hedge_attestation = attestation;
    }

    // ---- accessors ----
    public fun owner(p: &PortfolioRiskObject): address { p.owner }
    public fun active_strategies(p: &PortfolioRiskObject): vector<ID> { p.active_strategies }
    public fun strategy_count(p: &PortfolioRiskObject): u64 { p.active_strategies.length() }
    public fun net_delta(p: &PortfolioRiskObject): I64 { p.net_delta }
    public fun net_vega(p: &PortfolioRiskObject): I64 { p.net_vega }
    public fun delta_tolerance(p: &PortfolioRiskObject): u64 { p.delta_tolerance }
    public fun vega_tolerance(p: &PortfolioRiskObject): u64 { p.vega_tolerance }
    public fun auto_hedge_enabled(p: &PortfolioRiskObject): bool { p.auto_hedge_enabled }
    public fun hedge_actions_count(p: &PortfolioRiskObject): u64 { p.hedge_actions_count }

    public fun delta_breached(p: &PortfolioRiskObject): bool {
        signed::magnitude_gt(&p.net_delta, p.delta_tolerance)
    }

    #[test_only]
    public fun destroy_for_testing(p: PortfolioRiskObject) {
        let PortfolioRiskObject {
            id, owner: _, active_strategies: _, net_delta: _, net_gamma: _, net_theta: _,
            net_vega: _, net_rho: _, portfolio_var_95: _, portfolio_var_99: _,
            max_drawdown_observed: _, delta_tolerance: _, vega_tolerance: _, auto_hedge_enabled: _,
            hedge_actions_count: _, last_hedge_attestation: _,
        } = p;
        object::delete(id);
    }
}
