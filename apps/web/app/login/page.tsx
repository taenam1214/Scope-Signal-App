'use client';

import { Suspense, useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Radar } from 'lucide-react';
import { signIn, signUp, type AuthState } from './actions';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard';

  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, undefined);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 font-semibold text-navy">
          <Radar className="h-6 w-6 text-signal" aria-hidden />
          ScopeSignal
        </div>

        <div className="rounded-lg border border-line bg-white p-6">
          <h1 className="text-xl font-bold text-navy">
            {mode === 'signin' ? 'Sign in' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-ink">
            {mode === 'signin'
              ? 'Access your projects and audits.'
              : 'A new organization will be created for you.'}
          </p>

          <form action={formAction} className="mt-5 space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />

            {mode === 'signup' && (
              <Field
                label="Organization name"
                name="organizationName"
                type="text"
                placeholder="Acme Electric"
                required
              />
            )}
            <Field label="Email" name="email" type="email" placeholder="you@company.com" required />
            <Field
              label="Password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
            />

            {state?.error && (
              <p role="alert" className="text-sm text-red-600">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-600 disabled:opacity-60"
            >
              {pending ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-ink">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="font-medium text-signal hover:underline"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-1 focus:ring-signal"
      />
    </label>
  );
}
