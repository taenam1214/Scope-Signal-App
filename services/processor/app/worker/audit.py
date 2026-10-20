"""Durable audit job.

Loads a queued audit run, runs the analysis pipeline over the project's parsed
chunks and register, and atomically persists findings. Idempotent: re-running
replaces any prior results for the same audit run.
"""

from __future__ import annotations

import logging

import psycopg
from psycopg.types.json import Json

from app.config import get_settings
from app.pipeline.models import RegisterEntryIn, SourceChunk
from app.pipeline.run import run_pipeline

log = logging.getLogger("scopesignal.audit")


def _load_chunks(cur, project_id: str) -> list[SourceChunk]:
    cur.execute(
        """
        select dc.id::text, dc.document_id::text, d.file_type, d.original_filename,
               dc.text, dc.page_number, dc.source_locator
        from document_chunks dc
        join documents d on d.id = dc.document_id
        where dc.project_id = %s and d.parse_status = 'parsed'
        order by dc.document_id, dc.chunk_index
        """,
        (project_id,),
    )
    return [
        SourceChunk(
            chunk_id=r[0], document_id=r[1], file_type=r[2], filename=r[3],
            text=r[4], page_number=r[5], source_locator=r[6],
        )
        for r in cur.fetchall()
    ]


def _load_register(cur, project_id: str) -> list[RegisterEntryIn]:
    cur.execute(
        """
        select id::text, external_reference, title, description,
               submitted_date::text, status, amount::float
        from register_entries where project_id = %s
        """,
        (project_id,),
    )
    return [
        RegisterEntryIn(
            id=r[0], external_reference=r[1], title=r[2], description=r[3],
            submitted_date=r[4], status=r[5], amount=r[6],
        )
        for r in cur.fetchall()
    ]


def _document_snapshot(cur, project_id: str) -> list[dict]:
    cur.execute(
        "select id::text, original_filename, file_type, parse_status "
        "from documents where project_id = %s order by uploaded_at",
        (project_id,),
    )
    return [
        {"id": r[0], "filename": r[1], "file_type": r[2], "parse_status": r[3]}
        for r in cur.fetchall()
    ]


def run_audit(audit_run_id: str) -> dict:
    """Entry point executed by the RQ worker."""
    settings = get_settings()
    conn = psycopg.connect(settings.database_url, autocommit=False)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "select organization_id::text, project_id::text, status "
                "from audit_runs where id = %s",
                (audit_run_id,),
            )
            row = cur.fetchone()
            if row is None:
                log.warning("audit run %s not found", audit_run_id)
                return {"status": "not_found"}
            org_id, project_id, _status = row

            # Mark processing; clear any prior results (idempotent re-run).
            cur.execute(
                "update audit_runs set status='processing', started_at=now(), "
                "error_message=null where id = %s",
                (audit_run_id,),
            )
            cur.execute("delete from candidate_events where audit_run_id = %s", (audit_run_id,))
            conn.commit()

            chunks = _load_chunks(cur, project_id)
            register = _load_register(cur, project_id)
            snapshot = _document_snapshot(cur, project_id)

        result = run_pipeline(chunks, register, settings)

        with conn.cursor() as cur:
            for finding in result.findings:
                cur.execute(
                    """
                    insert into candidate_events (
                        organization_id, project_id, audit_run_id, normalized_title,
                        description, event_date, detected_parties, potential_change_type,
                        extraction_confidence, reconciliation_status, review_status
                    ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'needs_review')
                    returning id
                    """,
                    (
                        org_id, project_id, audit_run_id, finding.normalized_title,
                        finding.description, finding.event_date, finding.detected_parties,
                        finding.potential_change_type, finding.extraction_confidence,
                        finding.reconciliation_status,
                    ),
                )
                candidate_id = cur.fetchone()[0]

                for ev in finding.evidence:
                    cur.execute(
                        """
                        insert into candidate_evidence (
                            organization_id, candidate_event_id, document_id, chunk_id,
                            exact_excerpt, source_locator, evidence_role
                        ) values (%s,%s,%s,%s,%s,%s,%s)
                        """,
                        (org_id, candidate_id, ev.document_id, ev.chunk_id,
                         ev.exact_excerpt, ev.source_locator, ev.evidence_role),
                    )

                for m in finding.register_matches:
                    cur.execute(
                        """
                        insert into candidate_register_matches (
                            organization_id, candidate_event_id, register_entry_id,
                            matching_method, match_score, explanation
                        ) values (%s,%s,%s,%s,%s,%s)
                        """,
                        (org_id, candidate_id, m.register_entry_id, m.matching_method,
                         m.match_score, m.explanation),
                    )

            cur.execute(
                """
                update audit_runs set status='completed', completed_at=now(),
                    pipeline_version=%s, model_identifier=%s, document_snapshot=%s
                where id = %s
                """,
                (result.pipeline_version, result.model_identifier, Json(snapshot), audit_run_id),
            )
        conn.commit()
        log.info("audit %s completed: %d findings", audit_run_id, len(result.findings))
        return {"status": "completed", "findings": len(result.findings)}

    except Exception as exc:  # noqa: BLE001 - record failure, never crash silently
        conn.rollback()
        with conn.cursor() as cur:
            cur.execute(
                "update audit_runs set status='failed', completed_at=now(), error_message=%s "
                "where id = %s",
                (str(exc)[:500], audit_run_id),
            )
        conn.commit()
        log.exception("audit %s failed", audit_run_id)
        return {"status": "failed", "error": str(exc)}
    finally:
        conn.close()
