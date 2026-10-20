'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Refreshes server components on an interval while an audit is in progress. */
export function AutoRefresh({ intervalMs = 2500 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
