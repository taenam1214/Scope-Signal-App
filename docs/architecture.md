# ScopeSignal — Architecture

## Purpose

ScopeSignal ingests authorized construction project records (emails, RFIs, PDFs) plus a
change-order register, uses AI to extract **potential** scope-change events, reconciles them
against the register, and gives a project manager an evidence-linked review and reporting
workflow. Every finding must trace back to actual source text.

## System overview

```
                 ┌─────────────────────────┐
  Browser  ◄────►│  apps/web (Next.js 16)   │  Auth-gated UI, server actions,
                 │  App Router, TS strict    │  signed-URL file access
                 └───────┬─────────┬────────┘
                         │         │
          Supabase JS    │         │  enqueue audit (HTTP, WORKER_AUTH_SECRET)
                         ▼         ▼
     ┌───────────────────────┐   ┌──────────────────────────────┐
     │ Supabase              │   │ services/processor (FastAPI)  │
     │  Postgres + RLS       │◄──┤  + RQ worker (Python 3.12)    │
     │  Auth                 │   │  parsers / extraction /       │
     │  private Storage      │   │  reconciliation / reports     │
     └───────────────────────┘   └───────────┬──────────────────┘
                                              │
                                      ┌───────▼────────┐
                                      │ Redis (RQ)     │
                                      └────────────────┘
                                              │
                                   ┌──────────▼───────────┐
                                   │ OpenAI (live mode) OR │
                                   │ deterministic mock    │
                                   │ adapter (AI_MODE)     │
                                   └───────────────────────┘
```

## Components

- **apps/web** — Next.js 16 (App Router, TS strict, Tailwind v4, shadcn/ui, Lucide). Owns auth,
  tenant-scoped UI, uploads to private Storage, and enqueues audits. Never holds the service-role
  key or OpenAI key in client code.
- **services/processor** — Python 3.12 FastAPI app + RQ worker. Runs document parsing and the AI
  pipeline outside the web request path (long-running). Independently verifies tenant/project
  ownership before reading or writing data.
- **packages/shared** — TypeScript source of truth for domain enums (review/reconciliation
  statuses, etc.), mirrored by the processor's Pydantic schemas.
- **supabase** — Postgres (migrations + RLS), Auth, private Storage. Run locally via the Supabase
  CLI; the same schema deploys to a hosted Supabase project in production.
- **Redis** — durable RQ job queue for audits (safe retries, idempotent jobs).

## Why a separate worker

Document processing and multi-file AI analysis exceed a normal web-request budget, so audits run
asynchronously in a container worker, not in Vercel request handlers. The web app enqueues a job
and polls/subscribes for status.

## AI mode

`AI_MODE=mock` uses a deterministic offline adapter (no network, reproducible) so the full
workflow runs and tests without any API key. `AI_MODE=live` with `OPENAI_API_KEY` calls OpenAI
with structured outputs. The model id is configurable via `OPENAI_MODEL`.

## Build phases

1. Repo & environment (done) · 2. Auth & data model · 3. File ingestion · 4. AI & reconciliation
· 5. Review dashboard · 6. Reports & hardening.
