# ScopeSignal — Product Decisions

A running log of decisions and their rationale. Newest first.

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
