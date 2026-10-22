# ScopeSignal — Product Decisions

A running log of decisions and their rationale. Newest first.

## Phase 6 — Reports & hardening

- **PDF rendered in the processor** (ReportLab), not the browser: the web assembles the report
  payload under RLS and POSTs it to `/reports/pdf`; the processor stays stateless. **CSV is built
  in the web** (trivial, no round trip). Both download via authenticated route handlers that
  re-check the session and RLS (`getReportData` returns null → 404 for foreign projects).
- **Branded PDF without an external logo asset** — a drawn navy header band + wordmark (none was
  supplied in the repo). Includes the required limitations statement in an amber callout.
- **Rate limiting is in-memory / per-process** — sufficient for a single web instance / MVP;
  documented to move to Redis for multi-instance. Applied to upload and audit-start actions.
- **Cross-tenant isolation is asserted by an E2E** (org B → 404 on org A's project and report
  routes), complementing the Phase 2 DB-level RLS proof.

## Phase 5 — Review dashboard

- **Review happens in a client workspace** (`review-workspace.tsx`) that receives findings
  server-rendered from the audit page; the server stays the source of truth and a `saveReview`
  server action persists each decision (RLS-scoped, re-verifies the candidate belongs to the
  project). Local state updates optimistically so the list/badges reflect a save without a reload.
- **Six outcomes, color-independent**: each outcome has a Lucide icon + label so decisions are
  distinguishable without relying on color (accessibility). Amber is reserved for "needs attention".
- **Every decision records actor + timestamp** (`reviewed_by`, `reviewed_at`) and an `audit_logs`
  entry; decisions are revisable.
- **Reviewer config kept in the web** (`review-config.ts`), not `packages/shared` — labels and
  descriptions are UI concerns; the raw enum still lives in shared and the DB enum.
- **Reports link is a placeholder** until Phase 6.

## Phase 4 — AI analysis & reconciliation

- **Pluggable extraction adapter** chosen by `AI_MODE`. `mock` is a deterministic keyword/heuristic
  extractor (offline, reproducible, drives tests + eval); `live` uses OpenAI structured outputs.
  Model id is configurable via `OPENAI_MODEL`, never hardcoded.
- **Pipeline is pure** (`app/pipeline/`): extract → validate citations → cluster → reconcile →
  findings, operating on Pydantic models with no DB/network. The worker is a thin DB wrapper around
  it, so correctness is unit-tested without infrastructure.
- **Citation validation is mandatory**: candidates citing unknown chunk ids, or excerpts not found
  verbatim in the cited chunk, are rejected. Prevents hallucinated evidence (blueprint H).
- **Durable audits via RQ**, not a DB polling loop. Web creates the `audit_runs` row then calls the
  processor `POST /audits/enqueue`; the processor enqueues the Python job (native RQ) and the
  `rq worker audits` container runs it. The worker connects to Postgres via psycopg over
  `host.docker.internal:54322` (Docker Desktop) and scopes all queries by the audit's org/project.
- **Idempotent re-runs**: a run deletes its prior `candidate_events` (cascades evidence/matches)
  before writing. Findings persist atomically; `pipeline_version` + `model_identifier` are stored.
- **Reconciliation is two-stage**: explicit-reference match → `matched`; else conservative token
  similarity (Jaccard ≥ 0.2 and ≥ 2 shared tokens) → `possible_match`; else `no_match_found`.
  "No match found" means *not in the supplied register*, nothing more (stated in the UI).
- **Clustering by explicit reference only** (e.g. RFI-042) — descriptions are never merged on
  similarity alone, avoiding incorrectly collapsing distinct events.
- **Synthetic dataset defined in code** (`app/eval/synthetic.py`) and dumped to fixture files for
  upload demos. Ground-truth labels live beside it but are never fed to the extractor.

## Phase 3 — File ingestion

- **Processor is a stateless parsing microservice.** It receives file bytes + type over HTTP
  (protected by `WORKER_AUTH_SECRET`) and returns structured chunks / normalized register rows.
  It holds no DB or storage credentials; the web app persists results under the user's RLS
  session. This keeps the service-role surface minimal and the parser trivially unit-testable.
  (The heavier, durable **audit** job will use RQ in Phase 4.)
