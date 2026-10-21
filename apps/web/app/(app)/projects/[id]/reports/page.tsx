import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth';

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMembership();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!project) notFound();

  return (
    <div>
      <Link href={`/projects/${id}`} className="text-sm text-signal hover:underline">
        ← {project.name}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-navy">Reports</h1>
      <p className="mt-4 max-w-xl text-ink">
        PDF and CSV audit report export becomes available in the next phase. Reports will include the
        reviewed findings, supporting citations, register comparisons, reviewer notes, and the
        standard limitations statement.
      </p>
    </div>
  );
}
