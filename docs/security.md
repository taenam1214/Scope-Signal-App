# ScopeSignal — Security Notes

**Implemented in the MVP:** email/password auth with route protection; organization-membership
authorization; **Row Level Security** on all tenant tables (+ private Storage policies) proven by
DB tests and a cross-tenant E2E; private-by-default file storage under tenant/project paths;
content/MIME validation + size/quota limits + sha256 dedupe; strict Pydantic schemas with
citation validation (hallucinated ids/excerpts rejected); documents treated strictly as data;
server-only secrets (service role + OpenAI key never shipped to the browser); in-memory rate
limiting on upload/audit actions; an audit trail (`audit_logs`); safe HTML handling (stripped, not
rendered). Items below marked (Phase N / future) note where something is partial or deferred.

Status by phase. Items marked (future) are not yet implemented.

## Tenancy & authorization

- Row Level Security on all tenant-owned tables; policies derive org membership from the
  authenticated identity, never from a client-submitted `organization_id`. (Phase 2)
- The worker uses the service-role key but **independently verifies** tenant/project ownership
  before any read/write. (Phase 2–4)
- Cross-tenant access is covered by automated tests. (Phase 2 / Phase 6)

## Secrets

- Service-role key, `OPENAI_API_KEY`, and `WORKER_AUTH_SECRET` are **server-only** — never
  `NEXT_PUBLIC_*`, never shipped to the browser. See `.env.example` annotations.
- No real credentials are committed. `.env` is gitignored; only `.env.example` (placeholders) is
  tracked.

## File handling

- Private-by-default Supabase Storage under tenant/project-scoped paths; no public URLs for
  customer documents. Downloads use short-lived signed URLs. (Phase 3)
- Content/MIME validation beyond file extension; per-file (`MAX_UPLOAD_MB`, default 15) and
  per-project (`MAX_PROJECT_STORAGE_MB`, default 100) limits enforced server-side. (Phase 3)
- Content hashing (sha256) to avoid duplicate ingestion. (Phase 3)

## Untrusted document content (prompt-injection defense)

- Uploaded documents are treated **exclusively as data**. They must not modify system
  instructions, trigger network calls, execute code, access other tenants' data, or create/send
  change orders. (Phase 4)
- AI outputs are validated against strict Pydantic schemas; responses referencing nonexistent
  document/chunk/source IDs are rejected. (Phase 4)
- Links inside uploaded records are never auto-fetched.

## Logging & privacy

- Full customer documents are never written to application logs or error telemetry.
- Claims about zero-retention, SOC 2, or enterprise certifications are **not** made without
  verification.

## Hardening (Phase 6)

- Rate limiting on upload and audit endpoints.
- CSRF-safe auth flows; safe PDF/HTML rendering (sanitized previews).
- Durable job status with retry limits; audit trail for reviewer actions.
- No development bypasses enabled in production builds.
