/// StrategyDNA — the structured parameter vector encoding a strategy's behavior
/// (architecture.md §2.1). Holds conviction genes (what the user expressed),
/// structure genes (how the AI compiled it), behavioral genes, and risk genes.
///
/// Provides: validation, BCS serialization round-trip, similarity, equality.
module helix::dna {
    use sui::bcs;

    // ---- gene domain constants ----
    const MAX_PCT: u8 = 100;          // direction magnitude / confidence / vol / thresholds
    const MAX_LEGS: u8 = 4;           // up to 4-leg structures
    const MAX_ASSET_PAIR: u8 = 8;     // enum of supported pairs
    const MAX_SIGNAL_TYPE: u8 = 3;    // momentum / mean_reversion / breakout / range
    const MIN_LEVERAGE_X100: u16 = 100;   // 1x
    const MAX_LEVERAGE_X100: u16 = 1000;  // 10x cap

    /// signal type codes
    const SIGNAL_MOMENTUM: u8 = 0;
    const SIGNAL_MEAN_REVERSION: u8 = 1;
    const SIGNAL_BREAKOUT: u8 = 2;
    const SIGNAL_RANGE: u8 = 3;

    const EInvalidDNA: u64 = 100;

    public struct StrategyDNA has store, copy, drop {
        // -- conviction genes (user-expressed) --
        dir_negative: bool,        // direction sign (true = bearish)
        dir_magnitude: u8,         // 0..100  => -100..+100 with sign
        confidence: u8,            // 0..100
        horizon_days: u16,         // expressed horizon (sub-hour markets store minutes/1440 fraction = 0; kept u16 for generality)
        vol_view: u8,              // 0=calm, 50=neutral, 100=explosive

        // -- structure genes (AI-compiled) --
        leg_count: u8,             // 1..4
        asset_pair_code: u8,       // 0..MAX_ASSET_PAIR
        uses_options: bool,
        uses_spot: bool,
        uses_margin: bool,
        leverage_x100: u16,        // 100 = 1x

        // -- behavioral genes --
        entry_signal_type: u8,     // 0..3
        entry_threshold: u8,       // 0..100
        exit_signal_type: u8,      // 0..3
        exit_threshold: u8,        // 0..100
        regime_sensitivity: u8,    // 0..100

        // -- risk genes --
        max_drawdown_bps: u16,     // auto-death threshold (basis points)
        hedge_neg: bool,           // hedge_threshold_delta sign
        hedge_delta_mag: u16,      // |hedge_threshold_delta|

        // -- meta --
        mutation_count: u8,
        crossover_points: vector<u8>,
    }

    #[allow(lint(public_entry))]
    public fun new(
        dir_negative: bool, dir_magnitude: u8, confidence: u8, horizon_days: u16, vol_view: u8,
        leg_count: u8, asset_pair_code: u8, uses_options: bool, uses_spot: bool, uses_margin: bool,
        leverage_x100: u16,
        entry_signal_type: u8, entry_threshold: u8, exit_signal_type: u8, exit_threshold: u8,
        regime_sensitivity: u8,
        max_drawdown_bps: u16, hedge_neg: bool, hedge_delta_mag: u16,
        mutation_count: u8, crossover_points: vector<u8>,
    ): StrategyDNA {
        let d = StrategyDNA {
            dir_negative: dir_negative && dir_magnitude != 0, dir_magnitude, confidence, horizon_days, vol_view,
            leg_count, asset_pair_code, uses_options, uses_spot, uses_margin, leverage_x100,
            entry_signal_type, entry_threshold, exit_signal_type, exit_threshold, regime_sensitivity,
            max_drawdown_bps, hedge_neg: hedge_neg && hedge_delta_mag != 0, hedge_delta_mag,
            mutation_count, crossover_points,
        };
        assert_valid(&d);
        d
    }

    // ---- validation ----

    public fun is_valid(d: &StrategyDNA): bool {
        d.dir_magnitude <= MAX_PCT
            && d.confidence <= MAX_PCT
            && d.vol_view <= MAX_PCT
            && d.regime_sensitivity <= MAX_PCT
            && d.entry_threshold <= MAX_PCT
            && d.exit_threshold <= MAX_PCT
            && d.leg_count >= 1 && d.leg_count <= MAX_LEGS
            && d.asset_pair_code <= MAX_ASSET_PAIR
            && d.entry_signal_type <= MAX_SIGNAL_TYPE
            && d.exit_signal_type <= MAX_SIGNAL_TYPE
            && d.leverage_x100 >= MIN_LEVERAGE_X100
            && d.leverage_x100 <= MAX_LEVERAGE_X100
            && (!d.dir_negative || d.dir_magnitude != 0)
            && (!d.hedge_neg || d.hedge_delta_mag != 0)
    }

    public fun assert_valid(d: &StrategyDNA) {
        assert!(is_valid(d), EInvalidDNA);
    }

    // ---- serialization round-trip (test 1.2) ----

    public fun to_bytes(d: &StrategyDNA): vector<u8> {
        bcs::to_bytes(d)
    }

