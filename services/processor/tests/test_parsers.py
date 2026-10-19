from email.message import EmailMessage

import pymupdf as fitz  # PyMuPDF

from app.parsers import parse_document, parse_register_csv, suggest_mapping


def _make_pdf(pages_text: list[str | None]) -> bytes:
    doc = fitz.open()
    for text in pages_text:
        page = doc.new_page()
        if text:
            page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


# --- PDF ---------------------------------------------------------------------

def test_pdf_valid_extracts_pages():
    data = _make_pdf(["Change order for additional conduit.", "Second page text."])
    result = parse_document("pdf", data)
    assert result.parse_status == "parsed"
    assert len(result.chunks) == 2
    assert result.chunks[0].page_number == 1
    assert "conduit" in result.chunks[0].text
    assert result.metadata["page_count"] == 2


def test_pdf_without_text_requires_ocr():
    data = _make_pdf([None])  # a blank page: no extractable text
    result = parse_document("pdf", data)
    assert result.parse_status == "ocr_required"
    assert result.chunks == []


def test_pdf_malformed_fails_gracefully():
    result = parse_document("pdf", b"this is not a pdf")
    assert result.parse_status == "failed"
    assert result.parse_error


# --- EML ---------------------------------------------------------------------

def _make_eml(subject: str, body: str, html: bool = False) -> bytes:
    msg = EmailMessage()
    msg["From"] = "pm@gc.example"
    msg["To"] = "foreman@sub.example"
    msg["Subject"] = subject
    msg["Date"] = "Wed, 12 Mar 2025 10:00:00 -0500"
    if html:
        # HTML-only body (no plain-text alternative) to exercise tag stripping.
        msg.set_content(f"<html><body><p>{body}</p></body></html>", subtype="html")
    else:
        msg.set_content(body)
    return msg.as_bytes()


def test_eml_valid_has_header_summary_and_body():
    data = _make_eml("RFI-042 response", "Please extend the conduit route to the new panel.")
    result = parse_document("eml", data)
    assert result.parse_status == "parsed"
    assert result.chunks[0].source_locator == "email headers"
    assert "RFI-042 response" in result.chunks[0].text
    assert any("conduit route" in c.text for c in result.chunks[1:])
    assert result.metadata["headers"]["subject"] == "RFI-042 response"


def test_eml_html_only_is_stripped_to_text():
    data = _make_eml("HTML note", "Revised <b>routing</b> required", html=True)
    result = parse_document("eml", data)
    assert result.parse_status == "parsed"
    assert any("Revised" in c.text and "<b>" not in c.text for c in result.chunks)


def test_eml_empty_fails_gracefully():
    # No headers and no body -> failed, never crashes.
    result = parse_document("eml", b"")
    assert result.parse_status == "failed"


def test_eml_garbage_does_not_crash():
    # Malformed bytes with some text are handled gracefully (not a crash).
    result = parse_document("eml", b"\x00\x01 not an email")
    assert result.parse_status in {"parsed", "failed"}


# --- TXT ---------------------------------------------------------------------

def test_txt_chunks_by_paragraph():
    data = b"First paragraph about scope.\n\nSecond paragraph about schedule."
    result = parse_document("txt", data)
    assert result.parse_status == "parsed"
    assert len(result.chunks) == 2
    assert result.chunks[0].character_start == 0


def test_txt_empty_fails():
    assert parse_document("txt", b"   ").parse_status == "failed"


# --- CSV register ------------------------------------------------------------

CSV = (
    b"CO Number,Description,Date Submitted,Status,Amount\n"
    b"CO-001,Added conduit,2025-03-15,Approved,\"$1,250.00\"\n"
    b"CO-002,Relocated panel,03/20/2025,Pending,(500)\n"
    b"CO-003,Clarification,not-a-date,Open,abc\n"
)


def test_register_mapping_detects_columns():
    mapping = suggest_mapping(
        ["CO Number", "Description", "Date Submitted", "Status", "Amount"]
    )
    assert mapping["external_reference"] == "CO Number"
    assert mapping["description"] == "Description"
    assert mapping["submitted_date"] == "Date Submitted"
    assert mapping["status"] == "Status"
    assert mapping["amount"] == "Amount"


def test_register_normalizes_values_and_records_errors():
    result = parse_register_csv(CSV)
    assert result.row_count == 3
    r1, r2, r3 = result.rows
    assert r1.external_reference == "CO-001"
    assert r1.submitted_date == "2025-03-15"
    assert r1.amount == 1250.0
    assert r2.amount == -500.0  # parenthesized negative
    assert r2.submitted_date == "2025-03-20"
    # Row 3 has an unparseable date and amount -> preserved as errors, not dropped.
    assert r3.submitted_date is None and r3.amount is None
    assert len(r3.row_errors) == 2
    assert "Added conduit" in r1.raw.values()


def test_register_bad_csv_reports_error():
    result = parse_register_csv(b"\xff\xfe\x00bogus")
    assert result.row_count == 0 or result.errors
