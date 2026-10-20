import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth';
import { AutoRefresh } from '../auto-refresh';

const RECON_BADGE: Record<string, { label: string; className: string }> = {
  matched: { label: 'Matched in register', className: 'bg-emerald-100 text-emerald-800' },
  possible_match: { label: 'Possible match', className: 'bg-amber-100 text-amber-900' },
  no_match_found: { label: 'No match found', className: 'bg-amber-100 text-amber-900' },
  insufficient_data: { label: 'Insufficient data', className: 'bg-slate-100 text-slate-700' },
};

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string; auditId: string }>;
}) {
  const { id, auditId } = await params;
  const { supabase } = await requireMembership();

  const { data: run } = await supabase
    .from('audit_runs')
    .select('id, status, created_at, completed_at, model_identifier, pipeline_version, error_message')
    .eq('id', auditId)
    .maybeSingle();
  if (!run) notFound();

  const { data: candidates } = await supabase
    .from('candidate_events')
    .select(
      `id, normalized_title, description, event_date, detected_parties, potential_change_type,
       extraction_confidence, reconciliation_status, review_status,
       candidate_evidence ( exact_excerpt, source_locator, evidence_role, documents ( original_filename ) ),
       candidate_register_matches ( matching_method, match_score, explanation,
         register_entries ( external_reference, title ) )`,
    )
    .eq('audit_run_id', auditId)
    .order('extraction_confidence', { ascending: false });

  const findings = candidates ?? [];
  const inProgress = run.status === 'queued' || run.status === 'processing';

  return (
    <div>
      {inProgress && <AutoRefresh />}
      <Link href={`/projects/${id}/audits`} className="text-sm text-signal hover:underline">
        ← Audits
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-navy">Audit results</h1>
      <p className="mt-1 text-sm text-ink">
        Status: <span className="font-medium text-navy">{run.status}</span>
        {run.model_identifier ? ` · ${run.model_identifier}` : ''}
        {run.pipeline_version ? ` · ${run.pipeline_version}` : ''}
      </p>

      {inProgress && (
        <div className="mt-6 rounded-lg border border-line bg-white p-8 text-center text-ink">
          Processing… this page updates automatically.
        </div>
      )}

      {run.status === 'failed' && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
          Audit failed: {run.error_message ?? 'unknown error'}
        </div>
      )}

      {run.status === 'completed' && findings.length === 0 && (
        <div className="mt-6 rounded-lg border border-line bg-white p-8 text-center text-ink">
          No potential scope-change events were identified in the supplied records.
        </div>
      )}

      {run.status === 'completed' && findings.length > 0 && (
        <>
          <p className="mt-6 text-sm text-ink">
            {findings.length} potential finding{findings.length === 1 ? '' : 's'}. Review decisions
            and notes are added in the review interface (next phase). Each finding below is backed by
            source evidence.
          </p>
          <ul className="mt-4 space-y-4">
            {findings.map((f) => {
              const badge = RECON_BADGE[f.reconciliation_status] ?? RECON_BADGE.insufficient_data;
              const evidence = (f.candidate_evidence ?? []) as unknown as Array<{
                exact_excerpt: string;
                source_locator: string | null;
                evidence_role: string;
                documents: { original_filename: string } | null;
              }>;
              const matches = (f.candidate_register_matches ?? []) as unknown as Array<{
                matching_method: string;
                match_score: number;
                explanation: string;
                register_entries: { external_reference: string | null; title: string | null } | null;
              }>;
              return (
                <li key={f.id} className="rounded-lg border border-line bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-navy">{f.normalized_title}</h2>
                      <p className="mt-0.5 text-xs text-ink">
                        {f.potential_change_type?.replace(/_/g, ' ')}
                        {f.event_date ? ` · ${f.event_date}` : ''}
                        {f.detected_parties?.length ? ` · ${f.detected_parties.join(', ')}` : ''}
                        {` · confidence ${(Number(f.extraction_confidence) * 100).toFixed(0)}%`}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink">Evidence</p>
                    <ul className="mt-1 space-y-2">
                      {evidence.map((e, i) => (
                        <li key={i} className="border-l-2 border-line pl-3">
                          <p className="text-sm text-ink">“{e.exact_excerpt}”</p>
                          <p className="mt-0.5 text-xs text-ink/70">
                            {e.documents?.original_filename ?? 'document'}
                            {e.source_locator ? ` · ${e.source_locator}` : ''}
                            {e.evidence_role === 'primary' ? ' · primary' : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink">
                      Register comparison
                    </p>
                    {matches.length === 0 ? (
                      <p className="mt-1 text-sm text-ink">
                        No corresponding entry identified in the supplied register. (This does not
                        establish the event was undocumented elsewhere.)
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {matches.map((m, i) => (
                          <li key={i} className="text-sm text-ink">
                            {m.register_entries?.external_reference ?? '—'}
                            {m.register_entries?.title ? ` · ${m.register_entries.title}` : ''} —{' '}
                            {m.explanation}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
