# ScopeSignal

AI-assisted scope-change reconciliation for US commercial electrical subcontractors.

> Given project emails, RFIs, and a change-order register, identify potential scope-change events
> that are **not** clearly accounted for in the register, and show exactly which source records
> support each finding. ScopeSignal does not decide contractual entitlement, guarantee payment, or
> auto-submit change orders. Every finding links to real source evidence.

This repo is a monorepo built in phases. **Phases 1–5 complete** (repo & environment; auth +
data model; file ingestion; AI analysis & reconciliation; review dashboard). See
`docs/architecture.md` for the full design and `docs/product-decisions.md` for the roadmap.

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
