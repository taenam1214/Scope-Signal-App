-- Private storage for uploaded documents.
-- Object path convention: {organization_id}/{project_id}/{filename}
-- Access is granted only to members of the organization in the first path segment,
-- enforced by the same is_org_member() check used for table RLS.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy "documents_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy "documents_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );
