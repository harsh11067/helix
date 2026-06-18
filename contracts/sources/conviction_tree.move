/// conviction_tree — the cascading dependency graph (architecture.md §2.2 / §5.2,
/// plan Phase 2). A child strategy links to a parent with an `ActivationCondition`
/// and pledged collateral; when the parent resolves and the condition is met the
/// child activates (optionally drawing undercollateralized leverage). If the
/// parent fails, the child never activates and its collateral is returned.
///
/// Move forbids recursive types, so conditions are modelled as a flat list of
/// `Leaf`s combined by one composite operator (AND/OR/NOT) — enough to express
/// the conviction-chaining the demo needs.
module helix::conviction_tree {
    use sui::coin::{Self, Coin};
    use sui::balance::Balance;
    use helix::events;

    // leaf kinds
    const LEAF_OUTCOME: u8 = 0;
    const LEAF_STATE: u8 = 1;

    // state operators
    const OP_GT: u8 = 0;
    const OP_LT: u8 = 1;
    const OP_EQ: u8 = 2;
    const OP_BETWEEN: u8 = 3;

    // compose operators
    const OP_AND: u8 = 0;
    const OP_OR: u8 = 1;
    const OP_NOT: u8 = 2;

    // outcome values
    const OUTCOME_FAILED: u8 = 0;
    const OUTCOME_SUCCEEDED: u8 = 1;

    const ENoCollateral: u64 = 800;
    const EConditionNotMet: u64 = 801;
    const EAlreadyActivated: u64 = 802;

    /// A single, non-recursive predicate.
    public struct Leaf has copy, drop, store {
        kind: u8,              // 0 outcome, 1 state
        required_outcome: u8,  // outcome
        metric_type: u8,       // state: 0 price, 1 IV, 2 volume, 3 regime
        operator: u8,          // state operator
        threshold: u64,
        threshold_hi: u64,     // for BETWEEN
    }

    /// A simple condition (one leaf) or a composite of leaves under one operator.
    public struct ActivationCondition has store, copy, drop {
        composite: bool,
        operator_compose: u8,
        leaves: vector<Leaf>,
    }

    public struct ConvictionTreeNode<phantom T> has key, store {
        id: UID,
        strategy_id: ID,
        parent_strategy_id: ID,
        parent_node: Option<ID>,
        children: vector<ID>,
        condition: ActivationCondition,
        activated: bool,
        collateral: Balance<T>,
        pledged_collateral: u64,
        borrowed_amount: u64,
    }

    // ---- leaf + condition builders ----

    public fun leaf_outcome(required_outcome: u8): Leaf {
        Leaf { kind: LEAF_OUTCOME, required_outcome, metric_type: 0, operator: 0, threshold: 0, threshold_hi: 0 }
    }
    public fun leaf_state(metric_type: u8, operator: u8, threshold: u64): Leaf {
        Leaf { kind: LEAF_STATE, required_outcome: 0, metric_type, operator, threshold, threshold_hi: 0 }
    }
    public fun leaf_between(metric_type: u8, lo: u64, hi: u64): Leaf {
        Leaf { kind: LEAF_STATE, required_outcome: 0, metric_type, operator: OP_BETWEEN, threshold: lo, threshold_hi: hi }
    }

    public fun outcome_condition(required_outcome: u8): ActivationCondition {
        ActivationCondition { composite: false, operator_compose: 0, leaves: vector[leaf_outcome(required_outcome)] }
    }
    public fun state_condition(metric_type: u8, operator: u8, threshold: u64): ActivationCondition {
        ActivationCondition { composite: false, operator_compose: 0, leaves: vector[leaf_state(metric_type, operator, threshold)] }
    }
    public fun simple(leaf: Leaf): ActivationCondition {
        ActivationCondition { composite: false, operator_compose: 0, leaves: vector[leaf] }
    }
    public fun composite(operator_compose: u8, leaves: vector<Leaf>): ActivationCondition {
        ActivationCondition { composite: true, operator_compose, leaves }
    }

    // ---- evaluation ----

    fun eval_leaf(l: &Leaf, parent_outcome: u8, metric_value: u64): bool {
        if (l.kind == LEAF_OUTCOME) {
            l.required_outcome == parent_outcome
        } else {
            if (l.operator == OP_GT) { metric_value > l.threshold }
            else if (l.operator == OP_LT) { metric_value < l.threshold }
            else if (l.operator == OP_EQ) { metric_value == l.threshold }
            else { metric_value >= l.threshold && metric_value <= l.threshold_hi }
        }
    }

