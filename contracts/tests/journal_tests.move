#[test_only]
module helix::journal_tests;

use helix::journal::{Self, ConvictionCommitted};
use std::unit_test::assert_eq;
use sui::clock;
use sui::event;
use sui::test_scenario;

const TRADER: address = @0xA11CE;
const MARKET: address = @0xB0B;

fun digest(): vector<u8> { std::hash::sha2_256(b"CONVICTION v1 | dir=up | conf=0.80 | mode=commit") }

#[test]
fun commit_with_future_expiry_emits_event_with_correct_fields() {
    let mut scenario = test_scenario::begin(TRADER);
    let mut clk = clock::create_for_testing(scenario.ctx());
    clk.set_for_testing(1_000_000);

    journal::commit(digest(), MARKET, 1_060_000, &clk, scenario.ctx());

    let events = event::events_by_type<ConvictionCommitted>();
    assert_eq!(events.length(), 1);
    let e = &events[0];
    assert_eq!(e.owner(), TRADER);
    assert_eq!(e.hash(), digest());
    assert_eq!(e.oracle(), MARKET);
    assert_eq!(e.expiry_ms(), 1_060_000);
    assert_eq!(e.committed_ms(), 1_000_000);

    clk.destroy_for_testing();
    scenario.end();
}

#[test, expected_failure(abort_code = journal::EExpiryNotInFuture)]
fun commit_with_past_expiry_aborts() {
    let mut scenario = test_scenario::begin(TRADER);
    let mut clk = clock::create_for_testing(scenario.ctx());
    clk.set_for_testing(2_000_000);
    journal::commit(digest(), MARKET, 1_999_999, &clk, scenario.ctx());
    abort
}

#[test, expected_failure(abort_code = journal::EExpiryNotInFuture)]
fun commit_with_expiry_equal_to_now_aborts() {
    let mut scenario = test_scenario::begin(TRADER);
    let mut clk = clock::create_for_testing(scenario.ctx());
    clk.set_for_testing(2_000_000);
    journal::commit(digest(), MARKET, 2_000_000, &clk, scenario.ctx());
    abort
}

#[test, expected_failure(abort_code = journal::EInvalidHashLength)]
fun commit_with_short_hash_aborts() {
    let mut scenario = test_scenario::begin(TRADER);
    let clk = clock::create_for_testing(scenario.ctx());
    journal::commit(b"not-a-digest", MARKET, 60_000, &clk, scenario.ctx());
    abort
}

#[test]
fun every_commit_is_a_separate_event() {
    let mut scenario = test_scenario::begin(TRADER);
    let clk = clock::create_for_testing(scenario.ctx());
    journal::commit(digest(), MARKET, 60_000, &clk, scenario.ctx());
    journal::commit(digest(), @0xC0DE, 120_000, &clk, scenario.ctx());
    let events = event::events_by_type<ConvictionCommitted>();
    assert_eq!(events.length(), 2);
    assert_eq!(events[1].oracle(), @0xC0DE);
    assert_eq!(events[1].expiry_ms(), 120_000);
    clk.destroy_for_testing();
    scenario.end();
}
