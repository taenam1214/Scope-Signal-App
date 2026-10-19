import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireMembership();

  // RLS scopes this to the user's org; a project in another org returns null → 404.
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, reference_number, trade, description, created_at')
    .eq('id', id)
    .maybeSingle();

  if (!project) notFound();

  const [{ count: documentCount }, { count: registerCount }, { data: audits }] = await Promise.all([
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase
      .from('register_entries')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id),
    supabase
      .from('audit_runs')
      .select('id, status, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return (
    <div>
      <Link href="/projects" className="text-sm text-signal hover:underline">
        ← Projects
      </Link>
      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">{project.name}</h1>
          <p className="mt-1 text-sm text-ink">
            {project.trade}
            {project.reference_number ? ` · Ref ${project.reference_number}` : ''}
          </p>
        </div>
      </div>

      {project.description && <p className="mt-4 max-w-2xl text-ink">{project.description}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Uploaded files" value={documentCount ?? 0} />
        <Stat label="Register entries" value={registerCount ?? 0} />
        <Stat label="Audits" value={audits?.length ?? 0} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/projects/${id}/documents`}
          className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-navy hover:bg-surface"
        >
          Manage documents
        </Link>
        <Link
          href={`/projects/${id}/audits`}
          className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-navy hover:bg-surface"
        >
          View audits
        </Link>
      </div>

      <p className="mt-8 text-sm text-ink">
        Document upload, register import, and audits become available in the next phases.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <p className="text-sm text-ink">{label}</p>
      <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
    </div>
  );
}
