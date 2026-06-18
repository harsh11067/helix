#[test_only]
module helix::signed_tests {
    use helix::signed;

    #[test]
    fun construction_and_zero() {
        assert!(signed::is_zero(&signed::zero()), 0);
        let p = signed::from_u64(42);
        assert!(!signed::is_negative(&p) && signed::magnitude(&p) == 42, 1);
        // negative-zero canonicalizes to zero
        let nz = signed::new(true, 0);
        assert!(!signed::is_negative(&nz) && signed::is_zero(&nz), 2);
        let n = signed::new(true, 7);
        assert!(signed::is_negative(&n) && signed::magnitude(&n) == 7, 3);
    }

    #[test]
    fun add_same_sign() {
        let r = signed::add(signed::from_u64(5), signed::from_u64(8));
        assert!(!signed::is_negative(&r) && signed::magnitude(&r) == 13, 0);
        let r2 = signed::add(signed::new(true, 5), signed::new(true, 8));
        assert!(signed::is_negative(&r2) && signed::magnitude(&r2) == 13, 1);
    }

    #[test]
    fun add_opposite_signs() {
        // +5 + (-8) = -3
        let r = signed::add(signed::from_u64(5), signed::new(true, 8));
        assert!(signed::is_negative(&r) && signed::magnitude(&r) == 3, 0);
        // -5 + (+8) = +3
        let r2 = signed::add(signed::new(true, 5), signed::from_u64(8));
        assert!(!signed::is_negative(&r2) && signed::magnitude(&r2) == 3, 1);
        // +5 + (-5) = 0
        let r3 = signed::add(signed::from_u64(5), signed::new(true, 5));
        assert!(signed::is_zero(&r3), 2);
    }

    #[test]
    fun neg_sub_eq_and_gt() {
        let a = signed::from_u64(10);
        let na = signed::neg(a);
        assert!(signed::is_negative(&na) && signed::magnitude(&na) == 10, 0);
        // 10 - 4 = 6
        let r = signed::sub(signed::from_u64(10), signed::from_u64(4));
        assert!(signed::eq(&r, &signed::from_u64(6)), 1);
        assert!(signed::magnitude_gt(&signed::from_u64(50), 49), 2);
        assert!(!signed::magnitude_gt(&signed::from_u64(50), 50), 3);
        assert!(signed::is_zero(&signed::neg(signed::zero())), 4);
    }
}
