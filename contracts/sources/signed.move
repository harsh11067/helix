/// Minimal sign-magnitude signed 64-bit integer.
///
/// Move has no native signed integers, but architecture.md models several genes
/// and all portfolio Greeks as signed (`I64` / `i64`). This module provides a
/// small, copyable, storable signed type used across HELIX so the rest of the
/// code reads naturally (`direction_bias`, `net_delta`, `hedge_threshold_delta`).
module helix::signed {

    /// Sign-magnitude integer. Invariant: `magnitude == 0` implies `negative == false`
    /// so that zero has a single canonical representation and `==` behaves correctly.
    public struct I64 has copy, drop, store {
        negative: bool,
        magnitude: u64,
    }

    public fun zero(): I64 { I64 { negative: false, magnitude: 0 } }

    public fun from_u64(magnitude: u64): I64 { I64 { negative: false, magnitude } }

    public fun new(negative: bool, magnitude: u64): I64 {
        // canonicalize zero
        I64 { negative: negative && magnitude != 0, magnitude }
    }

    public fun is_negative(x: &I64): bool { x.negative }

    public fun magnitude(x: &I64): u64 { x.magnitude }

    public fun is_zero(x: &I64): bool { x.magnitude == 0 }

    public fun neg(a: I64): I64 {
        I64 { negative: !a.negative && a.magnitude != 0, magnitude: a.magnitude }
    }

    public fun add(a: I64, b: I64): I64 {
        if (a.negative == b.negative) {
            I64 { negative: a.negative, magnitude: a.magnitude + b.magnitude }
        } else if (a.magnitude >= b.magnitude) {
            let m = a.magnitude - b.magnitude;
            I64 { negative: a.negative && m != 0, magnitude: m }
        } else {
            let m = b.magnitude - a.magnitude;
            I64 { negative: b.negative && m != 0, magnitude: m }
        }
    }

    public fun sub(a: I64, b: I64): I64 { add(a, neg(b)) }

    /// |x| > limit  — used for tolerance breach checks on Greeks.
    public fun magnitude_gt(x: &I64, limit: u64): bool { x.magnitude > limit }

    public fun eq(a: &I64, b: &I64): bool {
        a.negative == b.negative && a.magnitude == b.magnitude
    }
}
