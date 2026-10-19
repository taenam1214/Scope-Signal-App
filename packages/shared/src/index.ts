/**
 * Shared domain constants for ScopeSignal.
 *
 * These enums are the single source of truth for the web app and mirror the
 * Pydantic schemas in `services/processor`. Keep the two in sync.
 */

/** Role of a user within an organization. */
export const ORG_ROLES = ['owner', 'member'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Lifecycle of a document's parse. */
export const PARSE_STATUSES = ['pending', 'processing', 'parsed', 'failed', 'ocr_required'] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

/** Lifecycle of an audit run. */
export const AUDIT_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'canceled',
] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

/** How a candidate event reconciles against the change-order register. */
export const RECONCILIATION_STATUSES = [
  'matched',
  'possible_match',
  'no_match_found',
  'insufficient_data',
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

/** Reviewer decision outcomes for a candidate finding. */
export const REVIEW_STATUSES = [
  'needs_review',
  'confirmed_unrecorded',
  'already_recorded',
  'not_additional_scope',
  'duplicate',
  'insufficient_evidence',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Accepted upload file types. */
export const DOCUMENT_FILE_TYPES = ['pdf', 'eml', 'csv', 'txt'] as const;
export type DocumentFileType = (typeof DOCUMENT_FILE_TYPES)[number];
