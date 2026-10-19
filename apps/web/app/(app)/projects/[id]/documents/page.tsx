import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { requireMembership } from '@/lib/auth';
import { DocumentUploader } from './document-uploader';
import { RegisterImport } from './register-import';
import { deleteDocument } from './actions';

const PARSE_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-slate-100 text-slate-700' },
  processing: { label: 'Processing', className: 'bg-slate-100 text-slate-700' },
  parsed: { label: 'Parsed', className: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800' },
  ocr_required: { label: 'OCR required', className: 'bg-amber-100 text-amber-900' },
};

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMembership();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: documents }, { count: registerCount }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, original_filename, file_type, file_size, parse_status, parse_error, uploaded_at')
      .eq('project_id', id)
      .neq('file_type', 'csv')
      .order('uploaded_at', { ascending: false }),
    supabase.from('register_entries').select('id', { count: 'exact', head: true }).eq('project_id', id),
  ]);

  const docs = documents ?? [];

  return (
    <div>
      <Link href={`/projects/${id}`} className="text-sm text-signal hover:underline">
        ← {project.name}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-navy">Documents</h1>
      <p className="mt-1 text-ink">
        Upload project communications (PDF, EML, TXT). Files are stored privately and parsed into
        searchable, source-linked passages.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DocumentUploader projectId={id} maxUploadMb={Number(process.env.MAX_UPLOAD_MB ?? 15)} />

          <h2 className="mt-8 mb-3 text-lg font-semibold text-navy">Uploaded files</h2>
          {docs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-ink">
              No documents yet.
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-white">
              {docs.map((d) => {
                const badge = PARSE_LABEL[d.parse_status] ?? PARSE_LABEL.pending;
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-navy">{d.original_filename}</p>
                      <p className="text-xs text-ink">
                        {d.file_type.toUpperCase()} · {(Number(d.file_size) / 1024).toFixed(0)} KB
                      </p>
                      {d.parse_error && (
                        <p className="mt-1 text-xs text-amber-800">{d.parse_error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <form action={deleteDocument.bind(null, id, d.id)}>
                        <button
                          type="submit"
                          aria-label={`Delete ${d.original_filename}`}
                          className="rounded-md p-1.5 text-ink hover:bg-surface hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <RegisterImport projectId={id} importedCount={registerCount ?? 0} />
        </div>
      </div>
    </div>
  );
}
