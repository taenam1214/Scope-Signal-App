# ScopeSignal

AI-assisted scope-change reconciliation for US commercial electrical subcontractors.

> Given project emails, RFIs, and a change-order register, identify potential scope-change events
> that are **not** clearly accounted for in the register, and show exactly which source records
> support each finding. ScopeSignal does not decide contractual entitlement, guarantee payment, or
> auto-submit change orders. Every finding links to real source evidence.

This repo is a monorepo built in phases. **All 6 phases complete** — the MVP acceptance workflow
runs end to end. See `docs/architecture.md` for the full design and `docs/product-decisions.md`
for the decision log.

## Repository layout

```
apps/web/            Next.js 16 app (App Router, TS strict, Tailwind v4, shadcn/ui)
services/processor/  Python 3.12 FastAPI worker + RQ (parsers / extraction / reconciliation / reports)
packages/shared/     Shared TypeScript domain enums (mirrored by processor Pydantic schemas)
supabase/            Postgres migrations, seed, config, synthetic-project fixtures
docs/                architecture · product-decisions · security · deployment · evaluation
docker-compose.yml   Local infra: Redis + processor API + RQ worker
.env.example         All environment variables (server-only values annotated)
```

## End-to-end API & system design

This section is the full technical reference: how a request travels through the system, every
API surface, the data model, the AI pipeline, and the trust boundaries. For the shorter
narrative overview see `docs/architecture.md`.

### 1. Topology & trust boundaries

```
                               ┌──────────────────────── Browser (untrusted) ─┐
                               │  shadcn/ui · cookie session (Supabase Auth)   │
                               └───────┬───────────────────────────────┬──────┘
                        RSC + Server    │                               │  signed
                        Actions (POST)  │                               │  storage ops
                                        ▼                               ▼
        ┌──────────────────────────── apps/web (Next.js 16, Vercel) ──────────────────┐
        │  Server Actions / Route Handlers run as the USER (anon key + RLS).           │
        │  Holds no OpenAI key. Holds WORKER_AUTH_SECRET only server-side.             │
        └───┬──────────────────────────────┬───────────────────────────────┬─────────┘
            │ supabase-js (anon, RLS)       │ HTTP + X-Worker-Auth           │ HTTP + X-Worker-Auth
            ▼                               ▼                               ▼
   ┌────────────────────┐        ┌───────────────────────────┐   ┌───────────────────────┐
   │ Supabase            │        │ processor API (FastAPI)    │   │ processor /reports/pdf │
   │  Postgres + RLS     │        │  /parse/* (stateless)      │   │  (ReportLab → PDF)     │
   │  Auth               │        │  /audits/enqueue → Redis   │   └───────────────────────┘
   │  private Storage    │        └─────────────┬─────────────┘
   └─────────▲──────────┘                       │ RQ (durable job)
             │ psycopg (service-role,           ▼
             │ independent ownership     ┌───────────────┐      ┌──────────────────────────┐
             │ re-check)                 │ Redis (queue) │─────▶│ RQ worker: run_audit()    │
             └───────────────────────────┤               │      │ pipeline → persist        │
                                         └───────────────┘      │ findings  ▲ OpenAI | mock  │
                                                                └───────────┴───────────────┘
```

**Three trust zones:**

1. **Browser** — untrusted. Only ever gets the public Supabase URL + anon key and a session
   cookie. Every write it triggers is re-authorized by Postgres RLS.
2. **apps/web server** — runs Server Actions/Route Handlers *as the user* via the anon key, so
   RLS still applies. It is the only place the `WORKER_AUTH_SECRET` and (in live mode) the path
   to OpenAI exist, and it never exposes them to the client.
3. **processor + worker** — the `/parse/*` and `/reports/pdf` endpoints are **stateless** (bytes
   in, structured data out — no DB credentials needed). Only the **RQ worker** touches the DB,
   using the service-role key, and it **independently re-verifies** org/project ownership from the
   `audit_run_id` rather than trusting any client-supplied tenant id.

### 2. End-to-end request lifecycle

