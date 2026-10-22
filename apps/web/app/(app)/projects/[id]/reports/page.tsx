import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import { requireMembership } from '@/lib/auth';

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMembership();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: runs }, { data: candidates }] = await Promise.all([
    supabase
      .from('audit_runs')
      .select('id, created_at, completed_at')
      .eq('project_id', id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false }),
    supabase.from('candidate_events').select('audit_run_id, review_status').eq('project_id', id),
  ]);

  const byRun = new Map<string, { total: number; reviewed: number }>();
  for (const c of candidates ?? []) {
    const e = byRun.get(c.audit_run_id) ?? { total: 0, reviewed: 0 };
    e.total += 1;
    if (c.review_status !== 'needs_review') e.reviewed += 1;
    byRun.set(c.audit_run_id, e);
  }

  const list = runs ?? [];

  return (
    <div>
      <Link href={`/projects/${id}`} className="text-sm text-signal hover:underline">
        ← {project.name}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-navy">Reports</h1>
      <p className="mt-1 text-ink">
        Export a completed audit as PDF or CSV. Reports include findings, supporting citations,
        register comparisons, reviewer decisions, and the limitations statement.
      </p>

      {list.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-white p-10 text-center text-ink">
          No completed audits yet.
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-white">
          {list.map((r) => {
            const counts = byRun.get(r.id) ?? { total: 0, reviewed: 0 };
            const when = r.completed_at ?? r.created_at;
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-medium text-navy">Audit {new Date(when).toLocaleString()}</p>
                  <p className="text-xs text-ink">
                    {counts.total} finding{counts.total === 1 ? '' : 's'} · {counts.reviewed}{' '}
                    reviewed
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/projects/${id}/audits/${r.id}/pdf`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-600"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    PDF
                  </a>
                  <a
                    href={`/api/projects/${id}/audits/${r.id}/csv`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-navy hover:bg-surface"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    CSV
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
