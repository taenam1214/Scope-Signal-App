'use client';

import { useState, useTransition } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import {
  importRegister,
  previewRegister,
  renormalizeRegister,
  type RegisterPreview,
} from './actions';

const FIELDS: { key: string; label: string }[] = [
  { key: 'external_reference', label: 'CO number' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'submitted_date', label: 'Date' },
  { key: 'status', label: 'Status' },
  { key: 'amount', label: 'Amount' },
];

export function RegisterImport({
  projectId,
  importedCount,
}: {
  projectId: string;
  importedCount: number;
}) {
  const [preview, setPreview] = useState<RegisterPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function onUpload(formData: FormData) {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await previewRegister(projectId, undefined, formData);
      if (res?.error) setError(res.error);
      else if (res?.preview) {
        setPreview(res.preview);
        setMapping(res.preview.mapping);
      }
    });
  }

  function updatePreview() {
    if (!preview) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('token', preview.token);
      fd.set('mapping', JSON.stringify(mapping));
      const res = await renormalizeRegister(projectId, undefined, fd);
      if (res?.error) setError(res.error);
      else if (res?.preview) setPreview(res.preview);
    });
  }

  function commit() {
    if (!preview) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('token', preview.token);
      fd.set('mapping', JSON.stringify(mapping));
      const res = await importRegister(projectId, undefined, fd);
      if (res?.error) setError(res.error);
      else if (typeof res?.imported === 'number') {
        setDone(res.imported);
        setPreview(null);
      }
    });
  }

  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-signal" aria-hidden />
        <h2 className="font-semibold text-navy">Change-order register</h2>
      </div>
      <p className="mt-1 text-xs text-ink">
        {importedCount > 0
          ? `${importedCount} entries imported. Re-importing replaces them.`
          : 'Import your register CSV to reconcile against.'}
      </p>

      {!preview && (
        <form action={onUpload} className="mt-3 space-y-3">
          <input
            type="file"
            name="file"
            accept=".csv"
            required
            className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy hover:file:bg-line"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-signal px-3 py-2 text-sm font-medium text-white hover:bg-signal-600 disabled:opacity-60"
          >
            {pending ? 'Reading…' : 'Upload CSV'}
          </button>
        </form>
      )}

      {preview && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-navy">Map columns</p>
            <div className="space-y-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink">{f.label}</span>
                  <select
                    value={mapping[f.key] ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [f.key]: e.target.value || null }))
                    }
                    className="max-w-[9rem] rounded-md border border-line bg-white px-2 py-1 text-sm"
                  >
                    <option value="">—</option>
                    {preview.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={updatePreview}
              disabled={pending}
              className="mt-2 text-sm font-medium text-signal hover:underline disabled:opacity-60"
            >
              Update preview
            </button>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-navy">
              Preview ({preview.rowCount} rows)
            </p>
            <div className="max-h-56 overflow-auto rounded-md border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface text-ink">
                  <tr>
                    <th className="px-2 py-1">Ref</th>
                    <th className="px-2 py-1">Date</th>
                    <th className="px-2 py-1">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-2 py-1 text-navy">{r.external_reference ?? '—'}</td>
                      <td className="px-2 py-1 text-ink">{r.submitted_date ?? '—'}</td>
                      <td className="px-2 py-1 text-ink">
                        {r.amount != null ? r.amount.toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.some((r) => r.row_errors.length > 0) && (
              <p className="mt-1 text-xs text-amber-800">
                Some rows have unparsed dates/amounts; originals are preserved.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={commit}
              disabled={pending}
              className="flex-1 rounded-md bg-signal px-3 py-2 text-sm font-medium text-white hover:bg-signal-600 disabled:opacity-60"
            >
              {pending ? 'Importing…' : `Import ${preview.rowCount} entries`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
              className="rounded-md border border-line px-3 py-2 text-sm font-medium text-navy hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {done != null && (
        <p className="mt-3 text-sm text-emerald-700">Imported {done} register entries.</p>
      )}
    </div>
  );
}
