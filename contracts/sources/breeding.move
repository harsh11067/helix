/// breeding — crossover + mutation of strategy DNA (architecture.md §2.4,
/// plan Phase 2). Two breedable parents combine into a child whose genes are a
/// ~50/50 splice with a small mutation rate. Parent creators are registered for
/// royalties via a `BreedingEvent` record.
#[allow(lint(self_transfer))]
module helix::breeding {
    use sui::coin::{Self, Coin};
    use helix::dna::{Self, StrategyDNA};
    use helix::strategy::{Self, StrategyObject};
    use helix::access_control::StrategyOwnerCap;
    use helix::events;

    const ENotBreedable: u64 = 600;
    const EWrongFee: u64 = 601;

    const DEFAULT_ROYALTY_SPLIT_BPS: u16 = 1000; // 10% of child perf fees to parents

    /// Records a breeding operation and the royalty configuration that lets the
    /// parent creators earn from the child's future performance.
    public struct BreedingEvent has key, store {
        id: UID,
        parent_a: ID,
        parent_b: ID,
        child: ID,
        breeder: address,
        fee_paid: u64,
        parent_a_creator: address,
        parent_b_creator: address,
        royalty_split_bps: u16,
        epoch: u64,
    }

    /// Deterministic crossover. `seed` selects each gene's parent (bit per gene)
    /// and drives a single, range-safe mutation. In production the seed comes
    /// from Sui's `Random` / drand beacon; tests inject it for determinism.
    public fun crossover(a: &StrategyDNA, b: &StrategyDNA, seed: u64): StrategyDNA {
        let mut points = vector[];

        let dir_neg = pick_bool(seed, 0, dna::dir_negative(a), dna::dir_negative(b), &mut points);
        let dir_mag = pick_u8(seed, 0, dna::dir_magnitude(a), dna::dir_magnitude(b)); // same bit as sign (coherent)
        let conf    = pick_u8(seed, 1, dna::confidence(a), dna::confidence(b));
        if (bit(seed, 1)) { points.push_back(1) };
        let horizon = pick_u16(seed, 2, dna::horizon_days(a), dna::horizon_days(b));
        if (bit(seed, 2)) { points.push_back(2) };
        let mut vol  = pick_u8(seed, 3, dna::vol_view(a), dna::vol_view(b));
        if (bit(seed, 3)) { points.push_back(3) };
        let legs    = pick_u8(seed, 4, dna::leg_count(a), dna::leg_count(b));
        let pair    = pick_u8(seed, 5, dna::asset_pair_code(a), dna::asset_pair_code(b));
        let opt     = pick_bool(seed, 6, dna::uses_options(a), dna::uses_options(b), &mut points);
        let spot    = pick_bool(seed, 7, dna::uses_spot(a), dna::uses_spot(b), &mut points);
        let margin  = pick_bool(seed, 8, dna::uses_margin(a), dna::uses_margin(b), &mut points);
        let lev     = pick_u16(seed, 9, dna::leverage_x100(a), dna::leverage_x100(b));
        let e_sig   = pick_u8(seed, 10, dna::entry_signal_type(a), dna::entry_signal_type(b));
        let e_thr   = pick_u8(seed, 11, 40, 40); // thresholds inherited via signal genes; kept stable
        let x_sig   = pick_u8(seed, 12, dna::exit_signal_type(a), dna::exit_signal_type(b));
        let x_thr   = pick_u8(seed, 13, 60, 60);
        let reg     = pick_u8(seed, 14, dna::regime_sensitivity(a), dna::regime_sensitivity(b));
        let dd      = pick_u16(seed, 15, dna::max_drawdown_bps(a), dna::max_drawdown_bps(b));

        // ---- mutation: at most one gene (≤ ~5% of 21 genes), range-safe ----
        let mut mutations = dna::mutation_count(a);
        if (dna::mutation_count(b) > mutations) { mutations = dna::mutation_count(b) };
        if (bit(seed, 31)) {
            // nudge vol_view by a small delta, clamped to [0,100]
            let delta = (((seed >> 16) & 0x7) as u8) + 1; // 1..8
            vol = if (bit(seed, 30)) {
                if (vol + delta > 100) { 100 } else { vol + delta }
            } else {
                if (vol < delta) { 0 } else { vol - delta }
            };
            mutations = mutations + 1;
        };

        dna::new(
            dir_neg, dir_mag, conf, horizon, vol,
            legs, pair, opt, spot, margin, lev,
            e_sig, e_thr, x_sig, x_thr, reg,
            dd, false, 0,
            mutations, points,
        )
    }

