/// mock_predict — a faithful local stand-in for the on-chain DeepBook Predict
/// package (ADR-003 / decisions.md). It mirrors the entry points HELIX composes
/// with — `mint`, `supply`, `redeem_permissionless`, and the `PredictManager`
/// per-user account — over a `PlpVault` counterparty.
///
/// The production `predict_adapter` now composes the REAL `deepbook_predict::`
/// package (ADR-003 flip done). This module is retained `#[test_only]` as the
/// deterministic counterparty that proves the wrapper math and the strategy/leg
/// lifecycle in unit tests — the real Predict shared objects cannot be
/// instantiated inside `test_scenario`. It is excluded from published bytecode.
#[test_only]
module helix::mock_predict {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};

    // market codes (mirror the Predict instrument set)
    const MARKET_BINARY: u8 = 0;
    const MARKET_RANGE: u8 = 1;
    const MARKET_CALL: u8 = 2;
    const MARKET_PUT: u8 = 3;
    const MARKET_SPREAD: u8 = 4;
    const MAX_MARKET: u8 = 4;

    const EBadMarket: u64 = 500;
    const EZeroSize: u64 = 501;
    const ENotSettled: u64 = 502;
    const EInsufficientLiquidity: u64 = 503;

    /// Predict Liquidity Provider vault — counterparty to every trade.
    public struct PlpVault<phantom T> has key {
        id: UID,
        liquidity: Balance<T>,
        outstanding: u64, // notional of open positions backed by the vault
    }

    /// Per-user account object that holds positions (mirrors predict::PredictManager).
    public struct PredictManager<phantom T> has key, store {
        id: UID,
        owner: address,
        position_count: u64,
        open_notional: u64,
    }

    /// A minted position.
    public struct Position<phantom T> has key, store {
        id: UID,
        manager: ID,
        market_code: u8,
        size: u64,
        strike_x100: u64,
        premium: u64,
        settled: bool,
        win: bool,
    }

    /// Deploy the shared PLP vault. (In production this already exists on-chain.)
    public fun create_vault<T>(seed: Coin<T>, ctx: &mut TxContext) {
        let v = PlpVault<T> { id: object::new(ctx), liquidity: seed.into_balance(), outstanding: 0 };
        transfer::share_object(v);
    }

    public fun new_manager<T>(ctx: &mut TxContext): PredictManager<T> {
        PredictManager<T> { id: object::new(ctx), owner: ctx.sender(), position_count: 0, open_notional: 0 }
    }

    /// Mint a position against the vault. The premium `payment` flows to the
    /// vault; the vault must have capacity to cover `size` notional.
    public fun mint<T>(
        vault: &mut PlpVault<T>,
        manager: &mut PredictManager<T>,
        market_code: u8,
        size: u64,
        strike_x100: u64,
        payment: Coin<T>,
        ctx: &mut TxContext,
    ): Position<T> {
        assert!(market_code <= MAX_MARKET, EBadMarket);
        assert!(size > 0, EZeroSize);
        assert!(vault.liquidity.value() >= size, EInsufficientLiquidity);

        let premium = payment.value();
        vault.liquidity.join(payment.into_balance());
        vault.outstanding = vault.outstanding + size;
        manager.position_count = manager.position_count + 1;
        manager.open_notional = manager.open_notional + size;

        Position<T> {
            id: object::new(ctx),
            manager: object::id(manager),
            market_code,
            size,
            strike_x100,
            premium,
            settled: false,
            win: false,
        }
    }

    /// Supply liquidity into the PLP vault.
    public fun supply<T>(vault: &mut PlpVault<T>, deposit: Coin<T>) {
        vault.liquidity.join(deposit.into_balance());
    }

    /// Settle a position to a known outcome (oracle-driven in production).
    public fun settle<T>(vault: &mut PlpVault<T>, position: &mut Position<T>, win: bool) {
        if (!position.settled) {
            position.settled = true;
            position.win = win;
            vault.outstanding = if (vault.outstanding >= position.size) {
                vault.outstanding - position.size
            } else { 0 };
        }
    }

    /// Claim a settled position. Winners receive `size` from the vault; losers
    /// receive an empty coin (premium already captured by the vault).
    public fun redeem_permissionless<T>(
        vault: &mut PlpVault<T>,
        manager: &mut PredictManager<T>,
        position: Position<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(position.settled, ENotSettled);
        let Position { id, manager: _, market_code: _, size, strike_x100: _, premium: _, settled: _, win } = position;
        object::delete(id);
        if (manager.open_notional >= size) { manager.open_notional = manager.open_notional - size; };
        if (win) {
            coin::from_balance(vault.liquidity.split(size), ctx)
        } else {
            coin::zero<T>(ctx)
        }
    }

    // ---- reads ----
    public fun utilization_bps<T>(vault: &PlpVault<T>): u64 {
        let liq = vault.liquidity.value();
        if (liq == 0) { 10000 } else { vault.outstanding * 10000 / (liq + vault.outstanding) }
    }
    public fun liquidity<T>(vault: &PlpVault<T>): u64 { vault.liquidity.value() }
    public fun position_count<T>(m: &PredictManager<T>): u64 { m.position_count }
    public fun open_notional<T>(m: &PredictManager<T>): u64 { m.open_notional }
    public fun manager_owner<T>(m: &PredictManager<T>): address { m.owner }
    public fun position_market<T>(p: &Position<T>): u8 { p.market_code }
    public fun position_size<T>(p: &Position<T>): u64 { p.size }
    public fun position_settled<T>(p: &Position<T>): bool { p.settled }

    public fun market_binary(): u8 { MARKET_BINARY }
    public fun market_range(): u8 { MARKET_RANGE }
    public fun market_call(): u8 { MARKET_CALL }
    public fun market_put(): u8 { MARKET_PUT }
    public fun market_spread(): u8 { MARKET_SPREAD }

    #[test_only]
    public fun destroy_manager_for_testing<T>(m: PredictManager<T>) {
        let PredictManager { id, owner: _, position_count: _, open_notional: _ } = m;
        object::delete(id);
    }
}
