"""FastAPI entrypoint for the ScopeSignal processor service.

Phase 1: exposes health/readiness only. Audit-enqueue endpoints and the RQ
worker land in Phase 4.
"""

from __future__ import annotations

from fastapi import FastAPI

from app import __version__
from app.config import get_settings

app = FastAPI(title="ScopeSignal Processor", version=__version__)


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
