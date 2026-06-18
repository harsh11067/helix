/// leg_factory — creates the individual position legs of a strategy
/// (architecture.md §3, plan Phase 2). A `Leg` is a child object referenced by
/// a `StrategyObject`; once executed it records the underlying Predict position.
///
/// Real DeepBook Predict has no position *object* — a position is the row
/// `PredictManager.positions[MarketKey] = quantity`. So a minted leg stores the
/// canonical `MarketKey` (oracle + expiry + strike + direction) and the minted
/// quantity, not an object id (ADR-003 flip; see predict_adapter).
module helix::leg_factory {
    use deepbook_predict::market_key::MarketKey;

    // leg type codes
    const LEG_CALL: u8 = 0;
    const LEG_PUT: u8 = 1;
    const LEG_SPOT: u8 = 2;
    const LEG_BINARY: u8 = 3;
    const LEG_RANGE: u8 = 4;
    const MAX_LEG_TYPE: u8 = 4;

    const EBadLegType: u64 = 400;
    const EZeroSize: u64 = 401;

    public struct Leg has key, store {
        id: UID,
        leg_type: u8,
        size: u64,
        strike_x100: u64,
        is_long: bool,
        market: Option<MarketKey>, // the Predict position this leg minted into
        bound_qty: u64,            // quantity minted at that MarketKey
    }

    /// Plain description of a leg, used to bundle multi-leg structures.
    public struct LegSpec has copy, drop, store {
        leg_type: u8,
        size: u64,
        strike_x100: u64,
        is_long: bool,
    }

    public fun spec(leg_type: u8, size: u64, strike_x100: u64, is_long: bool): LegSpec {
        LegSpec { leg_type, size, strike_x100, is_long }
    }

    fun create(leg_type: u8, size: u64, strike_x100: u64, is_long: bool, ctx: &mut TxContext): Leg {
        assert!(leg_type <= MAX_LEG_TYPE, EBadLegType);
        assert!(size > 0, EZeroSize);
        Leg { id: object::new(ctx), leg_type, size, strike_x100, is_long, market: option::none(), bound_qty: 0 }
    }

    public fun create_call_leg(size: u64, strike_x100: u64, is_long: bool, ctx: &mut TxContext): Leg {
        create(LEG_CALL, size, strike_x100, is_long, ctx)
    }
    public fun create_put_leg(size: u64, strike_x100: u64, is_long: bool, ctx: &mut TxContext): Leg {
        create(LEG_PUT, size, strike_x100, is_long, ctx)
    }
    public fun create_spot_leg(size: u64, is_long: bool, ctx: &mut TxContext): Leg {
        create(LEG_SPOT, size, 0, is_long, ctx)
    }
    public fun create_binary_leg(size: u64, strike_x100: u64, is_long: bool, ctx: &mut TxContext): Leg {
        create(LEG_BINARY, size, strike_x100, is_long, ctx)
    }
    public fun create_range_leg(size: u64, lo_x100: u64, ctx: &mut TxContext): Leg {
        create(LEG_RANGE, size, lo_x100, true, ctx)
    }

    /// Bundle a whole structure. Built in one call so it is atomic within the
    /// deploy PTB — if any spec is invalid the whole transaction reverts
    /// (test 2.31 / 2.32).
    public fun create_strategy_legs(specs: vector<LegSpec>, ctx: &mut TxContext): vector<Leg> {
        let mut out = vector[];
        let mut i = 0;
        let n = specs.length();
        while (i < n) {
            let s = &specs[i];
            out.push_back(create(s.leg_type, s.size, s.strike_x100, s.is_long, ctx));
            i = i + 1;
        };
        out
    }

    /// Record the Predict market this leg minted into, and how much.
    public(package) fun bind_market(leg: &mut Leg, key: MarketKey, qty: u64) {
        leg.market = option::some(key);
        leg.bound_qty = qty;
    }

    // accessors
    public fun id(leg: &Leg): ID { object::id(leg) }
    public fun leg_type(leg: &Leg): u8 { leg.leg_type }
    public fun size(leg: &Leg): u64 { leg.size }
    public fun strike_x100(leg: &Leg): u64 { leg.strike_x100 }
    public fun is_long(leg: &Leg): bool { leg.is_long }
    public fun has_market(leg: &Leg): bool { leg.market.is_some() }
    public fun bound_qty(leg: &Leg): u64 { leg.bound_qty }
    public fun market(leg: &Leg): &Option<MarketKey> { &leg.market }

    // type code accessors
    public fun leg_call(): u8 { LEG_CALL }
    public fun leg_put(): u8 { LEG_PUT }
    public fun leg_spot(): u8 { LEG_SPOT }
    public fun leg_binary(): u8 { LEG_BINARY }
    public fun leg_range(): u8 { LEG_RANGE }

    #[test_only]
    public fun destroy_for_testing(leg: Leg) {
        let Leg { id, leg_type: _, size: _, strike_x100: _, is_long: _, market: _, bound_qty: _ } = leg;
        object::delete(id);
    }
}
