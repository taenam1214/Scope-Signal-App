"""Change-order register CSV normalization.

Reads a CSV, suggests a column mapping onto the canonical register fields, and
returns normalized rows for preview. Original values are preserved in `raw` and
per-row parsing issues are recorded (never silently dropped).
"""

from __future__ import annotations

import io
import re
from datetime import datetime

import pandas as pd

from app.schemas import RegisterParseResult, RegisterRow

# Header keyword hints per canonical field (checked as substrings, case-insensitive).
_HEADER_HINTS: dict[str, tuple[str, ...]] = {
    "external_reference": ("co number", "co #", "co#", "change order", "pco", "number", "ref", "no."),
    "title": ("title", "subject", "name"),
    "description": ("description", "desc", "scope", "detail"),
    "submitted_date": ("date", "submitted", "created", "issued"),
    "status": ("status", "state", "disposition"),
    "amount": ("amount", "value", "cost", "price", "total", "$"),
}


def suggest_mapping(columns: list[str]) -> dict[str, str | None]:
    """Suggest a field -> column mapping. Each column maps to at most one field."""
    mapping: dict[str, str | None] = {field: None for field in _HEADER_HINTS}
    used: set[str] = set()
    for field, hints in _HEADER_HINTS.items():
        for col in columns:
            if col in used:
                continue
            low = col.strip().lower()
            if any(h in low for h in hints):
                mapping[field] = col
                used.add(col)
                break
    return mapping


def _normalize_date(value: object) -> tuple[str | None, str | None]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None, None
    text = str(value).strip()
    if not text:
        return None, None
    try:
        dt = pd.to_datetime(text, errors="raise")
        if isinstance(dt, pd.Timestamp):
            return dt.date().isoformat(), None
    except Exception:  # noqa: BLE001
        return None, f"Unrecognized date: {text!r}"
    return None, f"Unrecognized date: {text!r}"


_AMOUNT_CLEAN_RE = re.compile(r"[^0-9.\-]")


def _normalize_amount(value: object) -> tuple[float | None, str | None]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None, None
    text = str(value).strip()
    if not text:
        return None, None
    negative = text.startswith("(") and text.endswith(")")
    cleaned = _AMOUNT_CLEAN_RE.sub("", text)
    if cleaned in ("", "-", ".", "-."):
        return None, f"Unrecognized amount: {text!r}"
    try:
        amount = float(cleaned)
    except ValueError:
        return None, f"Unrecognized amount: {text!r}"
    return (-amount if negative else amount), None


def parse_register_csv(
    data: bytes, mapping: dict[str, str | None] | None = None
) -> RegisterParseResult:
    try:
        df = pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False)
    except Exception as exc:  # noqa: BLE001
        return RegisterParseResult(
            columns=[], detected_mapping={}, rows=[], row_count=0,
            errors=[f"Could not read CSV: {exc}"],
        )

    columns = [str(c) for c in df.columns]
    effective = mapping or suggest_mapping(columns)

    def cell(row: pd.Series, field: str) -> object:
        col = effective.get(field)
        if not col or col not in df.columns:
            return None
        val = row.get(col)
        return None if val is None or str(val).strip() == "" else val

    rows: list[RegisterRow] = []
    for _, raw_row in df.iterrows():
        row_errors: list[str] = []
        date_value, date_err = _normalize_date(cell(raw_row, "submitted_date"))
        amount_value, amount_err = _normalize_amount(cell(raw_row, "amount"))
        if date_err:
            row_errors.append(date_err)
        if amount_err:
            row_errors.append(amount_err)

        def as_text(field: str) -> str | None:
            v = cell(raw_row, field)
            return None if v is None else str(v).strip()

        rows.append(
            RegisterRow(
                external_reference=as_text("external_reference"),
                title=as_text("title"),
                description=as_text("description"),
                submitted_date=date_value,
                status=as_text("status"),
                amount=amount_value,
                raw={k: str(v) for k, v in raw_row.to_dict().items()},
                row_errors=row_errors,
            )
        )

    return RegisterParseResult(
        columns=columns,
        detected_mapping=effective,
        rows=rows,
        row_count=len(rows),
    )
