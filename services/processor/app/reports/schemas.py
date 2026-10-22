"""Report payload schemas. The web app assembles these (under the user's RLS
session) and posts them to the processor, which renders PDF/CSV."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ReportEvidence(BaseModel):
    filename: str
    source_locator: str | None = None
    exact_excerpt: str
    evidence_role: str = "supporting"


class ReportMatch(BaseModel):
    external_reference: str | None = None
    title: str | None = None
    explanation: str = ""


class ReportFinding(BaseModel):
    title: str
    change_type: str | None = None
    event_date: str | None = None
    parties: list[str] = Field(default_factory=list)
    reconciliation_status: str
    review_status: str
    review_notes: str | None = None
    evidence: list[ReportEvidence] = Field(default_factory=list)
    matches: list[ReportMatch] = Field(default_factory=list)


class ReportPayload(BaseModel):
    project_name: str
    project_reference: str | None = None
    trade: str | None = None
    audit_date: str
    model_identifier: str | None = None
    pipeline_version: str | None = None
    documents: list[str] = Field(default_factory=list)
    register_count: int = 0
    findings: list[ReportFinding] = Field(default_factory=list)


DISCLAIMER = (
    "Automated findings identify potential documentation discrepancies based on supplied "
    "records. They do not determine contractual entitlement, authorization, recoverable "
    "amounts, or legal compliance. 'No match found' means no corresponding entry was "
    "identified in the supplied register only."
)

REVIEW_LABELS = {
    "needs_review": "Needs Review",
    "confirmed_unrecorded": "Confirmed Unrecorded",
    "already_recorded": "Already Recorded",
    "not_additional_scope": "Not Additional Scope",
    "duplicate": "Duplicate",
    "insufficient_evidence": "Insufficient Evidence",
}

RECON_LABELS = {
    "matched": "Matched in register",
    "possible_match": "Possible match",
    "no_match_found": "No match found",
    "insufficient_data": "Insufficient data",
}
