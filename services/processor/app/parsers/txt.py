"""Plain-text parsing with safe decoding."""

from __future__ import annotations

from app.parsers.common import chunk_text
from app.schemas import DocumentParseResult

MAX_TXT_BYTES = 5 * 1024 * 1024  # 5 MB of raw text is already very large


def parse_txt(data: bytes) -> DocumentParseResult:
    if len(data) > MAX_TXT_BYTES:
        return DocumentParseResult(
            parse_status="failed",
            parse_error="Text file is too large to process.",
        )
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        # Fall back to a permissive decoding rather than failing outright.
        text = data.decode("latin-1", errors="replace")

    text = text.strip()
    if not text:
        return DocumentParseResult(
            parse_status="failed", parse_error="Text file is empty."
        )

    return DocumentParseResult(parse_status="parsed", chunks=chunk_text(text))
