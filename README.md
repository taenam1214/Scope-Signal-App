# ScopeSignal

AI-assisted scope-change reconciliation for US commercial electrical subcontractors.

> Given project emails, RFIs, and a change-order register, identify potential scope-change events
> that are **not** clearly accounted for in the register, and show exactly which source records
> support each finding. ScopeSignal does not decide contractual entitlement, guarantee payment, or
> auto-submit change orders. Every finding links to real source evidence.

This repo is a monorepo built in phases. **Phases 1–3 complete** (repo & environment; auth +
data model; file ingestion). See `docs/architecture.md` for the full design and
`docs/product-decisions.md` for the roadmap.

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
```

## Demo / local auth procedure

With the Supabase stack running (`pnpm db:start`) and the web app running (`pnpm dev`):

1. Open http://localhost:3000 and click **Open app** (or go to `/login`).
2. Click **Sign up**, enter an organization name, email, and password (≥ 6 chars). Local Supabase
   has email confirmations disabled, so you're signed straight in. A signup trigger provisions
   your organization and owner membership automatically.
3. You land on `/dashboard`. Create a project via **New Project**.

To inspect auth emails locally, open Mailpit at http://127.0.0.1:54324.

## Current status (end of Phase 3)

Works today: everything from Phase 2 (auth, RLS tenant isolation, project CRUD, dashboard), plus:

- **Document manager** at `/projects/[id]/documents` — upload PDF/EML/TXT to **private** storage
  with server-side size, quota, content-sniffing validation, and sha256 dedupe.
- **Parsing pipeline** (Python processor): PDF via PyMuPDF (page-numbered chunks; scanned PDFs
  flagged `OCR required`), safe EML (headers + stripped body), TXT. Parsed passages are stored as
  source-linked `document_chunks`.
- **Change-order register import wizard** — upload a CSV, auto-detect column mapping, adjust it,
  preview normalized rows, and import to `register_entries` (originals + per-row errors preserved).
- Delete documents (storage + chunks cascade). Every action is written to the audit log.

Tests: processor pytest (16, incl. parsers + endpoints), web Vitest (3), Playwright E2E (5)
covering signup → project → **upload+parse** and **register import**.

Not yet built (later phases): the AI extraction/reconciliation pipeline, evidence-linked review
dashboard, and reports. See `docs/product-decisions.md`.

## Troubleshooting

**Docker keeps stopping / "fetch failed" / `ECONNREFUSED` to Supabase:** Docker Desktop's
auto-pause was set to 30s on this machine, which paused the VM (and Supabase/processor) during
idle gaps. It's now disabled (`autoPauseEnabled: false` in Docker Desktop settings). If it
recurs, check Docker Desktop → Settings → Resources → "Resource Saver", then
`pnpm exec supabase start` and `docker compose up -d redis processor`.

**Processor must be running** for uploads/imports: `docker compose up -d redis processor`
(health at http://127.0.0.1:8000/health).