```
Sign up ──▶ auth.users insert ──▶ trigger handle_new_user() provisions org + owner membership
Create project ──▶ createProject() ──▶ projects row (RLS: org member) ──▶ audit_logs
Upload doc  ──▶ uploadDocument() ─┬▶ validate (ext+content sniff) + sha256 dedupe + quota
                                  ├▶ Storage.upload  {org}/{project}/{sha-prefix}-{name}
                                  ├▶ documents row (parse_status=processing)
                                  ├▶ processor POST /parse/document ──▶ chunks
                                  └▶ document_chunks rows + documents.parse_status=parsed
Import register ─▶ previewRegister() → (renormalizeRegister()) → importRegister()
                                  └▶ replace register_entries for project (idempotent)
Start audit ─▶ startAudit() ─┬▶ guard: ≥1 parsed non-csv doc, no active run, rate limit
                             ├▶ audit_runs row (status=queued)
                             └▶ processor POST /audits/enqueue ──▶ Redis job
RQ worker run_audit() ─┬▶ status=processing, clear prior candidates (idempotent re-run)
                       ├▶ load parsed chunks + register + document snapshot
                       ├▶ run_pipeline(): extract → validate citations → cluster → reconcile
                       ├▶ persist candidate_events + candidate_evidence + candidate_register_matches
                       └▶ status=completed (+ pipeline_version, model_identifier, snapshot)
Review ─▶ UI polls audit_runs.status; saveReview() sets review_status/notes (+ audit_logs)
Report ─▶ GET /api/.../pdf|csv ─▶ getReportData() (RLS) ─▶ (pdf: processor /reports/pdf)
```

### 3. API surface — web app

The web app exposes two kinds of server endpoints. **Server Actions** are the primary write path
(invoked by forms/components, not addressable URLs); **Route Handlers** serve file downloads. All
run under the caller's Supabase session, so **RLS is the authorization boundary** — a missing or
cross-tenant row returns "not found" rather than data.

#### Server Actions

| Action | File | Input | Result | Guards |
| --- | --- | --- | --- | --- |
| `createProject` | `projects/actions.ts` | `FormData` (name, referenceNumber?, trade, description?, startDate?) | redirect `/projects/:id` | zod validation |
| `uploadDocument` | `projects/[id]/documents/actions.ts` | `projectId`, `FormData{file}` | `{ok}` / `{error}` | rate limit `upload:{user}` 30/60s · size ≤ `MAX_UPLOAD_MB` · ext+content sniff · sha256 dedupe · project quota |
| `deleteDocument` | same | `projectId`, `documentId` | void | RLS; chunks cascade |
| `previewRegister` | same | `projectId`, `FormData{file}` | `{preview}` / `{error}` | rate limit · CSV only · stages raw CSV in Storage |
| `renormalizeRegister` | same | `projectId`, `FormData{token, mapping}` | `{preview}` | re-reads staged CSV with adjusted mapping |
| `importRegister` | same | `projectId`, `FormData{token, mapping}` | `{imported}` | replaces `register_entries` for project (idempotent) |
| `startAudit` | `projects/[id]/audits/actions.ts` | `projectId`, `FormData` | redirect `/projects/:id/audits/:runId` / `{error}` | rate limit `audit:{user}` 10/60s · ≥1 parsed non-csv doc · no active run |
| `saveReview` | same | `{projectId, candidateId, reviewStatus, notes}` | `{ok, reviewedAt, reviewerEmail}` / `{error}` | valid `review_status` · notes ≤ 5000 · candidate∈project |

#### Route Handlers (authenticated downloads)

| Method & path | Returns | Notes |
| --- | --- | --- |
| `GET /api/projects/[id]/audits/[auditId]/pdf` | `application/pdf` | `getReportData()` under RLS → `null` ⇒ **404**; calls processor `/reports/pdf`; processor down ⇒ **502** |
| `GET /api/projects/[id]/audits/[auditId]/csv` | `text/csv` | same RLS-scoped assembly; CSV rendered in-process (no processor call) |

Both return **401** with no session. The report payload is assembled with nested PostgREST
selects (`candidate_events` → `candidate_evidence` → `documents`, and `candidate_register_matches`
→ `register_entries`), so a user who can't see the project gets no rows → 404.

### 4. API surface — processor service (FastAPI)

Base URL `PROCESSOR_URL` (default `http://127.0.0.1:8000`). Every endpoint except `/health`
requires the `X-Worker-Auth: $WORKER_AUTH_SECRET` header (`require_worker_auth` → **401** on
mismatch). The service is server-to-server only; it is never called from the browser.

| Method & path | Auth | Request | Response |
| --- | --- | --- | --- |
| `GET /health` | none | — | `{status, version, app_env, ai_mode}` |
| `POST /parse/document` | worker | multipart `file_type`, `file` | `DocumentParseResult{parse_status, parse_error, metadata, chunks[]}` |
| `POST /parse/register` | worker | multipart `file`, `mapping?` (JSON) | `RegisterParseResult{columns, detected_mapping, rows[], row_count, errors[]}` |
| `POST /audits/enqueue` | worker | `{audit_run_id}` | `{job_id}` (RQ job, `job_timeout=900s`, `result_ttl=86400s`) |
| `POST /reports/pdf` | worker | `ReportPayload` (project, findings, evidence, matches) | `application/pdf` bytes |

