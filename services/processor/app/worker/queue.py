"""RQ queue helpers."""

from __future__ import annotations

from redis import Redis
from rq import Queue

from app.config import get_settings

AUDIT_QUEUE = "audits"


def get_queue() -> Queue:
    settings = get_settings()
    return Queue(AUDIT_QUEUE, connection=Redis.from_url(settings.redis_url))


def enqueue_audit(audit_run_id: str) -> str:
    """Enqueue a durable audit job and return its job id."""
    job = get_queue().enqueue(
        "app.worker.audit.run_audit", audit_run_id, job_timeout=900, result_ttl=86400
    )
    return job.id
