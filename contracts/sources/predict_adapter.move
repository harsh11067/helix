/// predict_adapter — the single seam between HELIX and DeepBook Predict
/// (architecture.md §6, plan Phase 2). All Predict calls flow through here.
///
/// This is the REAL integration (ADR-003 flip): it composes the on-chain
/// `deepbook_predict::` package (branch `predict-testnet-4-16`), not the local
/// `mock_predict` stand-in. The real model differs structurally from the mock:
///   * there is no `Position` object — a position is the row
///     `PredictManager.positions[MarketKey] = quantity`;
///   * `PredictManager` is a shared object (created by `predict::create_manager`)
///     that holds an inner `BalanceManager`; mint pulls its cost from that
///     balance, so the manager must be funded (`fund_manager`) before minting;
///   * mint/redeem require the live `&OracleSVI` shared object and the `&Clock`.
///
/// Because `Predict`, `PredictManager`, and `OracleSVI` are shared objects
/// produced by Predict's own admin/init flow, this path is exercised on testnet
/// (dry-run + real tx), not in HELIX unit tests. The wrapper math and the
/// strategy/leg lifecycle are proven against `mock_predict` (test_only).
module helix::predict_adapter {
    use sui::coin::Coin;
    use sui::clock::Clock;
    use deepbook_predict::predict::{Self, Predict};
    use deepbook_predict::predict_manager::PredictManager;
    use deepbook_predict::oracle::{Self, OracleSVI};
    use deepbook_predict::market_key;
    use helix::strategy::{Self, StrategyObject};
    use helix::leg_factory::{Self, Leg};
    use helix::events;

    /// Create the caller's `PredictManager`. Returns its id; the object itself is
    /// shared by Predict and owned (logically) by the caller. Idempotency is the
    /// caller's concern — create once and reuse across strategies.
    public fun ensure_manager(ctx: &mut TxContext): ID {
        predict::create_manager(ctx)
    }

    /// Fund the manager's inner BalanceManager so subsequent mints can pay their
    /// premium. Caller must be the manager owner (enforced by Predict).
    public fun fund_manager<Quote>(
        manager: &mut PredictManager, deposit: Coin<Quote>, ctx: &TxContext,
    ) {
        manager.deposit<Quote>(deposit, ctx);
    }

    /// Mint a binary Predict position for a strategy leg, records the resulting
    /// `MarketKey` + quantity on the leg, registers the leg on the strategy, and
    /// emits `PositionMinted`. The premium is drawn from the manager's balance.
    public fun mint_for_leg<Quote>(
        predict: &mut Predict,
        manager: &mut PredictManager,
        oracle: &OracleSVI,
        clock: &Clock,
        strategy: &mut StrategyObject,
        leg: &mut Leg,
        expiry: u64,
        strike: u64,
        is_up: bool,
        quantity: u64,
        ctx: &mut TxContext,
    ) {
        let key = market_key::new(oracle::id(oracle), expiry, strike, is_up);
        predict::mint<Quote>(predict, manager, oracle, key, quantity, clock, ctx);
        leg_factory::bind_market(leg, key, quantity);
        strategy::add_leg(strategy, leg_factory::id(leg));
        // events::position_minted carries an ID + market_code tag; with no Position
        // object we use the oracle id as the market reference and 0/1 for up/down.
        let code = if (is_up) { 0 } else { 1 };
        events::position_minted(strategy::id(strategy), oracle::id(oracle), code, quantity);
    }

    /// Redeem a settled binary position. The payout is deposited into the
    /// manager's balance by Predict; we surface it via the balance delta and
    /// emit `PositionRedeemed`. Withdraw the proceeds with `withdraw`.
    public fun redeem<Quote>(
        predict: &mut Predict,
        manager: &mut PredictManager,
        oracle: &OracleSVI,
        clock: &Clock,
        expiry: u64,
        strike: u64,
        is_up: bool,
        quantity: u64,
        ctx: &mut TxContext,
    ) {
        let key = market_key::new(oracle::id(oracle), expiry, strike, is_up);
        let before = manager.balance<Quote>();
        predict::redeem_permissionless<Quote>(predict, manager, oracle, key, quantity, clock, ctx);
        let after = manager.balance<Quote>();
        events::position_redeemed(oracle::id(oracle), after - before);
    }

    /// Withdraw `amount` of `Quote` from the manager's balance back to the owner.
    public fun withdraw<Quote>(
        manager: &mut PredictManager, amount: u64, ctx: &mut TxContext,
    ): Coin<Quote> {
        manager.withdraw<Quote>(amount, ctx)
    }
}
