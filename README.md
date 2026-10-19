# ScopeSignal

AI-assisted scope-change reconciliation for US commercial electrical subcontractors.

> Given project emails, RFIs, and a change-order register, identify potential scope-change events
> that are **not** clearly accounted for in the register, and show exactly which source records
> support each finding. ScopeSignal does not decide contractual entitlement, guarantee payment, or
> auto-submit change orders. Every finding links to real source evidence.

This repo is a monorepo built in phases. **Phase 1 (repo & environment) is complete.** See
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
```

## Current status (end of Phase 1)

Works today: web app boots with the ScopeSignal brand system (landing + placeholder dashboard),
unit + E2E smoke tests, processor FastAPI `/health` with passing pytest, Redis + worker via
Compose, Supabase scaffold, and project docs.

Not yet built (later phases): auth, database schema/RLS, uploads & parsing, the AI pipeline,
review dashboard, and reports. See `docs/product-decisions.md`.
