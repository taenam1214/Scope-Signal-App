-- ScopeSignal core schema.
-- Tenant-owned tables all carry organization_id and are protected by RLS (see later migration).

-- ---------------------------------------------------------------------------
-- Enum types (kept in sync with packages/shared/src/index.ts)
-- ---------------------------------------------------------------------------
create type org_role as enum ('owner', 'member');
create type parse_status as enum ('pending', 'processing', 'parsed', 'failed', 'ocr_required');
create type audit_status as enum ('queued', 'processing', 'completed', 'failed', 'canceled');
create type reconciliation_status as enum (
  'matched', 'possible_match', 'no_match_found', 'insufficient_data'
);
create type review_status as enum (
  'needs_review', 'confirmed_unrecorded', 'already_recorded',
  'not_additional_scope', 'duplicate', 'insufficient_evidence'
);
create type document_file_type as enum ('pdf', 'eml', 'csv', 'txt');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizations & membership
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now()
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index idx_org_members_user on organization_members (user_id);
create index idx_org_members_org on organization_members (organization_id);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  reference_number text,
  trade text not null default 'Electrical',
  description text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_projects_org on projects (organization_id);
create trigger trg_projects_updated_at
  before update on projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Documents & chunks
-- ---------------------------------------------------------------------------
create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  original_filename text not null,
  file_type document_file_type not null,
  mime_type text,
  storage_path text not null,
  file_size bigint not null check (file_size >= 0),
  sha256 text,
  parse_status parse_status not null default 'pending',
  parse_error text,
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  -- Avoid duplicate ingestion of identical content within a project.
  unique (project_id, sha256)
);
create index idx_documents_project on documents (project_id);
create index idx_documents_org on documents (organization_id);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  chunk_index integer not null,
  text text not null,
  page_number integer,
  source_locator text,
  character_start integer,
  character_end integer,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index idx_chunks_document on document_chunks (document_id);
create index idx_chunks_project on document_chunks (project_id);

-- ---------------------------------------------------------------------------
-- Change-order register
-- ---------------------------------------------------------------------------
create table register_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  source_document_id uuid references documents (id) on delete set null,
  external_reference text,
  title text,
  description text,
  submitted_date date,
  status text,
  amount numeric(14, 2),
  normalized_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_register_project on register_entries (project_id);

-- ---------------------------------------------------------------------------
-- Audit runs
-- ---------------------------------------------------------------------------
create table audit_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  status audit_status not null default 'queued',
  pipeline_version text,
  model_identifier text,
  document_snapshot jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_audit_runs_project on audit_runs (project_id);

-- ---------------------------------------------------------------------------
-- Candidate events + evidence + register matches
-- ---------------------------------------------------------------------------
create table candidate_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  audit_run_id uuid not null references audit_runs (id) on delete cascade,
  normalized_title text not null,
  description text,
  event_date date,
  detected_parties text[] not null default '{}',
  potential_change_type text,
  extraction_confidence numeric(4, 3) check (extraction_confidence between 0 and 1),
  reconciliation_status reconciliation_status not null default 'insufficient_data',
  review_status review_status not null default 'needs_review',
  review_notes text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_candidates_audit on candidate_events (audit_run_id);
create index idx_candidates_project on candidate_events (project_id);

create table candidate_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  candidate_event_id uuid not null references candidate_events (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  chunk_id uuid references document_chunks (id) on delete set null,
  exact_excerpt text not null,
  source_locator text,
  evidence_role text
);
create index idx_evidence_candidate on candidate_evidence (candidate_event_id);

create table candidate_register_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  candidate_event_id uuid not null references candidate_events (id) on delete cascade,
  register_entry_id uuid not null references register_entries (id) on delete cascade,
  matching_method text not null,
  match_score numeric(4, 3) check (match_score between 0 and 1),
  explanation text
);
create index idx_matches_candidate on candidate_register_matches (candidate_event_id);

-- ---------------------------------------------------------------------------
-- Audit log (reviewer actions, uploads, audit lifecycle)
-- ---------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_org on audit_logs (organization_id, created_at desc);
