from app.eval.run import evaluate


def test_synthetic_eval_meets_thresholds():
    m = evaluate()

    # Finds all three intentionally unrecorded omissions.
    assert m["omission_recall"] == 1.0, m

    # Reconciles the three recorded change orders.
    assert m["recorded_matched"] == 3, m

    # Flags the ambiguous verbal-direction case.
    assert m["ambiguous_hits"] == 1, m

    # No false positives leak as new unmatched findings.
    assert m["false_positives_leaked"] == 0, m

    # Evidence integrity: no missing citations, no unsupported claims, no dupes.
    assert m["missing_citations"] == 0, m
    assert m["unsupported_claims"] == 0, m
    assert m["duplicate_findings"] == 0, m

    # Every finding corresponds to a known real event (clean precision on synthetic).
    assert m["precision_vs_known"] == 1.0, m
