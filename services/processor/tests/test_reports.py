from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.reports.pdf import render_pdf
from app.reports.schemas import ReportEvidence, ReportFinding, ReportPayload

client = TestClient(app)
AUTH = {"X-Worker-Auth": get_settings().worker_auth_secret}

PAYLOAD = ReportPayload(
    project_name="Westside Office Renovation",
    project_reference="WOR-2025",
    trade="Electrical",
    audit_date="2025-03-21",
    model_identifier="mock-extractor-v1",
    pipeline_version="pipeline-v1",
    documents=["email-conduit-reroute.eml", "RFI-042.txt"],
    register_count=4,
    findings=[
        ReportFinding(
            title="RFI-042: potential scope addition",
            change_type="scope_addition",
            event_date="2025-03-10",
            parties=["General Contractor"],
            reconciliation_status="no_match_found",
            review_status="confirmed_unrecorded",
            review_notes="No CO on file; follow up.",
            evidence=[
                ReportEvidence(
                    filename="email-conduit-reroute.eml",
                    source_locator="email paragraph 1",
                    exact_excerpt="the GC directed additional conduit routing",
                    evidence_role="primary",
                )
            ],
        )
    ],
)


def test_render_pdf_returns_pdf_bytes():
    pdf = render_pdf(PAYLOAD)
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 1000


def test_report_endpoint_requires_auth():
    assert client.post("/reports/pdf", json=PAYLOAD.model_dump()).status_code == 401


def test_report_endpoint_returns_pdf():
    resp = client.post("/reports/pdf", headers=AUTH, json=PAYLOAD.model_dump())
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"


def test_report_handles_empty_findings():
    empty = PAYLOAD.model_copy(update={"findings": []})
    assert render_pdf(empty)[:5] == b"%PDF-"
