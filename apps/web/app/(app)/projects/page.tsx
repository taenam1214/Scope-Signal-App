import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireMembership } from '@/lib/auth';

export default async function ProjectsPage() {
  const { membership, supabase } = await requireMembership();

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, reference_number, trade, updated_at')
    .eq('organization_id', membership.organizationId)
    .order('updated_at', { ascending: false });

  const list = projects ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Projects</h1>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-600"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New Project
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-white p-10 text-center">
          <p className="text-ink">No projects yet. Create one to start uploading records.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-white">
          {list.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-surface"
              >
                <div>
                  <p className="font-medium text-navy">{p.name}</p>
                  {p.reference_number && (
                    <p className="text-sm text-ink">Ref: {p.reference_number}</p>
                  )}
                </div>
                <span className="text-sm text-ink">{p.trade}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
