"""PDF text extraction via PyMuPDF. One chunk per page; page numbers preserved.

Scanned PDFs (no extractable text) return an 'ocr_required' status rather than
inventing text. OCR can be added later behind a feature flag.
"""

from __future__ import annotations

import pymupdf as fitz  # PyMuPDF (import pymupdf avoids the legacy `fitz` deprecation warning)

from app.schemas import Chunk, DocumentParseResult


def parse_pdf(data: bytes) -> DocumentParseResult:
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 - surface a clean error to the user
        return DocumentParseResult(
            parse_status="failed", parse_error=f"Could not open PDF: {exc}"
        )

    chunks: list[Chunk] = []
    cursor = 0
    total_chars = 0
    index = 0
    try:
        for page_no in range(doc.page_count):
            page = doc.load_page(page_no)
            text = page.get_text("text").strip()
            total_chars += len(text)
            if not text:
                continue
            start = cursor
            end = cursor + len(text)
            cursor = end + 1  # account for a logical separator between pages
            chunks.append(
                Chunk(
                    chunk_index=index,
                    text=text,
                    page_number=page_no + 1,
                    source_locator=f"page {page_no + 1}",
                    character_start=start,
                    character_end=end,
                )
            )
            index += 1
        page_count = doc.page_count
    finally:
        doc.close()

    if total_chars == 0:
        return DocumentParseResult(
            parse_status="ocr_required",
            parse_error=(
                "No extractable text found. This appears to be a scanned PDF; "
                "OCR is not enabled."
            ),
            metadata={"page_count": page_count},
        )

    return DocumentParseResult(
        parse_status="parsed", chunks=chunks, metadata={"page_count": page_count}
    )
