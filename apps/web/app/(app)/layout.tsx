import Link from 'next/link';
import { Radar } from 'lucide-react';
import { requireMembership } from '@/lib/auth';
import { signOut } from '@/app/login/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await requireMembership();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-navy">
              <Radar className="h-5 w-5 text-signal" aria-hidden />
              ScopeSignal
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/dashboard" className="text-ink hover:text-navy">
                Dashboard
              </Link>
              <Link href="/projects" className="text-ink hover:text-navy">
                Projects
              </Link>
              <Link href="/settings" className="text-ink hover:text-navy">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink sm:inline">{membership.organizationName}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-line px-3 py-1.5 font-medium text-navy hover:bg-surface"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
