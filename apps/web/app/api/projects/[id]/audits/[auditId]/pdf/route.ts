import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReportData } from '@/lib/report-data';
import { renderReportPdf } from '@/lib/processor';

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

  try {
    const pdf = await renderReportPdf(data.payload);
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="scopesignal-audit-${auditId}.pdf"`,
      },
    });
  } catch {
    return new Response('Report service unavailable', { status: 502 });
  }
}
