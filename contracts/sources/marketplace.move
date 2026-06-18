/// marketplace — copy + breed listing and fee distribution (architecture.md §2.5,
/// plan Phase 2). Owners list strategies as copyable/breedable; copiers clone a
/// strategy's DNA with their own capital, paying a fee that routes to the
/// original creator, and ongoing performance fees keep flowing via the
/// `CopyRelationship` record.
module helix::marketplace {
    use sui::coin::{Self, Coin};
    use helix::strategy::{Self, StrategyObject};
    use helix::access_control::StrategyOwnerCap;
    use helix::events;

    const ENotOwner: u64 = 700;
    const ENotCopyable: u64 = 701;
    const EWrongFee: u64 = 702;

    public struct CopyRelationship has key, store {
        id: UID,
        copier: address,
        original_strategy_id: ID,
        derived_strategy_id: ID,
        fee_bps: u16,
        capital_committed: u64,
        fees_paid_to_original: u64,
        started_epoch: u64,
    }

    public fun list_as_breedable(s: &mut StrategyObject, breed_fee: u64, ctx: &TxContext) {
        assert!(strategy::owner(s) == ctx.sender(), ENotOwner);
        strategy::set_breedable(s, true, breed_fee);
        events::listed_breedable(strategy::id(s), breed_fee);
    }

    public fun list_as_copyable(s: &mut StrategyObject, copy_fee_bps: u16, ctx: &TxContext) {
        assert!(strategy::owner(s) == ctx.sender(), ENotOwner);
        strategy::set_copyable(s, true, copy_fee_bps);
        events::listed_copyable(strategy::id(s), copy_fee_bps);
    }

    /// Copy a copyable strategy. Clones DNA into a new strategy owned by the
    /// copier but with `creator` preserved as the original creator (so royalties
    /// keep routing). Copy fee = capital * fee_bps / 10000 → original creator.
    public fun copy_strategy<FeeCoin>(
        original: &mut StrategyObject,
        capital_committed: u64,
        fee_payment: Coin<FeeCoin>,
        attestation: vector<u8>,
        ctx: &mut TxContext,
    ): (StrategyObject, StrategyOwnerCap, CopyRelationship) {
        assert!(strategy::is_copyable(original), ENotCopyable);
        let fee_bps = strategy::copy_fee_bps(original);
        let required = capital_committed * (fee_bps as u64) / 10000;
        assert!(fee_payment.value() == required, EWrongFee);

        let creator = strategy::creator(original);
        if (required > 0) {
            transfer::public_transfer(fee_payment, creator);
        } else {
            fee_payment.destroy_zero();
        };

        let dna_clone = *strategy::dna(original);
        let original_id = strategy::id(original);
        let (derived, cap) = strategy::new_strategy(
            dna_clone, capital_committed, attestation, 0, vector[original_id], creator, ctx,
        );
        let copies = strategy::copies_count(original) + 1;
        strategy::set_copies_count(original, copies);

        let derived_id = strategy::id(&derived);
        let rel = CopyRelationship {
            id: object::new(ctx),
            copier: ctx.sender(),
            original_strategy_id: original_id,
            derived_strategy_id: derived_id,
            fee_bps,
            capital_committed,
            fees_paid_to_original: required,
            started_epoch: ctx.epoch(),
        };
        events::strategy_copied(original_id, derived_id, ctx.sender(), required);
        (derived, cap, rel)
    }

    /// Performance-fee accrual: a share of a derived strategy's realized profit
    /// routes to the original creator over time (test 2.22).
    public fun route_performance_fee<FeeCoin>(
        rel: &mut CopyRelationship, original_creator: address, profit_fee: Coin<FeeCoin>,
    ) {
        rel.fees_paid_to_original = rel.fees_paid_to_original + profit_fee.value();
        transfer::public_transfer(profit_fee, original_creator);
    }

    // ---- accessors ----
    public fun copier(r: &CopyRelationship): address { r.copier }
    public fun original_strategy_id(r: &CopyRelationship): ID { r.original_strategy_id }
    public fun derived_strategy_id(r: &CopyRelationship): ID { r.derived_strategy_id }
    public fun fees_paid_to_original(r: &CopyRelationship): u64 { r.fees_paid_to_original }
    public fun capital_committed(r: &CopyRelationship): u64 { r.capital_committed }
}
