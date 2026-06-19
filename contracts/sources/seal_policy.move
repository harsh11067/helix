/// seal_policy — Seal access control for a strategy's private thesis note.
///
/// A strategy's structure and performance are public on-chain; its *reasoning*
/// — the owner's thesis ("why I believe this") — is encrypted client-side with
/// Seal and stored on Walrus. The Seal key servers release a decryption key only
/// when one of these `seal_approve*` functions executes WITHOUT aborting in a
/// dry run. So the plaintext is readable by:
///   • the strategy owner, and
///   • any address that paid to copy the strategy (holds a `CopyRelationship`).
///
/// The encryption identity is the strategy's object id, so each encrypted thesis
/// is namespaced to exactly one strategy and cannot be unlocked via another.
///
/// Added as a NEW module in a compatible package upgrade — it changes no existing
/// module, so the published package id and every prior proof remain valid.
module helix::seal_policy {
    use helix::strategy::{Self, StrategyObject};
    use helix::marketplace::{Self, CopyRelationship};
    use sui::event;

    const EBadIdentity: u64 = 1;
    const ENoAccess: u64 = 2;

    /// Emitted when an owner attaches an encrypted-thesis Walrus blob to a
    /// strategy, so readers can locate the ciphertext. Reveals only the blob's
    /// location — the contents stay encrypted under the Seal policy below.
    public struct ThesisAttached has copy, drop {
        strategy_id: ID,
        blob_id: vector<u8>,
        owner: address,
    }

    /// Owner records that an encrypted thesis lives at `blob_id` (a Walrus blob)
    /// for their strategy. Owner-gated so only the owner can (re)point the thesis.
    public fun attach_thesis(s: &StrategyObject, blob_id: vector<u8>, ctx: &TxContext) {
        assert!(ctx.sender() == strategy::owner(s), ENoAccess);
        event::emit(ThesisAttached {
            strategy_id: object::id(s),
            blob_id,
            owner: strategy::owner(s),
        });
    }

    /// Seal key-server access check: the strategy OWNER may decrypt.
    /// `id` must be the strategy's object-id bytes (the encryption identity).
    entry fun seal_approve(id: vector<u8>, s: &StrategyObject, ctx: &TxContext) {
        assert!(id == object::id(s).to_bytes(), EBadIdentity);
        assert!(ctx.sender() == strategy::owner(s), ENoAccess);
    }

    /// Seal key-server access check: a COPIER may decrypt the original strategy's
    /// thesis. The caller must hold a `CopyRelationship` whose `original` matches
    /// the encryption identity and whose `copier` is the caller — i.e. they paid
    /// to copy it.
    ///
    /// IMPORTANT: this takes ONLY the copier's own `CopyRelationship`, NOT the
    /// `StrategyObject`. The strategy is an OWNED object held by the original
    /// owner, so the copier (a different address) cannot reference it in the PTB
    /// the key server dry-runs — doing so produced
    /// `InvalidParameterError` ("…object the FN has not yet seen"). The identity
    /// the copier needs is already recorded inside the relationship.
    entry fun seal_approve_copier(
        id: vector<u8>,
        rel: &CopyRelationship,
        ctx: &TxContext,
    ) {
        assert!(marketplace::original_strategy_id(rel).to_bytes() == id, EBadIdentity);
        assert!(marketplace::copier(rel) == ctx.sender(), ENoAccess);
    }
}
