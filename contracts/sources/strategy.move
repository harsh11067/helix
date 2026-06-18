/// StrategyObject — the atomic unit of HELIX (architecture.md §2.1).
/// A deployed strategy with identity (DNA), lifecycle, positions, performance,
/// and social configuration. Lives as an owned Sui object.
module helix::strategy {
    use helix::dna::{Self, StrategyDNA};
    use helix::signed::{Self, I64};
    use helix::events;
    use helix::access_control::{Self, StrategyOwnerCap};

    // ---- lifecycle status ----
    const STATUS_PENDING: u8 = 0;
    const STATUS_ACTIVE: u8 = 1;
    const STATUS_CLOSED: u8 = 2;
    const STATUS_DEAD: u8 = 3;

    // ---- death reasons ----
    const REASON_DRAWDOWN: u8 = 0;

    const ENotOwner: u64 = 200;
    const ENotPending: u64 = 201;
    const ETerminal: u64 = 202;
    const EEmptyAttestation: u64 = 203;

    public struct StrategyObject has key, store {
        id: UID,
        owner: address,
        creator: address,                 // for royalty routing
        dna: StrategyDNA,
        generation: u64,
        parents: vector<ID>,              // 0 = primordial, 1 = asexual, 2 = bred
        status: u8,
        birth_epoch: u64,
        death_epoch: Option<u64>,
        legs: vector<ID>,                 // ids of this strategy's helix::leg_factory::Leg objects
        initial_capital: u64,
        current_capital: u64,
        realized_pnl: I64,
        unrealized_pnl: I64,
        fitness_score: u64,
        is_breedable: bool,
        is_copyable: bool,
        copy_fee_bps: u16,
        breed_fee: u64,
        copies_count: u64,
        offspring_count: u64,
        compiler_attestation: vector<u8>, // proof of Nautilus TEE compilation
        performance_history_blob: vector<u8>,
    }

    /// Construct a strategy and its owner capability. Returns both so callers
    /// (and tests) can route them; `create_strategy` is the entry wrapper.
    public fun new_strategy(
        dna: StrategyDNA,
        initial_capital: u64,
        compiler_attestation: vector<u8>,
        generation: u64,
        parents: vector<ID>,
        creator: address,
        ctx: &mut TxContext,
    ): (StrategyObject, StrategyOwnerCap) {
        dna::assert_valid(&dna);
        // attestation presence is required even in Phase 1; real TEE verification
        // is layered in via compiler_bridge in Phase 3.
        assert!(!compiler_attestation.is_empty(), EEmptyAttestation);

        let owner = ctx.sender();
        let s = StrategyObject {
            id: object::new(ctx),
            owner,
            creator,
            dna,
            generation,
            parents,
            status: STATUS_PENDING,
            birth_epoch: ctx.epoch(),
            death_epoch: option::none(),
            legs: vector[],
            initial_capital,
            current_capital: initial_capital,
            realized_pnl: signed::zero(),
            unrealized_pnl: signed::zero(),
            fitness_score: initial_capital,
            is_breedable: false,
            is_copyable: false,
            copy_fee_bps: 0,
            breed_fee: 0,
            copies_count: 0,
            offspring_count: 0,
            compiler_attestation,
            performance_history_blob: vector[],
        };
        let sid = object::id(&s);
        events::strategy_created(sid, owner, creator, generation, initial_capital, ctx.epoch());
        let cap = access_control::new_owner_cap(sid, ctx);
        (s, cap)
    }

    /// Entry: compile-then-deploy convenience. Transfers object + owner cap to caller.
    public entry fun create_strategy(
        dna: StrategyDNA,
        initial_capital: u64,
        compiler_attestation: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let (s, cap) = new_strategy(
            dna, initial_capital, compiler_attestation, 0, vector[], ctx.sender(), ctx,
        );
        transfer::public_transfer(s, ctx.sender());
        transfer::public_transfer(cap, ctx.sender());
    }

    // ---- lifecycle transitions ----

    public fun activate(s: &mut StrategyObject, ctx: &TxContext) {
        assert!(s.owner == ctx.sender(), ENotOwner);
        assert!(s.status == STATUS_PENDING, ENotPending);
        s.status = STATUS_ACTIVE;
        events::strategy_activated(object::id(s));
    }

    public fun close_strategy(s: &mut StrategyObject, ctx: &TxContext) {
        assert!(s.owner == ctx.sender(), ENotOwner);
        assert!(s.status == STATUS_PENDING || s.status == STATUS_ACTIVE, ETerminal);
        s.status = STATUS_CLOSED;
        s.death_epoch = option::some(ctx.epoch());
        events::strategy_closed(
            object::id(s), signed::is_negative(&s.realized_pnl), signed::magnitude(&s.realized_pnl),
        );
    }

