import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth';
import { AutoRefresh } from '../auto-refresh';
import { REVIEW_BY_VALUE, type ReviewStatus } from '../review-config';
import { ReviewWorkspace, type Finding } from '../review-workspace';

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
       extraction_confidence, reconciliation_status, review_status, review_notes, reviewed_at,
       candidate_evidence ( exact_excerpt, source_locator, evidence_role, documents ( original_filename ) ),
       candidate_register_matches ( matching_method, match_score, explanation,
         register_entries ( external_reference, title ) )`,
    )
    .eq('audit_run_id', auditId)
    .order('extraction_confidence', { ascending: false });

  const inProgress = run.status === 'queued' || run.status === 'processing';

  const findings: Finding[] = (candidates ?? []).map((c) => {
    const evidenceRows = (c.candidate_evidence ?? []) as unknown as Array<{
      exact_excerpt: string;
      source_locator: string | null;
      evidence_role: string;
      documents: { original_filename: string } | null;
    }>;
    const matchRows = (c.candidate_register_matches ?? []) as unknown as Array<{
      matching_method: string;
      match_score: number;
      explanation: string;
      register_entries: { external_reference: string | null; title: string | null } | null;
    }>;
    return {
      id: c.id,
      normalized_title: c.normalized_title,
      description: c.description,
      event_date: c.event_date,
      detected_parties: c.detected_parties ?? [],
      potential_change_type: c.potential_change_type,
      extraction_confidence: Number(c.extraction_confidence ?? 0),
      reconciliation_status: c.reconciliation_status,
      review_status: c.review_status as ReviewStatus,
      review_notes: c.review_notes,
      reviewed_at: c.reviewed_at,
      evidence: evidenceRows.map((e) => ({
        exact_excerpt: e.exact_excerpt,
        source_locator: e.source_locator,
        evidence_role: e.evidence_role,
        filename: e.documents?.original_filename ?? 'document',
      })),
      matches: matchRows.map((m) => ({
        external_reference: m.register_entries?.external_reference ?? null,
        title: m.register_entries?.title ?? null,
        matching_method: m.matching_method,
        match_score: m.match_score,
        explanation: m.explanation,
      })),
    };
  });

  // Review-status summary counts.
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.review_status] = (acc[f.review_status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {inProgress && <AutoRefresh />}
      <Link href={`/projects/${id}/audits`} className="text-sm text-signal hover:underline">
        ← Audits
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Audit results</h1>
          <p className="mt-1 text-sm text-ink">
            Status: <span className="font-medium text-navy">{run.status}</span>
            {run.model_identifier ? ` · ${run.model_identifier}` : ''}
            {run.pipeline_version ? ` · ${run.pipeline_version}` : ''}
          </p>
        </div>
        {run.status === 'completed' && findings.length > 0 && (
          <Link
            href={`/projects/${id}/reports`}
            className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-surface"
          >
            Export report
          </Link>
        )}
      </div>

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
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(counts).map(([status, n]) => {
              const opt = REVIEW_BY_VALUE[status as ReviewStatus];
              return (
                <span
                  key={status}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${opt?.badge ?? 'bg-slate-100 text-slate-700'}`}
                >
                  {opt?.label ?? status}: {n}
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-ink">
            {findings.length} finding{findings.length === 1 ? '' : 's'}. Select one to review its
            evidence and record a decision. Nothing is confirmed without your review.
          </p>
          <div className="mt-4">
            <ReviewWorkspace projectId={id} findings={findings} />
          </div>
        </>
      )}
    </div>
  );
}
