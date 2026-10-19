import Link from 'next/link';
import { Radar, FileSearch, ShieldCheck } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold text-navy">
            <Radar className="h-5 w-5 text-signal" aria-hidden />
            ScopeSignal
          </div>
          <Link
            href="/dashboard"
            className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-600"
          >
            Open app
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="text-sm font-medium uppercase tracking-wide text-signal">
          For commercial electrical subcontractors
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold text-navy sm:text-5xl">
          Find potentially overlooked scope changes before they become costly documentation
          problems.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink">
          ScopeSignal analyzes authorized project communications, identifies potential scope-change
          events, and reconciles them against your change-order register — every finding backed by
          traceable source evidence.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: FileSearch,
              title: 'Evidence-linked findings',
              body: 'Each candidate links back to the exact email, RFI, or PDF excerpt it came from.',
            },
            {
              icon: Radar,
              title: 'Register reconciliation',
              body: 'Compare communicated scope against what was formally recorded.',
            },
            {
              icon: ShieldCheck,
              title: 'Human-in-the-loop',
              body: 'Nothing is confirmed without a reviewer decision. No change orders are ever auto-submitted.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-line bg-white p-5">
              <Icon className="h-6 w-6 text-signal" aria-hidden />
              <h2 className="mt-3 font-semibold text-navy">{title}</h2>
              <p className="mt-1 text-sm text-ink">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
