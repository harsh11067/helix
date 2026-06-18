/// Central event emission for HELIX.
///
/// Every on-chain state change emits a typed event so the off-chain Indexer
/// (Phase 3) can build denormalized read-models without re-deriving state.
/// Keeping all event structs in one module makes the externally-observable
/// surface auditable in one place (architecture.md §10.2, test 1.10/1.11).
module helix::events {
    use sui::event;

    // ---- Phase 1: strategy lifecycle ----

    public struct StrategyCreated has copy, drop {
        strategy_id: ID,
        owner: address,
        creator: address,
        generation: u64,
        initial_capital: u64,
        birth_epoch: u64,
    }

    public struct StrategyActivated has copy, drop {
        strategy_id: ID,
    }

    public struct StrategyClosed has copy, drop {
        strategy_id: ID,
        realized_pnl_negative: bool,
        realized_pnl_magnitude: u64,
    }

    public struct StrategyDied has copy, drop {
        strategy_id: ID,
        reason_code: u8, // 0 = drawdown kill-switch
        drawdown_bps: u64,
    }

    // ---- Phase 1: portfolio / risk ----

    public struct PortfolioCreated has copy, drop {
        portfolio_id: ID,
        owner: address,
    }

    public struct StrategyAddedToPortfolio has copy, drop {
        portfolio_id: ID,
        strategy_id: ID,
    }

    public struct StrategyRemovedFromPortfolio has copy, drop {
        portfolio_id: ID,
        strategy_id: ID,
    }

    public struct GreeksUpdated has copy, drop {
        portfolio_id: ID,
        net_delta_negative: bool,
        net_delta_magnitude: u64,
        net_vega_negative: bool,
        net_vega_magnitude: u64,
        tolerance_breached: bool,
    }

    // ---- package-visible emitters ----

    public(package) fun strategy_created(
        strategy_id: ID, owner: address, creator: address,
        generation: u64, initial_capital: u64, birth_epoch: u64,
    ) {
        event::emit(StrategyCreated {
            strategy_id, owner, creator, generation, initial_capital, birth_epoch,
        });
    }

    public(package) fun strategy_activated(strategy_id: ID) {
        event::emit(StrategyActivated { strategy_id });
    }

    public(package) fun strategy_closed(
        strategy_id: ID, realized_pnl_negative: bool, realized_pnl_magnitude: u64,
    ) {
        event::emit(StrategyClosed { strategy_id, realized_pnl_negative, realized_pnl_magnitude });
    }

    public(package) fun strategy_died(strategy_id: ID, reason_code: u8, drawdown_bps: u64) {
        event::emit(StrategyDied { strategy_id, reason_code, drawdown_bps });
    }

    public(package) fun portfolio_created(portfolio_id: ID, owner: address) {
        event::emit(PortfolioCreated { portfolio_id, owner });
    }

    public(package) fun strategy_added_to_portfolio(portfolio_id: ID, strategy_id: ID) {
        event::emit(StrategyAddedToPortfolio { portfolio_id, strategy_id });
    }

    public(package) fun strategy_removed_from_portfolio(portfolio_id: ID, strategy_id: ID) {
        event::emit(StrategyRemovedFromPortfolio { portfolio_id, strategy_id });
    }

    public(package) fun greeks_updated(
        portfolio_id: ID,
        net_delta_negative: bool, net_delta_magnitude: u64,
        net_vega_negative: bool, net_vega_magnitude: u64,
        tolerance_breached: bool,
    ) {
        event::emit(GreeksUpdated {
            portfolio_id, net_delta_negative, net_delta_magnitude,
            net_vega_negative, net_vega_magnitude, tolerance_breached,
        });
    }

    // ---- Phase 2: breeding / lineage ----

    public struct BreedingExecuted has copy, drop {
        parent_a: ID,
        parent_b: ID,
        child: ID,
        breeder: address,
        fee_paid: u64,
        child_generation: u64,
    }

    public(package) fun breeding_executed(
        parent_a: ID, parent_b: ID, child: ID, breeder: address, fee_paid: u64, child_generation: u64,
    ) {
        event::emit(BreedingExecuted { parent_a, parent_b, child, breeder, fee_paid, child_generation });
    }

    // ---- Phase 2: conviction tree ----

    public struct NodeLinked has copy, drop {
        node_id: ID,
        child_strategy: ID,
        parent_strategy: ID,
        pledged_collateral: u64,
    }

    public struct NodeActivated has copy, drop {
        node_id: ID,
        strategy_id: ID,
        borrowed_amount: u64,
    }

    public struct CascadeFailed has copy, drop {
        node_id: ID,
        returned_collateral: u64,
    }

    public(package) fun node_linked(
        node_id: ID, child_strategy: ID, parent_strategy: ID, pledged_collateral: u64,
    ) {
        event::emit(NodeLinked { node_id, child_strategy, parent_strategy, pledged_collateral });
    }

    public(package) fun node_activated(node_id: ID, strategy_id: ID, borrowed_amount: u64) {
        event::emit(NodeActivated { node_id, strategy_id, borrowed_amount });
    }

    public(package) fun cascade_failed(node_id: ID, returned_collateral: u64) {
        event::emit(CascadeFailed { node_id, returned_collateral });
    }

    // ---- Phase 2: marketplace ----

    public struct ListedBreedable has copy, drop { strategy_id: ID, breed_fee: u64 }
    public struct ListedCopyable has copy, drop { strategy_id: ID, copy_fee_bps: u16 }
    public struct StrategyCopied has copy, drop {
        original: ID, derived: ID, copier: address, fee_paid: u64,
    }

    public(package) fun listed_breedable(strategy_id: ID, breed_fee: u64) {
        event::emit(ListedBreedable { strategy_id, breed_fee });
    }
    public(package) fun listed_copyable(strategy_id: ID, copy_fee_bps: u16) {
        event::emit(ListedCopyable { strategy_id, copy_fee_bps });
    }
    public(package) fun strategy_copied(original: ID, derived: ID, copier: address, fee_paid: u64) {
        event::emit(StrategyCopied { original, derived, copier, fee_paid });
    }

    // ---- Phase 2: DeepBook Predict adapter ----

    public struct PositionMinted has copy, drop {
        strategy_id: ID,
        position_id: ID,
        market_code: u8,
        size: u64,
    }
    public struct PlpSupplied has copy, drop { manager_id: ID, amount: u64 }
    public struct PositionRedeemed has copy, drop { position_id: ID, payout: u64 }

    public(package) fun position_minted(strategy_id: ID, position_id: ID, market_code: u8, size: u64) {
        event::emit(PositionMinted { strategy_id, position_id, market_code, size });
    }
    public(package) fun plp_supplied(manager_id: ID, amount: u64) {
        event::emit(PlpSupplied { manager_id, amount });
    }
    public(package) fun position_redeemed(position_id: ID, payout: u64) {
        event::emit(PositionRedeemed { position_id, payout });
    }
}