- **Parse-on-upload is synchronous** via the processor endpoint. Single-file parsing is fast; the
  blueprint's "run outside the request" concern applies to multi-file AI analysis (Phase 4), not
  single-document parsing.
- **Private storage, path = `{org}/{project}/{sha}-{name}`.** Storage RLS reuses `is_org_member`
  on the first path segment, so storage access is tenant-isolated like the tables. Uploads use the
  user session (anon key), not the service role.
- **Validation beyond extension**: PDF checked for `%PDF-` magic; eml/csv/txt required to be
  non-binary. Size + per-project quota enforced server-side; sha256 dedupe per project.
- **Scanned PDFs → `ocr_required`**, never fabricated text. OCR deferred behind a future flag.
- **CSV register import is a wizard**: detect mapping → user adjusts → preview → import. Re-import
  replaces the project's register (idempotent). Original cell values + per-row parse errors are
  kept in `normalized_metadata`.
- **Docker Desktop auto-pause disabled** (`autoPauseEnabled: false`, timeout 30s → 86400s). The
  30s auto-pause was stopping Supabase/processor mid-work. Machine-level change, documented in the
  README troubleshooting section.

## Phase 2 — Auth & data model

- **Email + password auth** (not magic link) via `@supabase/ssr`. Deterministic to test, no email
  round-trip. Local Supabase has confirmations disabled.
- **One org per user in v0.1.** A signup trigger (`handle_new_user`) auto-creates an organization
  (named from `organization_name` signup metadata, else derived from email) and an `owner`
  membership. `requireMembership()` reads the user's first org.
- **RLS via a `SECURITY DEFINER` `is_org_member(org)` function.** Every tenant table policy calls
  it; the definer context avoids recursion on `organization_members`. A client-submitted
  `organization_id` is never trusted. Cross-tenant isolation is proven at the DB level and by E2E.
- **Enums as Postgres enum types**, mirrored by `packages/shared` TS consts. Kept in sync by hand.
- **Route protection in `proxy.ts`** (Next 16 renamed the `middleware` convention to `proxy`).
  Public paths: `/`, `/login`, `/auth`; everything else redirects unauthenticated users to
  `/login?redirectTo=…` (relative-path-only redirect to avoid open redirects).
- **Deleting a user orphans their org** (member rows cascade from `auth.users`, the org row does
  not). Acceptable for v0.1; orphan orgs are RLS-invisible. Revisit if we add account deletion.

## Phase 1 — Repository & environment

- **Monorepo at repo root** (not nested `scopesignal/`). The repo is already
  `Scope-Signal-App/`; nesting would add a redundant level.
- **pnpm workspaces** for `apps/*` and `packages/*`. The Python worker lives under `services/`
  and is managed with its own `pyproject.toml` (not a pnpm workspace member).
- **Next.js 16 + React 19 + Tailwind v4** — current stable from `create-next-app`. Tailwind v4
  uses CSS-based `@theme` tokens; brand colors are defined there, not in a JS config.
- **Local-first + mock AI** — the app runs and tests fully offline. Real Supabase cloud keys and
  `OPENAI_API_KEY` drop in via `.env` to enable live mode. Rationale: lets us demo and test the
  vertical slice without confidential data or paid API calls, per the blueprint.
- **RQ + Redis** for the job queue — durable, maintained, minimal; avoids a homegrown DB polling
  loop. Managed Redis in production.
- **Supabase CLI via npm** (`pnpm exec supabase`) instead of Homebrew — the machine's Command Line
  Tools are too outdated for brew's source build; the npm package ships a prebuilt binary.
- **Worker runs in Docker (python:3.12-slim)** — the host Python is 3.9; Docker gives the required
  3.12 without touching the host.

## Guardrails (from the blueprint, enforced throughout)

- Every AI finding links to real source evidence; uncertainty is preserved, not hidden.
- Uploaded documents are untrusted input; they never alter system behavior.
- The system never silently creates or submits a change order.
- No fabricated metrics, dead buttons, or hardcoded success states.
- "No match found" means *not found in the supplied register* — never a claim it was undocumented
  elsewhere.
