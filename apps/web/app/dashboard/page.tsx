import { Radar } from 'lucide-react';

/**
 * Placeholder dashboard — proves the app boots and the brand system renders.
 * Real auth-gated dashboard with live metrics lands in Phase 2.
 */
export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-4 font-semibold text-navy">
          <Radar className="h-5 w-5 text-signal" aria-hidden />
          ScopeSignal
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <p className="mt-1 text-ink">
          Phase 1 scaffold. Authentication, projects, and live metrics arrive in Phase 2.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Total projects', value: '—' },
            { label: 'Completed audits', value: '—' },
            { label: 'Findings requiring review', value: '—' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-line bg-white p-5">
              <p className="text-sm text-ink">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold text-navy">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
