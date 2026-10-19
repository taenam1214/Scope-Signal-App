"""Document parsers: PDF, EML, CSV, TXT."""

from __future__ import annotations

from app.parsers.csv_register import parse_register_csv, suggest_mapping
from app.parsers.eml import parse_eml
from app.parsers.pdf import parse_pdf
from app.parsers.txt import parse_txt
from app.schemas import DocumentParseResult

__all__ = [
    "parse_document",
    "parse_register_csv",
    "suggest_mapping",
    "parse_pdf",
    "parse_eml",
    "parse_txt",
]


def parse_document(file_type: str, data: bytes) -> DocumentParseResult:
    """Dispatch to the parser for `file_type` (pdf | eml | txt).

    CSV is handled separately via the register import flow (parse_register_csv),
    not as a chunked document.
    """
    match file_type:
        case "pdf":
            return parse_pdf(data)
        case "eml":
            return parse_eml(data)
        case "txt":
            return parse_txt(data)
        case _:
            return DocumentParseResult(
                parse_status="failed",
                parse_error=f"Unsupported document type: {file_type!r}",
            )
