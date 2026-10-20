"""Run the analysis pipeline over the synthetic project and score it against the
ground-truth labels. Deterministic (uses the mock adapter). Reproduce with:

    docker run --rm scopesignal-processor:dev python -m app.eval.run
"""

from __future__ import annotations

import json
import time

from app.config import Settings
from app.eval import synthetic
from app.parsers import parse_document, parse_register_csv
from app.pipeline.models import RegisterEntryIn, SourceChunk
from app.pipeline.run import run_pipeline


def build_chunks() -> list[SourceChunk]:
    chunks: list[SourceChunk] = []
    for doc in synthetic.all_documents():
        file_type = "eml" if doc.filename.endswith(".eml") else "txt"
        parsed = parse_document(file_type, doc.text.encode())
        for c in parsed.chunks:
            chunks.append(
                SourceChunk(
                    chunk_id=f"{doc.filename}#{c.chunk_index}",
                    document_id=doc.filename,
                    file_type=file_type,
                    filename=doc.filename,
                    text=c.text,
                    page_number=c.page_number,
                    source_locator=c.source_locator,
                )
            )
    return chunks


def build_register() -> list[RegisterEntryIn]:
    parsed = parse_register_csv(synthetic.register_csv().encode())
    return [
        RegisterEntryIn(
            id=f"reg-{i}",
            external_reference=r.external_reference,
            title=r.title,
            description=r.description,
            submitted_date=r.submitted_date,
            status=r.status,
            amount=r.amount,
        )
        for i, r in enumerate(parsed.rows)
    ]


def _haystack(finding) -> str:
    parts = [finding.normalized_title, finding.description or ""]
    parts += [e.exact_excerpt for e in finding.evidence]
    return " ".join(parts).lower()


def _matches_label(finding, label: dict) -> bool:
    hay = _haystack(finding)
    if label.get("ref") and label["ref"].lower() in hay:
        return True
    contains = label.get("contains", [])
    return any(tok.lower() in hay for tok in contains)


def evaluate() -> dict:
    settings = Settings(ai_mode="mock")
    chunks = build_chunks()
    register = build_register()

    start = time.perf_counter()
    result = run_pipeline(chunks, register, settings)
    elapsed = time.perf_counter() - start
    findings = result.findings

    unmatched = [f for f in findings if f.reconciliation_status == "no_match_found"]

    # Recall of unrecorded omissions (flagged and not matched in register).
    omissions = synthetic.LABELS["expected_omissions"]
    omission_hits = sum(
        1 for lab in omissions
        if any(_matches_label(f, lab) and f.reconciliation_status != "matched" for f in findings)
    )

    # Recorded changes that reconciled as matched.
    recorded = synthetic.LABELS["expected_recorded"]
    recorded_matched = sum(
        1 for lab in recorded
        if any(_matches_label(f, lab) and f.reconciliation_status == "matched" for f in findings)
    )

    # False positives that leaked as new unmatched findings.
    fps = synthetic.LABELS["false_positives"]
    fp_leaked = sum(1 for lab in fps if any(_matches_label(f, lab) for f in unmatched))

    # Ambiguous cases flagged.
    ambiguous = synthetic.LABELS["ambiguous"]
    ambiguous_hits = sum(
        1 for lab in ambiguous if any(_matches_label(f, lab) for f in findings)
    )

    # Evidence integrity: every finding must have at least one evidence item, and
    # every excerpt must be a substring of the cited chunk (guaranteed by the
    # pipeline, re-checked here).
    chunk_text = {c.chunk_id: c.text.lower() for c in chunks}
    missing_citations = sum(1 for f in findings if not f.evidence)
    unsupported = 0
    for f in findings:
        for e in f.evidence:
            if e.exact_excerpt.lower().strip() not in chunk_text.get(e.chunk_id, ""):
                unsupported += 1

    titles = [f.normalized_title for f in findings]
    duplicates = len(titles) - len(set(titles))

    total_expected = len(omissions) + len(recorded) + len(ambiguous)
    real_hits = omission_hits + recorded_matched + ambiguous_hits

    return {
        "findings": len(findings),
        "omission_recall": round(omission_hits / len(omissions), 3),
        "omission_hits": omission_hits,
        "omissions_expected": len(omissions),
        "recorded_matched": recorded_matched,
        "recorded_expected": len(recorded),
        "false_positives_leaked": fp_leaked,
        "ambiguous_hits": ambiguous_hits,
        "precision_vs_known": round(real_hits / max(len(findings), 1), 3),
        "missing_citations": missing_citations,
        "unsupported_claims": unsupported,
        "duplicate_findings": duplicates,
        "rejected_candidates": result.rejected_candidates,
        "dropped_citations": result.dropped_citations,
        "processing_seconds": round(elapsed, 4),
        "model_identifier": result.model_identifier,
        "pipeline_version": result.pipeline_version,
        "estimated_model_cost_usd": 0.0,  # mock adapter: no API cost
        "total_expected": total_expected,
        "real_hits": real_hits,
    }


def main() -> None:
    metrics = evaluate()
    print(json.dumps(metrics, indent=2))
    print(
        "\nNote: synthetic engineering metrics only — not a claim of commercial accuracy."
    )


if __name__ == "__main__":
    main()
