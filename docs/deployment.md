# ScopeSignal — Deployment

> Do not change DNS or deploy to production without explicit approval. This document records the
> steps; it does not execute them.

## Targets

| Piece            | Host                          | Domain                  |
| ---------------- | ----------------------------- | ----------------------- |
| Marketing site   | (existing, separate)          | `scope-signal.com`      |
| Application      | Vercel                        | `app.scope-signal.com`  |
| DB / Auth / Storage | Supabase (hosted project)  | —                       |
| Processor + worker | Container host (Fly.io / Render / Railway / ECS) | — |
| Queue            | Managed Redis (Upstash / provider) | —                  |

## Environments

Keep separate dev and production configurations. Never deploy with development bypasses or
`AI_MODE=mock` in production (unless intentionally running a no-AI demo).

## Order of operations

1. Create the hosted Supabase project; copy URL + anon + service-role keys.
2. Apply migrations: `supabase link --project-ref <ref>` then `supabase db push`.
3. Provision managed Redis; note its URL.
4. Deploy the processor image to the container host; set server-only env vars
   (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `REDIS_URL`, `WORKER_AUTH_SECRET`). Run one API
   container and one `rq worker audits` container.
5. Deploy `apps/web` to Vercel; set env vars (public Supabase vars + server-only secrets). Point
   `PROCESSOR_URL` at the deployed processor.
6. Configure Supabase Auth redirect URLs to `https://app.scope-signal.com`.
7. **DNS (manual):** add the CNAME/A records Vercel provides for `app.scope-signal.com`. Use the
   exact values from the Vercel dashboard — they are not known ahead of time. Enable HTTPS.
8. Run smoke tests against the deployed app before announcing.

## Required secrets checklist

See `.env.example`. Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `OPENAI_API_KEY`,
`WORKER_AUTH_SECRET`.

## Production notes

- The **worker** (`rq worker audits`) must run as its own container alongside the API; set its
  `DATABASE_URL` to the hosted Supabase Postgres connection string (not `host.docker.internal`).
- Rate limiting is **in-memory / per-process**. If you run more than one web instance, move it to
  managed Redis so limits are shared.
- Set `AI_MODE=live` + `OPENAI_API_KEY` for real extraction; leave `mock` for a no-API demo.
- Do not deploy with development bypasses; keep the service-role key and `OPENAI_API_KEY` server-side only.
