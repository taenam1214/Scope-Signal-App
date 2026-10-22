import 'server-only';

/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * NOTE: per-process only — fine for a single web instance / MVP. For multiple
 * instances, back this with Redis. It guards against rapid repeated actions
 * (e.g. upload/audit spam), not distributed abuse.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
