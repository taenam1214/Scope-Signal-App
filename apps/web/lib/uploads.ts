/**
 * Server-side upload configuration and file-type validation.
 * Validation goes beyond the file extension by sniffing content.
 */

export const UPLOAD_LIMITS = {
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024,
  maxProjectBytes: Number(process.env.MAX_PROJECT_STORAGE_MB ?? 100) * 1024 * 1024,
};

export type DocumentFileType = 'pdf' | 'eml' | 'csv' | 'txt';

const EXTENSIONS: Record<string, DocumentFileType> = {
  pdf: 'pdf',
  eml: 'eml',
  csv: 'csv',
  txt: 'txt',
};

/** True if the bytes contain no NUL in the first chunk (a cheap "is this text?" check). */
function looksTextual(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8192);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return false;
  }
  return true;
}

export type ValidationResult =
  | { ok: true; fileType: DocumentFileType }
  | { ok: false; error: string };

/**
 * Validates an uploaded file by extension AND content. Returns the canonical
 * file type or an error explaining why the file was rejected.
 */
export function validateUpload(filename: string, bytes: Uint8Array): ValidationResult {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const declared = EXTENSIONS[ext];
  if (!declared) {
    return { ok: false, error: 'Unsupported file type. Allowed: PDF, EML, CSV, TXT.' };
  }
  if (bytes.length === 0) {
    return { ok: false, error: 'File is empty.' };
  }

  // Content sniffing.
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 5));
  if (declared === 'pdf') {
    if (!header.startsWith('%PDF-')) {
      return { ok: false, error: 'File does not look like a valid PDF.' };
    }
    return { ok: true, fileType: 'pdf' };
  }

  // eml / csv / txt must be textual (no binary NULs).
  if (!looksTextual(bytes)) {
    return { ok: false, error: 'File appears to be binary, not text.' };
  }
  return { ok: true, fileType: declared };
}

/** SHA-256 hex digest of the bytes (for dedupe + provenance). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', buf as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
