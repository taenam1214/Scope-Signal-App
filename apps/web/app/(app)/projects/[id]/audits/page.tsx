import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth';
import { StartAuditButton } from './start-button';
import { AutoRefresh } from './auto-refresh';

const AUDIT_BADGE: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  canceled: 'bg-slate-100 text-slate-700',
};

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : '—';
}

export default async function AuditsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMembership();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!project) notFound();

  const { data: runs } = await supabase
    .from('audit_runs')
    .select('id, status, created_at, started_at, completed_at, model_identifier')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  const list = runs ?? [];
  const hasActive = list.some((r) => r.status === 'queued' || r.status === 'processing');

  return (
    <div>
      {hasActive && <AutoRefresh />}
      <Link href={`/projects/${id}`} className="text-sm text-signal hover:underline">
        ← {project.name}
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Audits</h1>
          <p className="mt-1 text-ink">
            Each audit extracts potential scope-change events and reconciles them against the
            imported change-order register.
          </p>
        </div>
        <StartAuditButton projectId={id} />
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-white p-10 text-center text-ink">
          No audits yet. Upload documents, import your register, then start an audit.
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-white">
          {list.map((r) => (
            <li key={r.id}>
              <Link
                href={`/projects/${id}/audits/${r.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-surface"
              >
                <div>
                  <p className="font-medium text-navy">Audit {fmt(r.created_at)}</p>
                  <p className="text-xs text-ink">
                    {r.completed_at ? `Finished ${fmt(r.completed_at)}` : `Started ${fmt(r.started_at)}`}
                    {r.model_identifier ? ` · ${r.model_identifier}` : ''}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${AUDIT_BADGE[r.status] ?? AUDIT_BADGE.queued}`}
                >
                  {r.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
