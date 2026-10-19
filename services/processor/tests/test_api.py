import pymupdf as fitz  # PyMuPDF
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)
SECRET = get_settings().worker_auth_secret
AUTH = {"X-Worker-Auth": SECRET}


def _pdf_bytes(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def test_parse_document_requires_auth():
    resp = client.post(
        "/parse/document",
        data={"file_type": "txt"},
        files={"file": ("a.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 401


def test_parse_document_pdf():
    resp = client.post(
        "/parse/document",
        headers=AUTH,
        data={"file_type": "pdf"},
        files={"file": ("co.pdf", _pdf_bytes("Additional conduit requested."), "application/pdf")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["parse_status"] == "parsed"
    assert "conduit" in body["chunks"][0]["text"]


def test_parse_register_csv_with_detected_mapping():
    csv = b"CO Number,Description,Amount\nCO-1,Added conduit,$100.00\n"
    resp = client.post(
        "/parse/register",
        headers=AUTH,
        files={"file": ("reg.csv", csv, "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["detected_mapping"]["external_reference"] == "CO Number"
    assert body["rows"][0]["amount"] == 100.0
