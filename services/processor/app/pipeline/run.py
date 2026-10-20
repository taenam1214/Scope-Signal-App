"""Pipeline orchestration: extract -> validate citations -> cluster -> reconcile
-> build findings. Pure; the extraction adapter is chosen from settings."""

from __future__ import annotations

import re

from app.config import Settings
from app.extraction.adapter import get_extraction_adapter
from app.pipeline.models import (
    EvidenceOut,
    ExtractedCandidate,
    Finding,
    PipelineResult,
    RegisterEntryIn,
    SourceChunk,
)
from app.pipeline.reconcile import cluster_candidates, reconcile_cluster

PIPELINE_VERSION = "pipeline-v1"


def _normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def _validate_citations(
    candidates: list[ExtractedCandidate], chunks: list[SourceChunk]
) -> tuple[list[ExtractedCandidate], dict[str, SourceChunk], int, int]:
    """Drop citations referencing unknown chunks or excerpts not present in the
    cited chunk text. Reject candidates left with no supported evidence.

    Returns (kept_candidates, chunk_map, rejected_count, dropped_citation_count).
    """
    chunk_map = {c.chunk_id: c for c in chunks}
    kept: list[ExtractedCandidate] = []
    rejected = 0
    dropped = 0

    for cand in candidates:
        valid_ids = [cid for cid in cand.evidence_chunk_ids if cid in chunk_map]
        dropped += len(cand.evidence_chunk_ids) - len(valid_ids)
        if not valid_ids:
            rejected += 1
            continue

        haystack = _normalize_ws(" ".join(chunk_map[cid].text for cid in valid_ids))
        good_excerpts = []
        for ex in cand.supporting_excerpts:
            if ex and _normalize_ws(ex) in haystack:
                good_excerpts.append(ex)
            else:
                dropped += 1
        if not good_excerpts:
            # No excerpt is actually supported by the cited text -> reject.
            rejected += 1
            continue

        cand.evidence_chunk_ids = valid_ids
        cand.supporting_excerpts = good_excerpts
        kept.append(cand)

    return kept, chunk_map, rejected, dropped


def _build_evidence(
    cand_ids: list[str], excerpts: list[str], chunk_map: dict[str, SourceChunk]
) -> list[EvidenceOut]:
    evidence: list[EvidenceOut] = []
    for i, cid in enumerate(cand_ids):
        chunk = chunk_map[cid]
        # Pair each chunk with the first excerpt it contains, else the chunk head.
        excerpt = next(
            (e for e in excerpts if _normalize_ws(e) in _normalize_ws(chunk.text)),
            chunk.text[:240],
        )
        evidence.append(
            EvidenceOut(
                document_id=chunk.document_id,
                chunk_id=cid,
                exact_excerpt=excerpt,
                source_locator=chunk.source_locator,
                evidence_role="primary" if i == 0 else "supporting",
            )
        )
    return evidence


def run_pipeline(
    chunks: list[SourceChunk],
    register: list[RegisterEntryIn],
    settings: Settings,
) -> PipelineResult:
    adapter = get_extraction_adapter(settings)
    raw = adapter.extract(chunks)

    kept, chunk_map, rejected, dropped = _validate_citations(raw, chunks)
    clusters = cluster_candidates(kept)

    findings: list[Finding] = []
    for cluster in clusters:
        status, matches = reconcile_cluster(cluster, register)

        # Merge evidence across the cluster's candidates (dedupe by chunk id).
        all_ids: list[str] = []
        all_excerpts: list[str] = []
        for cand in cluster.candidates:
            for cid in cand.evidence_chunk_ids:
                if cid not in all_ids:
                    all_ids.append(cid)
            all_excerpts.extend(cand.supporting_excerpts)

        findings.append(
            Finding(
                normalized_title=cluster.title,
                description=cluster.description,
                event_date=cluster.event_date,
                detected_parties=cluster.parties,
                potential_change_type=cluster.change_type,
                extraction_confidence=round(cluster.confidence, 3),
                reconciliation_status=status,
                requires_human_review=True,
                uncertainty=cluster.uncertainty,
                evidence=_build_evidence(all_ids, all_excerpts, chunk_map),
                register_matches=matches,
            )
        )

    return PipelineResult(
        pipeline_version=PIPELINE_VERSION,
        model_identifier=adapter.name,
        findings=findings,
        rejected_candidates=rejected,
        dropped_citations=dropped,
    )
