from app.config import Settings
from app.extraction.adapter import MockExtractionAdapter
from app.pipeline.models import ExtractedCandidate, RegisterEntryIn, SourceChunk
from app.pipeline.run import _validate_citations, run_pipeline

SETTINGS = Settings(ai_mode="mock")


def chunk(cid: str, text: str, doc: str = "doc1", **kw) -> SourceChunk:
    return SourceChunk(
        chunk_id=cid, document_id=doc, file_type="txt", filename="f.txt", text=text, **kw
    )


# --- Extraction + citation validation ---------------------------------------

def test_mock_extracts_scope_change_with_evidence():
    chunks = [
        chunk("c1", "The GC directed additional conduit routing to the new panel on 2025-03-12."),
        chunk("c2", "Status meeting notes: schedule looks fine."),
    ]
    result = run_pipeline(chunks, [], SETTINGS)
    assert len(result.findings) == 1
    f = result.findings[0]
    assert f.evidence[0].chunk_id == "c1"
    assert "conduit" in f.evidence[0].exact_excerpt
    assert f.requires_human_review is True
    assert f.event_date == "2025-03-12"
    assert "General Contractor" in f.detected_parties


def test_false_positive_suppressed_by_negative_signal():
    chunks = [
        chunk("c1", "Additional conduit shown on plans is included in the original scope, no change order is required.")
    ]
    result = run_pipeline(chunks, [], SETTINGS)
    assert result.findings == []


def test_hallucinated_chunk_id_rejected():
    cands = [
        ExtractedCandidate(
            title="Bogus", description="x", evidence_chunk_ids=["does-not-exist"],
            supporting_excerpts=["x"],
        )
    ]
    kept, _, rejected, _ = _validate_citations(cands, [chunk("c1", "real text")])
    assert kept == []
    assert rejected == 1


def test_hallucinated_excerpt_rejected():
    cands = [
        ExtractedCandidate(
            title="Bad excerpt", description="x", evidence_chunk_ids=["c1"],
            supporting_excerpts=["this sentence is not in the chunk at all"],
        )
    ]
    kept, _, rejected, dropped = _validate_citations(cands, [chunk("c1", "entirely different content")])
    assert kept == []
    assert rejected == 1 and dropped >= 1


# --- Clustering --------------------------------------------------------------

def test_clusters_merge_by_explicit_reference():
    chunks = [
        chunk("c1", "RFI-042 response: please extend the conduit route to the revised location."),
        chunk("c2", "Follow-up on RFI-042: proceed with the additional routing as discussed."),
        chunk("c3", "Separately, relocate the panel board per field direction."),
    ]
    result = run_pipeline(chunks, [], SETTINGS)
    # c1 + c2 share RFI-042 -> one cluster; c3 is its own.
    assert len(result.findings) == 2
    rfi = next(f for f in result.findings if "RFI-042" in f.normalized_title)
    assert {e.chunk_id for e in rfi.evidence} == {"c1", "c2"}


# --- Reconciliation ----------------------------------------------------------

def test_reconcile_explicit_reference_matched():
    chunks = [chunk("c1", "RFI-042 directed additional conduit routing.")]
    register = [RegisterEntryIn(id="r1", external_reference="RFI-042", title="Conduit reroute")]
    result = run_pipeline(chunks, register, SETTINGS)
    f = result.findings[0]
    assert f.reconciliation_status == "matched"
    assert f.register_matches[0].register_entry_id == "r1"


def test_reconcile_text_similarity_possible_match():
    chunks = [chunk("c1", "GC directed additional lighting circuits in the east wing.")]
    register = [
        RegisterEntryIn(id="r1", external_reference="CO-9", title="Added lighting circuits east wing")
    ]
    result = run_pipeline(chunks, register, SETTINGS)
    f = result.findings[0]
    assert f.reconciliation_status == "possible_match"
    assert f.register_matches[0].matching_method == "text_similarity"


def test_reconcile_no_match_found_when_register_unrelated():
    chunks = [chunk("c1", "GC directed additional conduit routing to the new panel.")]
    register = [RegisterEntryIn(id="r1", external_reference="CO-1", title="Parking lot striping")]
    result = run_pipeline(chunks, register, SETTINGS)
    assert result.findings[0].reconciliation_status == "no_match_found"


def test_reconcile_empty_register_is_no_match():
    chunks = [chunk("c1", "GC directed additional conduit routing.")]
    result = run_pipeline(chunks, [], SETTINGS)
    assert result.findings[0].reconciliation_status == "no_match_found"


# --- Determinism -------------------------------------------------------------

def test_pipeline_is_deterministic():
    chunks = [
        chunk("c1", "RFI-042 directed additional conduit routing on 2025-03-12."),
        chunk("c2", "Relocate panel board per field order FO-3."),
    ]
    r1 = run_pipeline(chunks, [], SETTINGS)
    r2 = run_pipeline(chunks, [], SETTINGS)
    assert r1.model_dump() == r2.model_dump()
    assert r1.model_identifier == MockExtractionAdapter.name
