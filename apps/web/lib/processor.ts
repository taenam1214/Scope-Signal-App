/**
 * Server-only client for the ScopeSignal processor service.
 * The worker secret authenticates the web app to the processor and must never
 * reach the browser.
 */
import 'server-only';

const PROCESSOR_URL = process.env.PROCESSOR_URL ?? 'http://127.0.0.1:8000';
const WORKER_AUTH_SECRET = process.env.WORKER_AUTH_SECRET ?? '';

export type ParsedChunk = {
  chunk_index: number;
  text: string;
  page_number: number | null;
  source_locator: string | null;
  character_start: number | null;
  character_end: number | null;
};

export type DocumentParseResult = {
  parse_status: 'parsed' | 'failed' | 'ocr_required';
  parse_error: string | null;
  metadata: Record<string, unknown>;
  chunks: ParsedChunk[];
};

export type RegisterRow = {
  external_reference: string | null;
  title: string | null;
  description: string | null;
  submitted_date: string | null;
  status: string | null;
  amount: number | null;
  raw: Record<string, string>;
  row_errors: string[];
};

export type RegisterParseResult = {
  columns: string[];
  detected_mapping: Record<string, string | null>;
  rows: RegisterRow[];
  row_count: number;
  errors: string[];
};

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const resp = await fetch(`${PROCESSOR_URL}${path}`, {
    method: 'POST',
    headers: { 'X-Worker-Auth': WORKER_AUTH_SECRET },
    body: form,
    cache: 'no-store',
  });
  if (!resp.ok) {
    throw new Error(`Processor error ${resp.status} on ${path}`);
  }
  return (await resp.json()) as T;
}

export async function parseDocument(
  fileType: string,
  bytes: Uint8Array,
  filename: string,
): Promise<DocumentParseResult> {
  const form = new FormData();
  form.append('file_type', fileType);
  form.append('file', new Blob([bytes as BlobPart]), filename);
  return postForm<DocumentParseResult>('/parse/document', form);
}

export async function parseRegister(
  bytes: Uint8Array,
  filename: string,
  mapping?: Record<string, string | null>,
): Promise<RegisterParseResult> {
  const form = new FormData();
  form.append('file', new Blob([bytes as BlobPart]), filename);
  if (mapping) form.append('mapping', JSON.stringify(mapping));
  return postForm<RegisterParseResult>('/parse/register', form);
}

/** Enqueue a durable audit job on the processor; the RQ worker runs it. */
export async function enqueueAudit(auditRunId: string): Promise<{ job_id: string }> {
  const resp = await fetch(`${PROCESSOR_URL}/audits/enqueue`, {
    method: 'POST',
    headers: {
      'X-Worker-Auth': WORKER_AUTH_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ audit_run_id: auditRunId }),
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`Processor enqueue failed (${resp.status})`);
  return (await resp.json()) as { job_id: string };
}
