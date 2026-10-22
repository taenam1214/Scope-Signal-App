'use server';

import { revalidatePath } from 'next/cache';
import { requireMembership } from '@/lib/auth';
import { parseDocument, parseRegister, type RegisterRow } from '@/lib/processor';
import { rateLimit } from '@/lib/rate-limit';
import { UPLOAD_LIMITS, sha256Hex, validateUpload } from '@/lib/uploads';

export type UploadState = { error?: string; ok?: boolean } | undefined;

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/** Confirms the project belongs to the caller's org (RLS-scoped). Returns org id. */
async function assertProject(
  supabase: Awaited<ReturnType<typeof requireMembership>>['supabase'],
  orgId: string,
  projectId: string,
) {
  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (!data) throw new Error('Project not found.');
  return orgId;
}

export async function uploadDocument(
  projectId: string,
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const { membership, userId, supabase } = await requireMembership();
  const orgId = membership.organizationId;

  if (!rateLimit(`upload:${userId}`, 30, 60_000)) {
    return { error: 'Too many uploads. Please wait a moment and try again.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file to upload.' };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.length > UPLOAD_LIMITS.maxUploadBytes) {
    return { error: `File exceeds the ${process.env.MAX_UPLOAD_MB ?? 15} MB limit.` };
  }

  const validation = validateUpload(file.name, bytes);
  if (!validation.ok) return { error: validation.error };
  if (validation.fileType === 'csv') {
    return { error: 'Upload CSV files through the change-order register import.' };
  }
  const fileType = validation.fileType;

  await assertProject(supabase, orgId, projectId);

  // Per-project storage quota.
  const { data: existing } = await supabase
    .from('documents')
    .select('file_size, sha256')
    .eq('project_id', projectId);
  const usedBytes = (existing ?? []).reduce((sum, d) => sum + Number(d.file_size ?? 0), 0);
  if (usedBytes + bytes.length > UPLOAD_LIMITS.maxProjectBytes) {
    return { error: 'This project has reached its storage quota.' };
  }

  const sha256 = await sha256Hex(bytes);
  if ((existing ?? []).some((d) => d.sha256 === sha256)) {
    return { error: 'This file has already been uploaded to the project.' };
  }

  const storagePath = `${orgId}/${projectId}/${sha256.slice(0, 12)}-${sanitizeName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
  if (uploadError) {
    return { error: 'Could not store the file. Please try again.' };
  }

  const { data: doc, error: insertError } = await supabase
    .from('documents')
    .insert({
      organization_id: orgId,
      project_id: projectId,
      original_filename: file.name,
      file_type: fileType,
      mime_type: file.type || null,
      storage_path: storagePath,
      file_size: bytes.length,
      sha256,
      parse_status: 'processing',
      uploaded_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !doc) {
    await supabase.storage.from('documents').remove([storagePath]);
    return { error: 'Could not record the document.' };
  }

  // Parse via the stateless processor, then persist chunks + final status.
  try {
    const result = await parseDocument(fileType, bytes, file.name);

    if (result.parse_status === 'parsed' && result.chunks.length > 0) {
      const rows = result.chunks.map((c) => ({
        organization_id: orgId,
        project_id: projectId,
        document_id: doc.id,
        chunk_index: c.chunk_index,
        text: c.text,
        page_number: c.page_number,
        source_locator: c.source_locator,
        character_start: c.character_start,
        character_end: c.character_end,
      }));
      await supabase.from('document_chunks').insert(rows);
    }

    await supabase
      .from('documents')
      .update({ parse_status: result.parse_status, parse_error: result.parse_error })
      .eq('id', doc.id);
  } catch {
    await supabase
      .from('documents')
      .update({ parse_status: 'failed', parse_error: 'Parsing service unavailable.' })
      .eq('id', doc.id);
    return { error: 'Uploaded, but parsing failed. You can retry later.' };
  }

  await supabase.from('audit_logs').insert({
    organization_id: orgId,
    actor_user_id: userId,
    action: 'document.uploaded',
    resource_type: 'document',
    resource_id: doc.id,
    metadata: { filename: file.name, file_type: fileType },
  });

  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function deleteDocument(projectId: string, documentId: string): Promise<void> {
  const { membership, userId, supabase } = await requireMembership();

  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return;

  await supabase.storage.from('documents').remove([doc.storage_path]);
  // document_chunks cascade-delete via FK.
  await supabase.from('documents').delete().eq('id', documentId);

  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: userId,
    action: 'document.deleted',
    resource_type: 'document',
    resource_id: documentId,
  });

  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath(`/projects/${projectId}`);
}

// --- Change-order register import ------------------------------------------

export type RegisterPreview = {
  columns: string[];
  mapping: Record<string, string | null>;
  rows: RegisterRow[];
  rowCount: number;
  errors: string[];
  token: string; // storage path of the staged CSV, used on commit
};

export type PreviewState = { error?: string; preview?: RegisterPreview } | undefined;

/** Stage a CSV upload and return a normalized preview with a suggested mapping. */
export async function previewRegister(
  projectId: string,
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const { membership, userId, supabase } = await requireMembership();
  const orgId = membership.organizationId;

  if (!rateLimit(`upload:${userId}`, 30, 60_000)) {
    return { error: 'Too many uploads. Please wait a moment and try again.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a CSV file.' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > UPLOAD_LIMITS.maxUploadBytes) {
    return { error: `File exceeds the ${process.env.MAX_UPLOAD_MB ?? 15} MB limit.` };
  }
  const validation = validateUpload(file.name, bytes);
  if (!validation.ok || validation.fileType !== 'csv') {
    return { error: 'Please upload a .csv file.' };
  }

  await assertProject(supabase, orgId, projectId);

  let result;
  try {
    result = await parseRegister(bytes, file.name);
  } catch {
    return { error: 'Could not read the CSV. Is the processor running?' };
  }
  if (result.errors.length > 0 && result.row_count === 0) {
    return { error: result.errors[0] };
  }

  // Stage the raw CSV in storage so commit can re-read it with the final mapping.
  const sha256 = await sha256Hex(bytes);
  const storagePath = `${orgId}/${projectId}/register-${sha256.slice(0, 12)}-${sanitizeName(file.name)}`;
  await supabase.storage
    .from('documents')
    .upload(storagePath, bytes, { contentType: 'text/csv', upsert: true });

  return {
    preview: {
      columns: result.columns,
      mapping: result.detected_mapping,
      rows: result.rows,
      rowCount: result.row_count,
      errors: result.errors,
      token: storagePath,
    },
  };
}

/** Re-normalize a staged CSV with an adjusted mapping (updates the preview). */
export async function renormalizeRegister(
  projectId: string,
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const { membership, supabase } = await requireMembership();
  const orgId = membership.organizationId;

  const token = String(formData.get('token') ?? '');
  const mappingRaw = String(formData.get('mapping') ?? '{}');
  if (!token) return { error: 'Upload expired. Please re-upload the CSV.' };

  let mapping: Record<string, string | null>;
  try {
    mapping = JSON.parse(mappingRaw);
  } catch {
    return { error: 'Invalid column mapping.' };
  }

  await assertProject(supabase, orgId, projectId);

  const { data: blob, error: dlError } = await supabase.storage.from('documents').download(token);
  if (dlError || !blob) return { error: 'Staged file not found. Please re-upload.' };
  const bytes = new Uint8Array(await blob.arrayBuffer());

  let result;
  try {
    result = await parseRegister(bytes, 'register.csv', mapping);
  } catch {
    return { error: 'Could not process the CSV.' };
  }

  return {
    preview: {
      columns: result.columns,
      mapping: result.detected_mapping,
      rows: result.rows,
      rowCount: result.row_count,
      errors: result.errors,
      token,
    },
  };
}

export type ImportState = { error?: string; imported?: number } | undefined;

/** Commit the register import using the (possibly user-adjusted) column mapping. */
export async function importRegister(
  projectId: string,
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { membership, userId, supabase } = await requireMembership();
  const orgId = membership.organizationId;

  const token = String(formData.get('token') ?? '');
  const mappingRaw = String(formData.get('mapping') ?? '{}');
  if (!token) return { error: 'Upload expired. Please re-upload the CSV.' };

  let mapping: Record<string, string | null>;
  try {
    mapping = JSON.parse(mappingRaw);
  } catch {
    return { error: 'Invalid column mapping.' };
  }

  await assertProject(supabase, orgId, projectId);

  // Re-read the staged CSV and normalize with the final mapping.
  const { data: blob, error: dlError } = await supabase.storage.from('documents').download(token);
  if (dlError || !blob) return { error: 'Staged file not found. Please re-upload.' };
  const bytes = new Uint8Array(await blob.arrayBuffer());

  let result;
  try {
    result = await parseRegister(bytes, 'register.csv', mapping);
  } catch {
    return { error: 'Could not process the CSV.' };
  }

  // Record the CSV as a source document for provenance.
  const sha256 = await sha256Hex(bytes);
  const { data: sourceDoc } = await supabase
    .from('documents')
    .upsert(
      {
        organization_id: orgId,
        project_id: projectId,
        original_filename: 'change-order-register.csv',
        file_type: 'csv',
        mime_type: 'text/csv',
        storage_path: token,
        file_size: bytes.length,
        sha256,
        parse_status: 'parsed',
        uploaded_by: userId,
      },
      { onConflict: 'project_id,sha256' },
    )
    .select('id')
    .single();

  // Replace any prior register for this project (re-import is idempotent).
  await supabase.from('register_entries').delete().eq('project_id', projectId);

  const rows = result.rows.map((r) => ({
    organization_id: orgId,
    project_id: projectId,
    source_document_id: sourceDoc?.id ?? null,
    external_reference: r.external_reference,
    title: r.title,
    description: r.description,
    submitted_date: r.submitted_date,
    status: r.status,
    amount: r.amount,
    normalized_metadata: { raw: r.raw, row_errors: r.row_errors },
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('register_entries').insert(rows);
    if (insertError) return { error: 'Could not import register entries.' };
  }

  await supabase.from('audit_logs').insert({
    organization_id: orgId,
    actor_user_id: userId,
    action: 'register.imported',
    resource_type: 'project',
    resource_id: projectId,
    metadata: { entries: rows.length },
  });

  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath(`/projects/${projectId}`);
  return { imported: rows.length };
}
