"""Pydantic models for the AI analysis pipeline."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# --- Inputs ------------------------------------------------------------------


class SourceChunk(BaseModel):
    chunk_id: str
    document_id: str
    file_type: str
    filename: str
    text: str
    page_number: int | None = None
    source_locator: str | None = None


class RegisterEntryIn(BaseModel):
    id: str
    external_reference: str | None = None
    title: str | None = None
    description: str | None = None
    submitted_date: str | None = None
    status: str | None = None
    amount: float | None = None


# --- Extraction (adapter output) --------------------------------------------


class ExtractedCandidate(BaseModel):
    """A potential scope-change event as proposed by an extraction adapter.

    `evidence_chunk_ids` and `supporting_excerpts` are validated against the
    real source chunks before anything is trusted — hallucinated ids/excerpts
    are rejected.
    """

    title: str
    description: str = ""
    event_date: str | None = None
    parties: list[str] = Field(default_factory=list)
    change_type: str | None = None
    evidence_chunk_ids: list[str] = Field(default_factory=list)
    supporting_excerpts: list[str] = Field(default_factory=list)
    uncertainty: str = ""
    requires_human_review: bool = True
    confidence: float = 0.5


# --- Findings (pipeline output) ---------------------------------------------

ReconciliationStatus = Literal[
    "matched", "possible_match", "no_match_found", "insufficient_data"
]


class EvidenceOut(BaseModel):
    document_id: str
    chunk_id: str
    exact_excerpt: str
    source_locator: str | None = None
    evidence_role: Literal["primary", "supporting"] = "supporting"


class RegisterMatchOut(BaseModel):
    register_entry_id: str
    matching_method: str
    match_score: float
    explanation: str


class Finding(BaseModel):
    normalized_title: str
    description: str
    event_date: str | None = None
    detected_parties: list[str] = Field(default_factory=list)
    potential_change_type: str | None = None
    extraction_confidence: float = 0.5
    reconciliation_status: ReconciliationStatus = "insufficient_data"
    requires_human_review: bool = True
    uncertainty: str = ""
    evidence: list[EvidenceOut] = Field(default_factory=list)
    register_matches: list[RegisterMatchOut] = Field(default_factory=list)


class PipelineResult(BaseModel):
    pipeline_version: str
    model_identifier: str
    findings: list[Finding] = Field(default_factory=list)
    # Diagnostics for evaluation / debugging (not persisted as findings).
    rejected_candidates: int = 0
    dropped_citations: int = 0
