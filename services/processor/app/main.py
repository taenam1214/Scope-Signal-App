"""FastAPI entrypoint for the ScopeSignal processor service.

Phase 3: stateless parsing endpoints. The web app uploads a file to private
storage and persists results itself (under the user's RLS session); this service
only transforms bytes into structured chunks / normalized register rows, so it
needs no database or storage credentials. Endpoints are protected by a shared
secret (WORKER_AUTH_SECRET).

Audit-enqueue endpoints and the RQ worker land in Phase 4.
"""

from __future__ import annotations

import json

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel

from app import __version__
from app.config import get_settings
from app.parsers import parse_document, parse_register_csv
from app.reports.pdf import render_pdf
from app.reports.schemas import ReportPayload
from app.schemas import DocumentParseResult, RegisterParseResult
from app.worker.queue import enqueue_audit

app = FastAPI(title="ScopeSignal Processor", version=__version__)


def require_worker_auth(x_worker_auth: str = Header(default="")) -> None:
    """Reject calls without the shared worker secret."""
    secret = get_settings().worker_auth_secret
    if not secret or x_worker_auth != secret:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check — no external dependencies touched."""
    settings = get_settings()
    return {
        "status": "ok",
        "version": __version__,
        "app_env": settings.app_env,
        "ai_mode": settings.ai_mode,
    }


@app.post("/parse/document", response_model=DocumentParseResult)
async def parse_document_endpoint(
    file_type: str = Form(...),
    file: UploadFile = File(...),
    _auth: None = Depends(require_worker_auth),
) -> DocumentParseResult:
    data = await file.read()
    return parse_document(file_type, data)


@app.post("/parse/register", response_model=RegisterParseResult)
async def parse_register_endpoint(
    file: UploadFile = File(...),
    mapping: str | None = Form(default=None),
    _auth: None = Depends(require_worker_auth),
) -> RegisterParseResult:
    data = await file.read()
    try:
        parsed_mapping = json.loads(mapping) if mapping else None
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="mapping must be valid JSON")
    return parse_register_csv(data, parsed_mapping)


class EnqueueAuditRequest(BaseModel):
    audit_run_id: str


class EnqueueAuditResponse(BaseModel):
    job_id: str


@app.post("/audits/enqueue", response_model=EnqueueAuditResponse)
def enqueue_audit_endpoint(
    body: EnqueueAuditRequest,
    _auth: None = Depends(require_worker_auth),
) -> EnqueueAuditResponse:
    """Enqueue a durable audit job; the RQ worker processes it asynchronously."""
    job_id = enqueue_audit(body.audit_run_id)
    return EnqueueAuditResponse(job_id=job_id)


@app.post("/reports/pdf")
def report_pdf_endpoint(
    payload: ReportPayload,
    _auth: None = Depends(require_worker_auth),
) -> Response:
    """Render an audit report PDF from the assembled payload."""
    pdf = render_pdf(payload)
    return Response(content=pdf, media_type="application/pdf")
