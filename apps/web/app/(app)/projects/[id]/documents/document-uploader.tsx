'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Upload } from 'lucide-react';
import { uploadDocument, type UploadState } from './actions';

export function DocumentUploader({
  projectId,
  maxUploadMb,
}: {
  projectId: string;
  maxUploadMb: number;
}) {
  const action = uploadDocument.bind(null, projectId);
  const [state, formAction, pending] = useActionState<UploadState, FormData>(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="rounded-lg border border-line bg-white p-5">
      <label className="block text-sm font-medium text-navy">Upload a document</label>
      <p className="mt-1 text-xs text-ink">PDF, EML, or TXT · up to {maxUploadMb} MB</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".pdf,.eml,.txt"
          required
          className="block text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy hover:file:bg-line"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-600 disabled:opacity-60"
        >
          <Upload className="h-4 w-4" aria-hidden />
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="mt-3 text-sm text-emerald-700">Uploaded and parsed.</p>}
    </form>
  );
}