    /// Breed two breedable parents. `fee` must equal the sum of both parents'
    /// breed fees and is routed to the two creators. `child_capital` is the
    /// breeder's committed capital for the new strategy.
    public fun breed<FeeCoin>(
        parent_a: &mut StrategyObject,
        parent_b: &mut StrategyObject,
        fee: Coin<FeeCoin>,
        child_capital: u64,
        seed: u64,
        attestation: vector<u8>,
        ctx: &mut TxContext,
    ): (StrategyObject, StrategyOwnerCap) {
        assert!(strategy::is_breedable(parent_a) && strategy::is_breedable(parent_b), ENotBreedable);
        let fee_a = strategy::breed_fee(parent_a);
        let fee_b = strategy::breed_fee(parent_b);
        let required = fee_a + fee_b;
        assert!(fee.value() == required, EWrongFee);

        let id_a = strategy::id(parent_a);
        let id_b = strategy::id(parent_b);
        let creator_a = strategy::creator(parent_a);
        let creator_b = strategy::creator(parent_b);

        // route fees to creators
        let mut fee_mut = fee;
        if (fee_a > 0) {
            transfer::public_transfer(fee_mut.split(fee_a, ctx), creator_a);
        };
        // remainder (fee_b) goes to creator_b; destroy if zero
        if (fee_mut.value() > 0) {
            transfer::public_transfer(fee_mut, creator_b);
        } else {
            fee_mut.destroy_zero();
        };

        // child DNA + generation
        let child_dna = crossover(strategy::dna(parent_a), strategy::dna(parent_b), seed);
        let mut gen = strategy::generation(parent_a);
        if (strategy::generation(parent_b) > gen) { gen = strategy::generation(parent_b) };
        gen = gen + 1;

        let (child, cap) = strategy::new_strategy(
            child_dna, child_capital, attestation, gen, vector[id_a, id_b], ctx.sender(), ctx,
        );
        let child_id = strategy::id(&child);

        // bump offspring counts
        let off_a = strategy::offspring_count(parent_a) + 1;
        strategy::set_offspring_count(parent_a, off_a);
        let off_b = strategy::offspring_count(parent_b) + 1;
        strategy::set_offspring_count(parent_b, off_b);

        // royalty record
        let evt = BreedingEvent {
            id: object::new(ctx),
            parent_a: id_a,
            parent_b: id_b,
            child: child_id,
            breeder: ctx.sender(),
            fee_paid: required,
            parent_a_creator: creator_a,
            parent_b_creator: creator_b,
            royalty_split_bps: DEFAULT_ROYALTY_SPLIT_BPS,
            epoch: ctx.epoch(),
        };
        transfer::public_transfer(evt, ctx.sender());

        events::breeding_executed(id_a, id_b, child_id, ctx.sender(), required, gen);
        (child, cap)
    }

    // ---- seed helpers ----
    fun bit(seed: u64, i: u8): bool { ((seed >> i) & 1) == 1 }
    fun pick_u8(seed: u64, i: u8, a: u8, b: u8): u8 { if (bit(seed, i)) { b } else { a } }
    fun pick_u16(seed: u64, i: u8, a: u16, b: u16): u16 { if (bit(seed, i)) { b } else { a } }
    fun pick_bool(seed: u64, i: u8, a: bool, b: bool, points: &mut vector<u8>): bool {
        if (bit(seed, i)) { points.push_back(i); b } else { a }
    }

    // ---- accessors ----
    public fun royalty_split_bps(e: &BreedingEvent): u16 { e.royalty_split_bps }
    public fun event_child(e: &BreedingEvent): ID { e.child }
    public fun event_parents(e: &BreedingEvent): (ID, ID) { (e.parent_a, e.parent_b) }
    public fun event_creators(e: &BreedingEvent): (address, address) { (e.parent_a_creator, e.parent_b_creator) }
    public fun fee_paid(e: &BreedingEvent): u64 { e.fee_paid }
}
