'use client';

import { useActionState } from 'react';
import { Play } from 'lucide-react';
import { startAudit, type StartAuditState } from './actions';

export function StartAuditButton({ projectId }: { projectId: string }) {
  const action = startAudit.bind(null, projectId);
  const [state, formAction, pending] = useActionState<StartAuditState, FormData>(action, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-600 disabled:opacity-60"
      >
        <Play className="h-4 w-4" aria-hidden />
        {pending ? 'Starting…' : 'Start Audit'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