`ParsedChunk` = `{chunk_index, text, page_number, source_locator, character_start, character_end}`.
A `RegisterRow` carries `{external_reference, title, description, submitted_date, status, amount,
raw, row_errors}`. The `/parse/*` endpoints hold no state — the web app persists results itself
under the user's RLS session.

### 5. Data model

Postgres, all tenant tables keyed by `organization_id` and protected by RLS. Enums are the source
of truth in `packages/shared/src/index.ts`, mirrored by the SQL enums and processor Pydantic
schemas.

```
auth.users ──(trigger)──▶ organizations ──< organization_members >── auth.users
                                │
                                └──< projects ──< documents ──< document_chunks
                                           │          └─(sha256 unique per project)
                                           ├──< register_entries (source_document_id → documents)
                                           └──< audit_runs ──< candidate_events ─┬─< candidate_evidence ──▶ documents / document_chunks
                                                                                 └─< candidate_register_matches ──▶ register_entries
organizations ──< audit_logs   (actor_user_id, action, resource_type, resource_id, metadata)
```

Key columns:

- **audit_runs**: `status` (`queued|processing|completed|failed|canceled`), `pipeline_version`,
  `model_identifier`, `document_snapshot` (jsonb of docs analyzed), timing + `error_message`.
- **candidate_events**: `normalized_title`, `detected_parties[]`, `potential_change_type`,
  `extraction_confidence` (0–1), `reconciliation_status`, `review_status`, `reviewed_by/at`.
- **candidate_evidence**: `exact_excerpt` + `source_locator` + `evidence_role` (`primary`/
  `supporting`), FK to the `document_id`/`chunk_id` it came from — this is the provenance link.
- **candidate_register_matches**: `matching_method` (`explicit_reference`/`text_similarity`),
  `match_score`, `explanation`.

**Enums** — `parse_status`, `audit_status`, `reconciliation_status` (`matched`, `possible_match`,
`no_match_found`, `insufficient_data`), `review_status` (`needs_review`, `confirmed_unrecorded`,
`already_recorded`, `not_additional_scope`, `duplicate`, `insufficient_evidence`),
`document_file_type` (`pdf|eml|csv|txt`), `org_role` (`owner|member`).

### 6. AI analysis pipeline

`run_pipeline(chunks, register, settings)` is pure and deterministic given its adapter
(`services/processor/app/pipeline/run.py`):

1. **Extract** — the adapter returns `ExtractedCandidate`s, each citing real `chunk_id`s and exact
   excerpts. `AI_MODE=mock` uses a keyword/heuristic extractor (positive signals like "extra
   work", "additional", "directed"; negative signals like "included in the original scope"
   suppress false positives). `AI_MODE=live` + `OPENAI_API_KEY` uses OpenAI structured outputs
   with a prompt that treats documents strictly as data (prompt-injection resistant) and preserves
   uncertainty.
2. **Validate citations** — drop any citation referencing an unknown chunk, and any excerpt not
   actually present (whitespace-normalized) in its cited chunk text. A candidate left with no
   supported evidence is **rejected**. This is what makes "every finding links to real source
   evidence" enforceable rather than aspirational.
3. **Cluster** — merge candidates that share an explicit reference (RFI-042, CO-12, …) into one
   event; unreferenced candidates stay singletons. Similar-looking descriptions alone never merge.
4. **Reconcile** against the register (`reconcile.py`), two conservative passes:
   - **Explicit reference** match → `matched` (score 0.95).
   - **Text similarity** (Jaccard ≥ 0.2 *and* ≥ 2 shared non-stopword tokens) → `possible_match`
     (never a hard match) for reviewer confirmation.
   - Otherwise → `no_match_found` (or `no_match_found` immediately if the register is empty).
5. **Build findings** — merge evidence across a cluster (dedupe by chunk), tag the first as
   `primary`, and emit a `Finding` with `requires_human_review=True` always set.

The worker persists `pipeline_version` and `model_identifier` (`mock-extractor-v1` or
`openai:<model>`) on the run for auditability. The `pnpm eval` harness scores this pipeline against
`supabase/fixtures/synthetic-project/ground-truth-labels.json` (recall/precision, matched
accuracy, unsupported-claim and missing-citation counts).

