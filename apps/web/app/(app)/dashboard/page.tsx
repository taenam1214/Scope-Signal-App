import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireMembership } from '@/lib/auth';

export default async function DashboardPage() {
  const { membership, supabase } = await requireMembership();
  const orgId = membership.organizationId;

  // Live counts (RLS-scoped to the user's org). No fabricated business metrics.
  const [projects, completedAudits, findingsToReview, recentProjects] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase
      .from('audit_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'completed'),
    supabase
      .from('candidate_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('review_status', 'needs_review'),
    supabase
      .from('projects')
      .select('id, name, trade, updated_at')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(5),
  ]);

  const stats = [
    { label: 'Total projects', value: projects.count ?? 0 },
    { label: 'Completed audits', value: completedAudits.count ?? 0 },
    { label: 'Findings requiring review', value: findingsToReview.count ?? 0 },
  ];
  const recent = recentProjects.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-600"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New Project
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-line bg-white p-5">
            <p className="text-sm text-ink">{s.label}</p>
            <p className="mt-2 text-3xl font-bold text-navy">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-navy">Recently analyzed projects</h2>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
            <p className="text-ink">No projects yet.</p>
            <Link
              href="/projects/new"
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-signal hover:underline"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create your first project
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {recent.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-surface"
                >
                  <span className="font-medium text-navy">{p.name}</span>
                  <span className="text-sm text-ink">{p.trade}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
