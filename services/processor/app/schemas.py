"""Pydantic schemas shared across the processor service.

Document/chunk shapes mirror the `documents` / `document_chunks` tables and the
TS enums in packages/shared. The web app persists what these endpoints return.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ParseStatus = Literal["parsed", "failed", "ocr_required"]


class Chunk(BaseModel):
    chunk_index: int
    text: str
    page_number: int | None = None
    source_locator: str | None = None
    character_start: int | None = None
    character_end: int | None = None


class DocumentParseResult(BaseModel):
    parse_status: ParseStatus
    parse_error: str | None = None
    metadata: dict = Field(default_factory=dict)
    chunks: list[Chunk] = Field(default_factory=list)


# --- Change-order register (CSV) ------------------------------------------------

# Canonical register fields the UI maps CSV columns onto.
REGISTER_FIELDS = (
    "external_reference",
    "title",
    "description",
    "submitted_date",
    "status",
    "amount",
)


class RegisterRow(BaseModel):
    external_reference: str | None = None
    title: str | None = None
    description: str | None = None
    submitted_date: str | None = None  # ISO 'YYYY-MM-DD' or None
    status: str | None = None
    amount: float | None = None
    raw: dict = Field(default_factory=dict)
    row_errors: list[str] = Field(default_factory=list)


class RegisterParseResult(BaseModel):
    columns: list[str]
    # Suggested CSV-column -> canonical-field mapping (field -> column name or None).
    detected_mapping: dict[str, str | None]
    rows: list[RegisterRow]
    row_count: int
    errors: list[str] = Field(default_factory=list)
