import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Copy,
  HelpCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

export type ReviewStatus =
  | 'needs_review'
  | 'confirmed_unrecorded'
  | 'already_recorded'
  | 'not_additional_scope'
  | 'duplicate'
  | 'insufficient_evidence';

/** The six reviewer outcomes. Icons keep them distinguishable without color. */
export const REVIEW_OPTIONS: {
  value: ReviewStatus;
  label: string;
  description: string;
  icon: LucideIcon;
  badge: string;
}[] = [
  {
    value: 'needs_review',
    label: 'Needs Review',
    description: 'Not yet decided.',
    icon: AlertCircle,
    badge: 'bg-amber-100 text-amber-900',
  },
  {
    value: 'confirmed_unrecorded',
    label: 'Confirmed Unrecorded',
    description: 'A real potential omission not in the register.',
    icon: CheckCircle2,
    badge: 'bg-emerald-100 text-emerald-800',
  },
  {
    value: 'already_recorded',
    label: 'Already Recorded',
    description: 'This is captured by an existing change order.',
    icon: Archive,
    badge: 'bg-blue-100 text-blue-800',
  },
  {
    value: 'not_additional_scope',
    label: 'Not Additional Scope',
    description: 'Included in the base contract / no scope change.',
    icon: XCircle,
    badge: 'bg-slate-100 text-slate-700',
  },
  {
    value: 'duplicate',
    label: 'Duplicate',
    description: 'Duplicates another finding.',
    icon: Copy,
    badge: 'bg-slate-100 text-slate-700',
  },
  {
    value: 'insufficient_evidence',
    label: 'Insufficient Evidence',
    description: 'Not enough evidence to decide.',
    icon: HelpCircle,
    badge: 'bg-slate-100 text-slate-700',
  },
];

export const REVIEW_BY_VALUE = Object.fromEntries(
  REVIEW_OPTIONS.map((o) => [o.value, o]),
) as Record<ReviewStatus, (typeof REVIEW_OPTIONS)[number]>;

export const RECON_LABEL: Record<string, { label: string; className: string }> = {
  matched: { label: 'Matched in register', className: 'bg-emerald-100 text-emerald-800' },
  possible_match: { label: 'Possible match', className: 'bg-amber-100 text-amber-900' },
  no_match_found: { label: 'No match found', className: 'bg-amber-100 text-amber-900' },
  insufficient_data: { label: 'Insufficient data', className: 'bg-slate-100 text-slate-700' },
};
