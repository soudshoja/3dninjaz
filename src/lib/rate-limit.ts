import "server-only";

/**
 * Phase 7 (07-05) — reusable in-process rate limiter.
 *
 * Module-global Map; per-key bucket. Mirrors the Phase 5 05-02 events
 * inline limiter pattern and is plenty for v1 (single Node process per
 * cPanel app instance). For multi-instance deployments swap for Redis.
 *
 * Usage:
 *   const r = checkRateLimit(`refund:${userId}`, 5, 60_000);
 *   if (!r.ok) return { error: `try again in ${Math.ceil(r.retryAfterMs/1000)}s` };
 */

type Bucket = { tokens: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  maxPerWindow: number,
  windowMs: number,
): { ok: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, {
      tokens: maxPerWindow - 1,
      resetAt: now + windowMs,
    });
    return { ok: true, remaining: maxPerWindow - 1, retryAfterMs: 0 };
  }
  if (b.tokens <= 0) {
    return { ok: false, remaining: 0, retryAfterMs: b.resetAt - now };
  }
  b.tokens--;
  return { ok: true, remaining: b.tokens, retryAfterMs: 0 };
}

/** Test-only — clears all buckets so tests can run deterministically. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
