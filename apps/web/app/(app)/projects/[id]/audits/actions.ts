'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMembership } from '@/lib/auth';
import { enqueueAudit } from '@/lib/processor';
import { rateLimit } from '@/lib/rate-limit';

// Mirrors REVIEW_STATUSES in packages/shared and the review_status enum.
const REVIEW_STATUSES = [
  'needs_review',
  'confirmed_unrecorded',
  'already_recorded',
  'not_additional_scope',
  'duplicate',
  'insufficient_evidence',
] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type SaveReviewResult =
  | { ok: true; reviewedAt: string; reviewerEmail: string }
  | { ok: false; error: string };

export async function saveReview(input: {
  projectId: string;
  candidateId: string;
  reviewStatus: ReviewStatus;
  notes: string;
}): Promise<SaveReviewResult> {
  if (!REVIEW_STATUSES.includes(input.reviewStatus)) {
    return { ok: false, error: 'Invalid review status.' };
  }
  if (input.notes.length > 5000) {
    return { ok: false, error: 'Notes are too long.' };
  }

  const { membership, userId, supabase } = await requireMembership();

  // RLS scopes the update to the user's org; also confirm the candidate belongs
  // to the named project before writing.
  const { data: candidate } = await supabase
    .from('candidate_events')
    .select('id, project_id')
    .eq('id', input.candidateId)
    .maybeSingle();
  if (!candidate || candidate.project_id !== input.projectId) {
    return { ok: false, error: 'Finding not found.' };
  }

  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('candidate_events')
    .update({
      review_status: input.reviewStatus,
      review_notes: input.notes || null,
      reviewed_by: userId,
      reviewed_at: reviewedAt,
    })
    .eq('id', input.candidateId);
  if (updateError) return { ok: false, error: 'Could not save your decision.' };

  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: userId,
    action: 'finding.reviewed',
    resource_type: 'candidate_event',
    resource_id: input.candidateId,
    metadata: { review_status: input.reviewStatus },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  revalidatePath(`/projects/${input.projectId}/audits`);
  return { ok: true, reviewedAt, reviewerEmail: user?.email ?? 'you' };
}

export type StartAuditState = { error?: string } | undefined;

export async function startAudit(
  projectId: string,
  _prev: StartAuditState,
  _formData: FormData,
): Promise<StartAuditState> {
  const { membership, userId, supabase } = await requireMembership();
  const orgId = membership.organizationId;

  if (!rateLimit(`audit:${userId}`, 10, 60_000)) {
    return { error: 'Too many audit requests. Please wait a moment and try again.' };
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return { error: 'Project not found.' };

  // Need at least one parsed document to analyze.
  const { count: parsedCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('parse_status', 'parsed')
    .neq('file_type', 'csv');
  if (!parsedCount) {
    return { error: 'Upload and parse at least one document before running an audit.' };
  }

  // Prevent duplicate concurrent runs (guards against rapid repeated clicks).
  const { data: active } = await supabase
    .from('audit_runs')
    .select('id')
    .eq('project_id', projectId)
    .in('status', ['queued', 'processing'])
    .limit(1)
    .maybeSingle();
  if (active) return { error: 'An audit is already running for this project.' };

  const { data: run, error: insertError } = await supabase
    .from('audit_runs')
    .insert({
      organization_id: orgId,
      project_id: projectId,
      status: 'queued',
      created_by: userId,
    })
    .select('id')
    .single();
  if (insertError || !run) return { error: 'Could not start the audit.' };

  try {
    await enqueueAudit(run.id);
  } catch {
    await supabase
      .from('audit_runs')
      .update({ status: 'failed', error_message: 'Could not enqueue job (is the worker running?)' })
      .eq('id', run.id);
    return { error: 'Could not reach the processing service. Is the worker running?' };
  }

  await supabase.from('audit_logs').insert({
    organization_id: orgId,
    actor_user_id: userId,
    action: 'audit.started',
    resource_type: 'audit_run',
    resource_id: run.id,
  });

  revalidatePath(`/projects/${projectId}/audits`);
  redirect(`/projects/${projectId}/audits/${run.id}`);
}
