import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ReportPayload = {
  project_name: string;
  project_reference: string | null;
  trade: string | null;
  audit_date: string;
  model_identifier: string | null;
  pipeline_version: string | null;
  documents: string[];
  register_count: number;
  findings: {
    title: string;
    change_type: string | null;
    event_date: string | null;
    parties: string[];
    reconciliation_status: string;
    review_status: string;
    review_notes: string | null;
    evidence: {
      filename: string;
      source_locator: string | null;
      exact_excerpt: string;
      evidence_role: string;
    }[];
    matches: { external_reference: string | null; title: string | null; explanation: string }[];
  }[];
};

/**
 * Assembles the report payload for an audit under the caller's RLS session.
 * Returns null if the project/audit isn't visible to the user (→ 404).
 */
export async function getReportData(
  supabase: SupabaseClient,
  projectId: string,
  auditId: string,
): Promise<{ payload: ReportPayload; project: { name: string } } | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('name, reference_number, trade')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return null;

  const { data: run } = await supabase
    .from('audit_runs')
    .select('id, project_id, status, completed_at, created_at, model_identifier, pipeline_version')
    .eq('id', auditId)
    .maybeSingle();
  if (!run || run.project_id !== projectId) return null;

  const [{ data: candidates }, { data: documents }, { count: registerCount }] = await Promise.all([
    supabase
      .from('candidate_events')
      .select(
        `normalized_title, potential_change_type, event_date, detected_parties,
         reconciliation_status, review_status, review_notes, extraction_confidence,
         candidate_evidence ( exact_excerpt, source_locator, evidence_role, documents ( original_filename ) ),
         candidate_register_matches ( explanation, register_entries ( external_reference, title ) )`,
      )
      .eq('audit_run_id', auditId)
      .order('extraction_confidence', { ascending: false }),
    supabase
      .from('documents')
      .select('original_filename')
      .eq('project_id', projectId)
      .neq('file_type', 'csv'),
    supabase.from('register_entries').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ]);

  const findings = (candidates ?? []).map((c) => {
    const ev = (c.candidate_evidence ?? []) as unknown as Array<{
      exact_excerpt: string;
      source_locator: string | null;
      evidence_role: string;
      documents: { original_filename: string } | null;
    }>;
    const ma = (c.candidate_register_matches ?? []) as unknown as Array<{
      explanation: string;
      register_entries: { external_reference: string | null; title: string | null } | null;
    }>;
    return {
      title: c.normalized_title,
      change_type: c.potential_change_type,
      event_date: c.event_date,
      parties: c.detected_parties ?? [],
      reconciliation_status: c.reconciliation_status,
      review_status: c.review_status,
      review_notes: c.review_notes,
      evidence: ev.map((e) => ({
        filename: e.documents?.original_filename ?? 'document',
        source_locator: e.source_locator,
        exact_excerpt: e.exact_excerpt,
        evidence_role: e.evidence_role,
      })),
      matches: ma.map((m) => ({
        external_reference: m.register_entries?.external_reference ?? null,
        title: m.register_entries?.title ?? null,
        explanation: m.explanation,
      })),
    };
  });

  return {
    project: { name: project.name },
    payload: {
      project_name: project.name,
      project_reference: project.reference_number,
      trade: project.trade,
      audit_date: new Date(run.completed_at ?? run.created_at).toISOString().slice(0, 10),
      model_identifier: run.model_identifier,
      pipeline_version: run.pipeline_version,
      documents: (documents ?? []).map((d) => d.original_filename),
      register_count: registerCount ?? 0,
      findings,
    },
  };
}
