module soulbound_negative::thief;

use helix_passport::passport::ForecasterPassport;

public struct Vault has key, store {
    id: UID,
    stolen: ForecasterPassport,
}

/// Fails: `public_transfer` requires `key + store`.
public fun steal(p: ForecasterPassport, to: address) {
    transfer::public_transfer(p, to);
}

/// Fails: `transfer::transfer` of a foreign type is private to its defining module.
public fun steal_private(p: ForecasterPassport, to: address) {
    transfer::transfer(p, to);
}