    public fun evaluate_condition(c: &ActivationCondition, parent_outcome: u8, metric_value: u64): bool {
        let n = c.leaves.length();
        if (!c.composite) {
            eval_leaf(&c.leaves[0], parent_outcome, metric_value)
        } else if (c.operator_compose == OP_NOT) {
            !eval_leaf(&c.leaves[0], parent_outcome, metric_value)
        } else if (c.operator_compose == OP_AND) {
            let mut i = 0; let mut r = true;
            while (i < n) { r = r && eval_leaf(&c.leaves[i], parent_outcome, metric_value); i = i + 1; };
            r
        } else {
            let mut i = 0; let mut r = false;
            while (i < n) { r = r || eval_leaf(&c.leaves[i], parent_outcome, metric_value); i = i + 1; };
            r
        }
    }

    // ---- node lifecycle ----

    public fun link_to_parent<T>(
        child_strategy_id: ID,
        parent_strategy_id: ID,
        parent_node: Option<ID>,
        condition: ActivationCondition,
        collateral: Coin<T>,
        ctx: &mut TxContext,
    ): ConvictionTreeNode<T> {
        let pledged = collateral.value();
        assert!(pledged > 0, ENoCollateral);
        let node = ConvictionTreeNode<T> {
            id: object::new(ctx),
            strategy_id: child_strategy_id,
            parent_strategy_id,
            parent_node,
            children: vector[],
            condition,
            activated: false,
            collateral: collateral.into_balance(),
            pledged_collateral: pledged,
            borrowed_amount: 0,
        };
        events::node_linked(object::id(&node), child_strategy_id, parent_strategy_id, pledged);
        node
    }

    public fun register_child<T>(node: &mut ConvictionTreeNode<T>, child_node_id: ID) {
        node.children.push_back(child_node_id);
    }

    /// Activate if the condition is met given the resolved parent outcome and a
    /// current metric value. `borrowed_amount` is the leverage drawn against the
    /// parent (Paper 6's undercollateralized mechanism).
    public fun activate_node<T>(
        node: &mut ConvictionTreeNode<T>,
        parent_outcome: u8,
        metric_value: u64,
        borrowed_amount: u64,
    ) {
        assert!(!node.activated, EAlreadyActivated);
        assert!(evaluate_condition(&node.condition, parent_outcome, metric_value), EConditionNotMet);
        node.activated = true;
        node.borrowed_amount = borrowed_amount;
        events::node_activated(object::id(node), node.strategy_id, borrowed_amount);
    }

    /// Parent failed → child never activates; return its pledged collateral.
    public fun cascade_failure<T>(node: ConvictionTreeNode<T>, ctx: &mut TxContext): Coin<T> {
        let node_id = object::id(&node);
        let ConvictionTreeNode {
            id, strategy_id: _, parent_strategy_id: _, parent_node: _, children: _,
            condition: _, activated: _, collateral, pledged_collateral, borrowed_amount: _,
        } = node;
        object::delete(id);
        events::cascade_failed(node_id, pledged_collateral);
        coin::from_balance(collateral, ctx)
    }

    // ---- accessors ----
    public fun is_activated<T>(n: &ConvictionTreeNode<T>): bool { n.activated }
    public fun pledged_collateral<T>(n: &ConvictionTreeNode<T>): u64 { n.pledged_collateral }
    public fun borrowed_amount<T>(n: &ConvictionTreeNode<T>): u64 { n.borrowed_amount }
    public fun strategy_id<T>(n: &ConvictionTreeNode<T>): ID { n.strategy_id }
    public fun children<T>(n: &ConvictionTreeNode<T>): vector<ID> { n.children }

    // code accessors
    public fun outcome_succeeded(): u8 { OUTCOME_SUCCEEDED }
    public fun outcome_failed(): u8 { OUTCOME_FAILED }
    public fun op_gt(): u8 { OP_GT }
    public fun op_lt(): u8 { OP_LT }
    public fun op_and(): u8 { OP_AND }
    public fun op_or(): u8 { OP_OR }
    public fun op_not(): u8 { OP_NOT }
    public fun metric_price(): u8 { 0 }
    public fun metric_iv(): u8 { 1 }
    public fun metric_regime(): u8 { 3 }
}
