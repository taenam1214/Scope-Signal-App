-- Row Level Security for all tenant-owned tables.
-- Authorization derives from organization membership of the authenticated user.
-- A client-submitted organization_id is never trusted as proof of access: every
-- policy re-checks membership against auth.uid().

-- Membership check. SECURITY DEFINER so it bypasses RLS on organization_members
-- (prevents infinite recursion when that table's own policies call it).
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
  );
$$;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

-- Enable RLS everywhere.
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table projects enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table register_entries enable row level security;
alter table audit_runs enable row level security;
alter table candidate_events enable row level security;
alter table candidate_evidence enable row level security;
alter table candidate_register_matches enable row level security;
alter table audit_logs enable row level security;

-- organizations: members can read; creation handled by signup trigger / server.
create policy org_select on organizations
  for select to authenticated
  using (public.is_org_member(id));

-- organization_members: a user sees rows for orgs they belong to.
create policy org_members_select on organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));

-- projects: full CRUD for members of the owning org.
create policy projects_select on projects
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy projects_insert on projects
  for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy projects_update on projects
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy projects_delete on projects
  for delete to authenticated
  using (public.is_org_member(organization_id));

-- Generic member-scoped policies for the remaining tenant tables.
-- (Writes from the review UI are allowed to members; the worker uses the
-- service-role key and independently verifies ownership.)
do $$
declare
  t text;
begin
  foreach t in array array[
    'documents', 'document_chunks', 'register_entries', 'audit_runs',
    'candidate_events', 'candidate_evidence', 'candidate_register_matches', 'audit_logs'
  ]
  loop
    execute format(
      'create policy %1$s_select on %1$s for select to authenticated using (public.is_org_member(organization_id));',
      t
    );
    execute format(
      'create policy %1$s_insert on %1$s for insert to authenticated with check (public.is_org_member(organization_id));',
      t
    );
    execute format(
      'create policy %1$s_update on %1$s for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));',
      t
    );
    execute format(
      'create policy %1$s_delete on %1$s for delete to authenticated using (public.is_org_member(organization_id));',
      t
    );
  end loop;
end;
$$;
