import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReportData } from '@/lib/report-data';

const REVIEW_LABELS: Record<string, string> = {
  needs_review: 'Needs Review',
  confirmed_unrecorded: 'Confirmed Unrecorded',
  already_recorded: 'Already Recorded',
  not_additional_scope: 'Not Additional Scope',
  duplicate: 'Duplicate',
  insufficient_evidence: 'Insufficient Evidence',
};

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; auditId: string }> },
) {
  const { id, auditId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const data = await getReportData(supabase, id, auditId);
  if (!data) return new Response('Not found', { status: 404 });

  const header = [
    'title',
    'change_type',
    'event_date',
    'parties',
    'reconciliation_status',
    'reviewer_decision',
    'reviewer_notes',
    'primary_evidence',
    'source_file',
    'source_locator',
    'register_matches',
  ];
  const lines = [header.join(',')];

  for (const f of data.payload.findings) {
    const primary = f.evidence.find((e) => e.evidence_role === 'primary') ?? f.evidence[0];
    const matches = f.matches
      .map((m) => `${m.external_reference ?? '—'}: ${m.explanation}`)
      .join(' | ');
    lines.push(
      [
        f.title,
        f.change_type ?? '',
        f.event_date ?? '',
        f.parties.join('; '),
        f.reconciliation_status,
        REVIEW_LABELS[f.review_status] ?? f.review_status,
        f.review_notes ?? '',
        primary?.exact_excerpt ?? '',
        primary?.filename ?? '',
        primary?.source_locator ?? '',
        matches,
      ]
        .map((v) => csvCell(String(v)))
        .join(','),
    );
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="scopesignal-audit-${auditId}.csv"`,
    },
  });
}
