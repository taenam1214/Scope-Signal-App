import { requireMembership } from '@/lib/auth';

export default async function SettingsPage() {
  const { membership, supabase } = await requireMembership();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows = [
    { label: 'Organization', value: membership.organizationName },
    { label: 'Your role', value: membership.role },
    { label: 'Email', value: user?.email ?? '—' },
  ];

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-navy">Settings</h1>
      <p className="mt-1 text-ink">Organization and account details.</p>

      <dl className="mt-6 divide-y divide-line rounded-lg border border-line bg-white">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-5 py-4">
            <dt className="text-sm text-ink">{r.label}</dt>
            <dd className="font-medium text-navy">{r.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-sm text-ink">
        Team management and advanced preferences are not part of v0.1.
      </p>
    </div>
  );
}