### 7. Security & multi-tenancy

- **RLS everywhere** — `is_org_member(org)` (SECURITY DEFINER) gates select/insert/update/delete on
  every tenant table. A client-supplied `organization_id` is never trusted; membership is always
  re-derived from `auth.uid()`. Verified by `e2e/authz.spec.ts` (a second org gets 404 on the
  first org's project and report routes).
- **Private Storage** — the `documents` bucket is non-public; object paths are
  `{org}/{project}/{sha-prefix}-{name}` and policies authorize via `is_org_member()` on the first
  path segment. The browser only ever reaches files through the authed server.
- **Upload safety** — extension + content sniffing (PDF magic bytes, NUL check for text),
  per-file size limit, per-project quota, and sha256 dedupe.
- **Worker auth** — shared `WORKER_AUTH_SECRET` on all processor endpoints; the worker re-checks
  tenancy independently of the request.
- **Rate limiting** — in-memory sliding window on upload (30/60s) and audit-start (10/60s) per
  user. Per-process only (MVP); back with Redis for multi-instance.
- **Secrets** — service-role key, OpenAI key, and worker secret are server-only (never
  `NEXT_PUBLIC_`). See `docs/security.md`.

### 8. Configuration

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | client | Browser Supabase client (RLS-bound) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Worker DB access (bypasses RLS) |
| `DATABASE_URL` | server | Direct Postgres (migrations + worker `psycopg`) |
| `AI_MODE` | server | `mock` (offline default) or `live` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | server | Live extraction |
| `REDIS_URL` | server | RQ queue backend |
| `WORKER_AUTH_SECRET` | server | web ⇄ processor shared secret |
| `PROCESSOR_URL` | server | Base URL of the FastAPI service |
| `MAX_UPLOAD_MB` / `MAX_PROJECT_STORAGE_MB` | server | Upload + project quotas (15 / 100 default) |

See `docs/deployment.md` for the production runbook and `docs/product-decisions.md` for the
decision log.

## Prerequisites

- Node ≥ 20 and pnpm 11 (`corepack enable` or `npm i -g pnpm`)
- Docker + Docker Compose (for Redis and the processor worker)
- Supabase CLI — vendored as a dev dependency; run it with `pnpm exec supabase ...`

The Python worker runs in Docker, so a local Python 3.12 is **not** required.

## First-time setup

```bash
pnpm install                 # install JS workspace deps
cp .env.example .env         # local env (gitignored). Defaults use AI_MODE=mock, no keys needed.
```

For the web app's own env, copy the public Supabase values into `apps/web/.env.local` once the
local Supabase stack is running (Phase 2).

## Local development commands

```bash
# Web app (http://localhost:3000)
pnpm dev                     # runs apps/web

# Local infrastructure (Redis + processor + worker)
pnpm infra:up                # docker compose up -d
pnpm infra:down

# Supabase local stack (Postgres/Auth/Storage) — used from Phase 2 on
pnpm db:start                # supabase start
pnpm db:stop
pnpm db:reset                # re-apply migrations + seed

# Quality
pnpm --filter web typecheck
pnpm --filter web lint
pnpm format                  # Prettier write
```

## Tests

```bash
pnpm --filter web test                       # Vitest unit tests
pnpm --filter web test:e2e                   # Playwright (builds + serves the app)

# Processor (runs in Docker; no host Python needed)
docker build -t scopesignal-processor:dev services/processor
docker run --rm scopesignal-processor:dev pytest -q

# Synthetic evaluation (deterministic, mock adapter)
pnpm eval
```

## Demo / local auth procedure

With the Supabase stack running (`pnpm db:start`) and the web app running (`pnpm dev`):

1. Open http://localhost:3000 and click **Open app** (or go to `/login`).
2. Click **Sign up**, enter an organization name, email, and password (≥ 6 chars). Local Supabase
   has email confirmations disabled, so you're signed straight in. A signup trigger provisions
   your organization and owner membership automatically.
3. You land on `/dashboard`. Create a project via **New Project**.

To inspect auth emails locally, open Mailpit at http://127.0.0.1:54324.

## MVP acceptance — end-to-end workflow

All of the following work and are covered by automated tests:

1. Sign in ✓ · 2. Create organization/project ✓ · 3. Upload synthetic documents ✓ ·
4. Import the change-order register ✓ · 5. Start an audit ✓ · 6. A background worker processes it ✓ ·
7. Source-linked candidate events ✓ · 8. Register reconciliation ✓ · 9. Open original evidence ✓ ·
10. Record a review decision ✓ · 11. Export a PDF (and CSV) report ✓ · 12. A second org cannot
access the first org's records ✓ · 13. All automated tests pass ✓.

Guardrails held: no dead buttons, no fake API calls, no fabricated analysis or metrics, no
hardcoded success states, no credentials committed, every finding links to real source evidence,
and no change order is ever created or submitted.

## Current status (end of Phase 6)

The reviewer workflow (Phase 5) plus:

- **Report export**: per-audit **PDF** (ReportLab, in the processor — branded header, project
  identification, analysis scope, findings table, evidence appendix with citations, reviewer
  decisions/notes, and a prominent limitations statement) and machine-readable **CSV**, served via
  authenticated download routes under `/api/projects/[id]/audits/[auditId]/{pdf,csv}`.
- **Hardening**: in-memory **rate limiting** on upload and audit-start actions; **cross-tenant
  isolation** verified by an authorization E2E (a second org gets 404 on another org's project and
  report routes); deployment runbook in `docs/deployment.md`.

Tests: processor pytest (**31**), web Vitest (3), Playwright E2E (**7**) covering the full
acceptance workflow including report export and cross-tenant denial.

## Current status (end of Phase 5)

Everything from Phases 2–4, plus the reviewer workflow:

- **Three-pane review interface** on the audit results page — left: searchable, status-filterable
  findings list; center: candidate summary, source evidence excerpts, and register comparison;
  right: the decision panel.
- **Six reviewer outcomes** (Needs Review, Confirmed Unrecorded, Already Recorded, Not Additional
  Scope, Duplicate, Insufficient Evidence) distinguishable by icon + label (not color alone), plus
  reviewer notes. Decisions are revisable and record the acting user + timestamp (and an audit-log
  entry). The dashboard "Findings requiring review" count reflects them live.

Tests: processor pytest (27), web Vitest (3), Playwright E2E (6) covering signup → upload+parse →
register import → run audit → source-linked findings → **record a review decision (persisted)**.

Not yet built: **reports** (PDF/CSV export) and final hardening. See `docs/product-decisions.md`.

## Current status (end of Phase 4)

Works today: everything from Phases 2–3 (auth, RLS, project CRUD, dashboard, document upload +
parsing, register import), plus the core analysis:

- **AI analysis pipeline** (Python processor): candidate scope-change extraction → **citation
  validation** (rejects hallucinated chunk ids / excerpts) → event clustering (by explicit
  reference) → two-stage **register reconciliation** (deterministic references, then conservative
  text similarity) → findings. A deterministic **mock adapter** runs it fully offline; set
  `AI_MODE=live` + `OPENAI_API_KEY` for OpenAI structured-output extraction.
- **Durable audit worker** (RQ + Redis): the web enqueues an audit via the processor; the worker
  runs the pipeline and atomically persists `candidate_events`, `candidate_evidence`, and
  `candidate_register_matches`. Idempotent re-runs; `pipeline_version` + `model_identifier` recorded.
- **Audit UI**: Start Audit (duplicate-run guarded), auto-refreshing status, and an evidence-linked
  results view — each finding shows exact source excerpts and its register comparison.
- **Synthetic project + evaluation**: `supabase/fixtures/synthetic-project/` (fictional) plus a
  deterministic scorer. `pnpm eval` reports recall/precision, matched accuracy, and
  unsupported-claim / missing-citation counts (currently: 3/3 omissions, 3/3 recorded matched,
  0 false positives, 0 unsupported claims).

Tests: processor pytest (27, incl. parsers, pipeline, citation validation, eval thresholds),
web Vitest (3), Playwright E2E (6) covering signup → upload+parse → register import →
**run audit → source-linked findings**.

Not yet built (later phases): the reviewer **decision** workflow (mark outcomes, notes) and
**reports** (PDF/CSV export). See `docs/product-decisions.md`.

## Troubleshooting

**Docker keeps stopping / "fetch failed" / `ECONNREFUSED` to Supabase:** Docker Desktop's
auto-pause was set to 30s on this machine, which paused the VM (and Supabase/processor) during
idle gaps. It's now disabled (`autoPauseEnabled: false` in Docker Desktop settings). If it
recurs, check Docker Desktop → Settings → Resources → "Resource Saver", then
`pnpm exec supabase start` and `docker compose up -d redis processor`.

**Processor + worker must be running** for uploads/imports and audits:
`docker compose up -d redis processor worker` (processor health at
http://127.0.0.1:8000/health). Audits are processed by the `worker` container; if a run stays
`queued`, the worker isn't running.
