'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMembership } from '@/lib/auth';
import { enqueueAudit } from '@/lib/processor';

export type StartAuditState = { error?: string } | undefined;

export async function startAudit(
  projectId: string,
  _prev: StartAuditState,
  _formData: FormData,
): Promise<StartAuditState> {
  const { membership, userId, supabase } = await requireMembership();
  const orgId = membership.organizationId;

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
