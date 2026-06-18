#[test_only]
module helix::dna_tests {
    use helix::dna;

    // 1.2 — serialize → bytes → deserialize → equals original
    #[test]
    fun serialize_roundtrip() {
        let d = dna::mock();
        let bytes = dna::to_bytes(&d);
        let d2 = dna::from_bytes(bytes);
        assert!(dna::equals(&d, &d2), 0);
    }

    #[test]
    fun roundtrip_with_crossover_points() {
        let d = dna::new(
            true, 80, 70, 5, 90,
            4, 3, true, true, true, 500,
            0, 30, 2, 70, 65,
            1200, true, 25,
            2, vector[3u8, 7u8, 11u8],
        );
        let d2 = dna::from_bytes(dna::to_bytes(&d));
        assert!(dna::equals(&d, &d2), 0);
        assert!(dna::crossover_points(&d2) == vector[3u8, 7u8, 11u8], 1);
    }

    // 1.3 — validation rejects out-of-range genes (direction_bias > 100)
    #[test, expected_failure]
    fun rejects_overflow_direction() {
        let _d = dna::new(
            false, 120, 50, 0, 50,   // dir_magnitude 120 > 100
            2, 0, true, false, false, 100,
            0, 40, 3, 60, 50,
            900, false, 0, 0, vector[],
        );
    }

    #[test, expected_failure]
    fun rejects_zero_legs() {
        let _d = dna::new(
            false, 30, 50, 0, 50,
            0, 0, true, false, false, 100,  // leg_count 0 invalid
            0, 40, 3, 60, 50,
            900, false, 0, 0, vector[],
        );
    }

    #[test, expected_failure]
    fun rejects_under_leverage() {
        let _d = dna::new(
            false, 30, 50, 0, 50,
            2, 0, true, false, false, 50,   // 0.5x < 1x
            0, 40, 3, 60, 50,
            900, false, 0, 0, vector[],
        );
    }

    // 1.4 — similarity: identical = 100 (1.0), opposite = 0 (0.0)
    #[test]
    fun similarity_extremes() {
        let pole_a = dna::new(
            false, 100, 100, 0, 100,
            2, 0, true, false, false, 100,
            0, 40, 3, 60, 100,
            900, false, 0, 0, vector[],
        );
        let pole_b = dna::new(
            true, 100, 0, 0, 0,
            2, 0, true, false, false, 100,
            0, 40, 3, 60, 0,
            900, false, 0, 0, vector[],
        );
        assert!(dna::similarity(&pole_a, &pole_a) == 100, 0);
        assert!(dna::similarity(&pole_a, &pole_b) == 0, 1);
        // mid-range pair should land strictly between the extremes
        let s = dna::similarity(&dna::mock(), &pole_a);
        assert!(s > 0 && s < 100, 2);
    }

    #[test]
    fun valid_mock() {
        assert!(dna::is_valid(&dna::mock()), 0);
    }
}