    /// Deserialize peeling fields in declaration order (BCS preserves field order).
    public fun from_bytes(bytes: vector<u8>): StrategyDNA {
        let mut b = bcs::new(bytes);
        let dir_negative = b.peel_bool();
        let dir_magnitude = b.peel_u8();
        let confidence = b.peel_u8();
        let horizon_days = b.peel_u16();
        let vol_view = b.peel_u8();
        let leg_count = b.peel_u8();
        let asset_pair_code = b.peel_u8();
        let uses_options = b.peel_bool();
        let uses_spot = b.peel_bool();
        let uses_margin = b.peel_bool();
        let leverage_x100 = b.peel_u16();
        let entry_signal_type = b.peel_u8();
        let entry_threshold = b.peel_u8();
        let exit_signal_type = b.peel_u8();
        let exit_threshold = b.peel_u8();
        let regime_sensitivity = b.peel_u8();
        let max_drawdown_bps = b.peel_u16();
        let hedge_neg = b.peel_bool();
        let hedge_delta_mag = b.peel_u16();
        let mutation_count = b.peel_u8();
        let crossover_points = b.peel_vec_u8();
        StrategyDNA {
            dir_negative, dir_magnitude, confidence, horizon_days, vol_view,
            leg_count, asset_pair_code, uses_options, uses_spot, uses_margin, leverage_x100,
            entry_signal_type, entry_threshold, exit_signal_type, exit_threshold, regime_sensitivity,
            max_drawdown_bps, hedge_neg, hedge_delta_mag, mutation_count, crossover_points,
        }
    }

    // ---- equality & similarity ----

    public fun equals(a: &StrategyDNA, b: &StrategyDNA): bool { a == b }

    /// Returns a similarity score in [0,100]: 100 = identical on the compared
    /// genes, 0 = maximally opposite (test 1.4). Compares the four conviction-/
    /// behavior-defining genes that matter for breeding selection.
    public fun similarity(a: &StrategyDNA, b: &StrategyDNA): u64 {
        // direction on a 0..200 axis (100 = neutral)
        let da = dir_axis(a);
        let db = dir_axis(b);
        let d_dir = abs_diff(da, db) / 2;                 // normalize 0..200 -> 0..100
        let d_conf = abs_diff((a.confidence as u64), (b.confidence as u64));
        let d_vol  = abs_diff((a.vol_view as u64), (b.vol_view as u64));
        let d_reg  = abs_diff((a.regime_sensitivity as u64), (b.regime_sensitivity as u64));
        let avg = (d_dir + d_conf + d_vol + d_reg) / 4;
        if (avg >= 100) { 0 } else { 100 - avg }
    }

    fun dir_axis(d: &StrategyDNA): u64 {
        if (d.dir_negative) { 100 - (d.dir_magnitude as u64) } else { 100 + (d.dir_magnitude as u64) }
    }

    fun abs_diff(a: u64, b: u64): u64 { if (a >= b) { a - b } else { b - a } }

    // ---- getters (used by breeding / compiler_bridge / strategy) ----

    public fun dir_negative(d: &StrategyDNA): bool { d.dir_negative }
    public fun dir_magnitude(d: &StrategyDNA): u8 { d.dir_magnitude }
    public fun confidence(d: &StrategyDNA): u8 { d.confidence }
    public fun horizon_days(d: &StrategyDNA): u16 { d.horizon_days }
    public fun vol_view(d: &StrategyDNA): u8 { d.vol_view }
    public fun leg_count(d: &StrategyDNA): u8 { d.leg_count }
    public fun asset_pair_code(d: &StrategyDNA): u8 { d.asset_pair_code }
    public fun uses_options(d: &StrategyDNA): bool { d.uses_options }
    public fun uses_spot(d: &StrategyDNA): bool { d.uses_spot }
    public fun uses_margin(d: &StrategyDNA): bool { d.uses_margin }
    public fun leverage_x100(d: &StrategyDNA): u16 { d.leverage_x100 }
    public fun entry_signal_type(d: &StrategyDNA): u8 { d.entry_signal_type }
    public fun exit_signal_type(d: &StrategyDNA): u8 { d.exit_signal_type }
    public fun regime_sensitivity(d: &StrategyDNA): u8 { d.regime_sensitivity }
    public fun max_drawdown_bps(d: &StrategyDNA): u16 { d.max_drawdown_bps }
    public fun mutation_count(d: &StrategyDNA): u8 { d.mutation_count }
    public fun crossover_points(d: &StrategyDNA): vector<u8> { d.crossover_points }

    // ---- package-internal mutators (breeding) ----

    public(package) fun set_mutation_count(d: &mut StrategyDNA, n: u8) { d.mutation_count = n; }
    public(package) fun set_crossover_points(d: &mut StrategyDNA, pts: vector<u8>) { d.crossover_points = pts; }

    // signal-type code accessors
    public fun signal_momentum(): u8 { SIGNAL_MOMENTUM }
    public fun signal_mean_reversion(): u8 { SIGNAL_MEAN_REVERSION }
    public fun signal_breakout(): u8 { SIGNAL_BREAKOUT }
    public fun signal_range(): u8 { SIGNAL_RANGE }

    // ---- test fixtures ----

    #[test_only]
    /// A valid, moderately-bullish, choppy ~1h conviction (Riya's example from idea.md).
    public fun mock(): StrategyDNA {
        new(
            false, 30, 55, 0, 45,        // dir +30, conf 55, ~1h, vol 45 (choppy)
            2, 0, true, false, false,     // 2 legs, BTC/dUSDC, options
            100,                          // 1x
            SIGNAL_MOMENTUM, 40, SIGNAL_RANGE, 60, 50,
            900, false, 0,                // 9% max drawdown
            0, vector[],
        )
    }

    #[test_only]
    /// The exact opposite conviction (for similarity == 0 verification).
    public fun mock_opposite(): StrategyDNA {
        new(
            true, 100, 0, 0, 0,           // dir -100, conf 0, vol 0
            2, 0, true, false, false,
            100,
            SIGNAL_MOMENTUM, 40, SIGNAL_RANGE, 60, 0,   // regime_sensitivity 0 (mock has 50 -> diff 50; ok)
            900, false, 0,
            0, vector[],
        )
    }
}
