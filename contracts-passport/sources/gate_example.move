/// Reference integration: gate entry on a HELIX Forecaster Passport.
///
/// Example: a copy-trading vault that only admits calibrated leaders calls
/// `assert_calibrated(passport, 2200, 10)` ("Brier under 0.22 over at least 10 settled
/// calls") before accepting a deposit or a leader. Reputation is a Sui object, so the
/// check is one function call; no oracle, no API key.
module helix_passport::gate_example;

use helix_passport::passport::ForecasterPassport;
use sui::clock::Clock;

/// Fewer settled calls than the gate requires.
const ETooFewSettled: u64 = 0;
/// Brier score not under the gate's threshold.
const ENotCalibrated: u64 = 1;
/// The passport was last attested longer ago than the gate allows.
const EStalePassport: u64 = 2;

/// True when the passport has at least `min_n` settled calls and a Brier score
/// strictly under `max_brier_bps` (basis points: 2200 = 0.22).
public fun is_calibrated(p: &ForecasterPassport, max_brier_bps: u64, min_n: u64): bool {
    p.n_settled() >= min_n && p.brier_bps() < max_brier_bps
}

/// Aborts unless the passport has at least `min_n` settled calls and Brier < `max_brier_bps`.
public fun assert_calibrated(p: &ForecasterPassport, max_brier_bps: u64, min_n: u64) {
    assert!(p.n_settled() >= min_n, ETooFewSettled);
    assert!(p.brier_bps() < max_brier_bps, ENotCalibrated);
}

/// Aborts if the passport's attestation is older than `max_age_ms`. A holder can skip
/// `refresh` after a bad run, so a gate that cares about the current record checks this too.
public fun assert_fresh(p: &ForecasterPassport, clock: &Clock, max_age_ms: u64) {
    assert!(clock.timestamp_ms() <= p.issued_ms() + max_age_ms, EStalePassport);
}
