import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Membership = {
  organizationId: string;
  organizationName: string;
  role: 'owner' | 'member';
};

/** Returns the authenticated user, or redirects to /login. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { user, supabase };
}

/**
 * Returns the user's primary organization membership (first org they belong to).
 * v0.1 assumes one org per user — the signup trigger creates exactly one.
 */
export async function requireMembership(): Promise<{
  membership: Membership;
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const { user, supabase } = await requireUser();

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    // A valid user with no org is an inconsistent state (trigger should prevent it).
    throw new Error('No organization found for the current user.');
  }

  const org = data.organizations as unknown as { name: string } | null;
  return {
    membership: {
      organizationId: data.organization_id,
      organizationName: org?.name ?? 'Organization',
      role: data.role,
    },
    userId: user.id,
    supabase,
  };
}
