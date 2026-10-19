"""EML (RFC 822) parsing via the Python standard library.

Extracts headers and the text body. Attachments and embedded external resources
are ignored and never fetched or executed. HTML-only bodies are stripped to text.
"""

from __future__ import annotations

from email import policy
from email.parser import BytesParser

from app.parsers.common import chunk_text, strip_html
from app.schemas import Chunk, DocumentParseResult


def _extract_body(msg) -> str:
    """Prefer text/plain; fall back to stripped text/html. Skip attachments."""
    try:
        plain = msg.get_body(preferencelist=("plain",))
        if plain is not None:
            return plain.get_content().strip()
    except Exception:  # noqa: BLE001
        pass
    try:
        html = msg.get_body(preferencelist=("html",))
        if html is not None:
            return strip_html(html.get_content()).strip()
    except Exception:  # noqa: BLE001
        pass
    return ""


def parse_eml(data: bytes) -> DocumentParseResult:
    try:
        msg = BytesParser(policy=policy.default).parsebytes(data)
    except Exception as exc:  # noqa: BLE001
        return DocumentParseResult(
            parse_status="failed", parse_error=f"Could not parse email: {exc}"
        )

    headers = {
        "from": str(msg.get("From", "")),
        "to": str(msg.get("To", "")),
        "cc": str(msg.get("Cc", "")),
        "subject": str(msg.get("Subject", "")),
        "date": str(msg.get("Date", "")),
    }

    body = _extract_body(msg)
    if not body and not headers["subject"]:
        return DocumentParseResult(
            parse_status="failed",
            parse_error="Email contained no readable subject or text body.",
            metadata={"headers": headers},
        )

    # A header summary chunk gives downstream analysis the sender/subject/date
    # context; body paragraphs follow.
    header_summary = (
        f"From: {headers['from']}\nTo: {headers['to']}\n"
        f"Subject: {headers['subject']}\nDate: {headers['date']}"
    ).strip()

    chunks: list[Chunk] = [
        Chunk(
            chunk_index=0,
            text=header_summary,
            source_locator="email headers",
            character_start=0,
            character_end=len(header_summary),
        )
    ]
    for chunk in chunk_text(body, locator_prefix="email paragraph"):
        chunk.chunk_index += 1
        chunks.append(chunk)

    return DocumentParseResult(
        parse_status="parsed", chunks=chunks, metadata={"headers": headers}
    )
