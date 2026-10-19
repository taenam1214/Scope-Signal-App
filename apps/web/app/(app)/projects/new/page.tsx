'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { createProject, type ProjectFormState } from '../actions';

export default function NewProjectPage() {
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    createProject,
    undefined,
  );

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/projects" className="text-sm text-signal hover:underline">
        ← Projects
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-navy">New project</h1>

      <form action={formAction} className="mt-6 space-y-4 rounded-lg border border-line bg-white p-6">
        <Field label="Project name" name="name" required placeholder="Westside Office Renovation" />
        <Field label="Reference number" name="referenceNumber" placeholder="Optional" />
        <Field label="Trade" name="trade" defaultValue="Electrical" />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy">Description</span>
          <textarea
            name="description"
            rows={3}
            placeholder="Optional"
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-1 focus:ring-signal"
          />
        </label>
        <Field label="Start date" name="startDate" type="date" />

        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-600 disabled:opacity-60"
          >
            {pending ? 'Creating…' : 'Create project'}
          </button>
          <Link
            href="/projects"
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-navy hover:bg-surface"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-1 focus:ring-signal"
      />
    </label>
  );
}
