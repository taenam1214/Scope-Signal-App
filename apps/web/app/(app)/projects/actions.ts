'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMembership } from '@/lib/auth';

const projectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(200),
  referenceNumber: z.string().trim().max(100).optional(),
  trade: z.string().trim().min(1).max(100).default('Electrical'),
  description: z.string().trim().max(5000).optional(),
  startDate: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date.'),
});

export type ProjectFormState = { error: string } | undefined;

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = projectSchema.safeParse({
    name: formData.get('name'),
    referenceNumber: formData.get('referenceNumber') || undefined,
    trade: formData.get('trade') || undefined,
    description: formData.get('description') || undefined,
    startDate: formData.get('startDate') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { membership, userId, supabase } = await requireMembership();

  const { data, error } = await supabase
    .from('projects')
    .insert({
      organization_id: membership.organizationId,
      name: parsed.data.name,
      reference_number: parsed.data.referenceNumber ?? null,
      trade: parsed.data.trade,
      description: parsed.data.description ?? null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: 'Could not create project. Please try again.' };
  }

  // Record the action in the audit trail.
  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: userId,
    action: 'project.created',
    resource_type: 'project',
    resource_id: data.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath('/projects');
  revalidatePath('/dashboard');
  redirect(`/projects/${data.id}`);
}