    /// Apply a P&L update (called by execution / hedger paths). Recomputes
    /// current capital and fitness, and trips the drawdown kill-switch when the
    /// realized loss breaches `max_drawdown_bps` (test 1.9).
    public(package) fun apply_pnl(
        s: &mut StrategyObject, realized: I64, unrealized: I64, ctx: &TxContext,
    ) {
        s.realized_pnl = realized;
        s.unrealized_pnl = unrealized;
        if (signed::is_negative(&realized)) {
            let loss = signed::magnitude(&realized);
            s.current_capital = if (loss >= s.initial_capital) { 0 } else { s.initial_capital - loss };
        } else {
            s.current_capital = s.initial_capital + signed::magnitude(&realized);
        };
        s.fitness_score = s.current_capital;

        if (s.status == STATUS_ACTIVE && signed::is_negative(&realized) && s.initial_capital > 0) {
            let dd_bps = signed::magnitude(&realized) * 10000 / s.initial_capital;
            if (dd_bps >= (dna::max_drawdown_bps(&s.dna) as u64)) {
                mark_dead(s, REASON_DRAWDOWN, dd_bps, ctx);
            }
        }
    }

    public(package) fun mark_dead(s: &mut StrategyObject, reason: u8, drawdown_bps: u64, ctx: &TxContext) {
        s.status = STATUS_DEAD;
        s.death_epoch = option::some(ctx.epoch());
        events::strategy_died(object::id(s), reason, drawdown_bps);
    }

    public(package) fun add_leg(s: &mut StrategyObject, leg_id: ID) {
        s.legs.push_back(leg_id);
    }

    public(package) fun set_offspring_count(s: &mut StrategyObject, n: u64) { s.offspring_count = n; }
    public(package) fun set_copies_count(s: &mut StrategyObject, n: u64) { s.copies_count = n; }
    public(package) fun set_breedable(s: &mut StrategyObject, v: bool, fee: u64) {
        s.is_breedable = v; s.breed_fee = fee;
    }
    public(package) fun set_copyable(s: &mut StrategyObject, v: bool, fee_bps: u16) {
        s.is_copyable = v; s.copy_fee_bps = fee_bps;
    }

    // ---- read accessors ----

    public fun owner(s: &StrategyObject): address { s.owner }
    public fun creator(s: &StrategyObject): address { s.creator }
    public fun status(s: &StrategyObject): u8 { s.status }
    public fun generation(s: &StrategyObject): u64 { s.generation }
    public fun parents(s: &StrategyObject): vector<ID> { s.parents }
    public fun dna(s: &StrategyObject): &StrategyDNA { &s.dna }
    public fun initial_capital(s: &StrategyObject): u64 { s.initial_capital }
    public fun current_capital(s: &StrategyObject): u64 { s.current_capital }
    public fun fitness_score(s: &StrategyObject): u64 { s.fitness_score }
    public fun is_breedable(s: &StrategyObject): bool { s.is_breedable }
    public fun is_copyable(s: &StrategyObject): bool { s.is_copyable }
    public fun copy_fee_bps(s: &StrategyObject): u16 { s.copy_fee_bps }
    public fun breed_fee(s: &StrategyObject): u64 { s.breed_fee }
    public fun offspring_count(s: &StrategyObject): u64 { s.offspring_count }
    public fun copies_count(s: &StrategyObject): u64 { s.copies_count }
    public fun id(s: &StrategyObject): ID { object::id(s) }
    public fun num_legs(s: &StrategyObject): u64 { s.legs.length() }

    // status code accessors
    public fun status_pending(): u8 { STATUS_PENDING }
    public fun status_active(): u8 { STATUS_ACTIVE }
    public fun status_closed(): u8 { STATUS_CLOSED }
    public fun status_dead(): u8 { STATUS_DEAD }

    #[test_only]
    public fun destroy_for_testing(s: StrategyObject) {
        let StrategyObject {
            id, owner: _, creator: _, dna: _, generation: _, parents: _, status: _,
            birth_epoch: _, death_epoch: _, legs: _, initial_capital: _, current_capital: _,
            realized_pnl: _, unrealized_pnl: _, fitness_score: _, is_breedable: _, is_copyable: _,
            copy_fee_bps: _, breed_fee: _, copies_count: _, offspring_count: _,
            compiler_attestation: _, performance_history_blob: _,
        } = s;
        object::delete(id);
    }

    #[test_only]
    public fun destroy_owner_cap_for_testing(cap: StrategyOwnerCap) {
        // delegate to access_control test helper-free path: just transfer to 0x0 not allowed;
        // owner caps are key+store, so unpack via its module is not possible here.
        // Instead, send to the framework's burn address in tests.
        transfer::public_transfer(cap, @0x0);
    }
}
