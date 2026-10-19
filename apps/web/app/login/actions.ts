'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  organizationName: z.string().trim().max(200).optional(),
  redirectTo: z.string().optional(),
});

export type AuthState = { error: string } | undefined;

function safeRedirectPath(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : '';
  // Only allow in-app relative paths to avoid open redirects.
  return path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard';
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    redirectTo: formData.get('redirectTo'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: 'Invalid email or password.' };

  redirect(safeRedirectPath(formData.get('redirectTo')));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    organizationName: formData.get('organizationName'),
    redirectTo: formData.get('redirectTo'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: parsed.data.organizationName
        ? { organization_name: parsed.data.organizationName }
        : undefined,
    },
  });
  if (error) return { error: error.message };

  redirect(safeRedirectPath(formData.get('redirectTo')));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
