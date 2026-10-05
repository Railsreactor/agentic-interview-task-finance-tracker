//
// In-memory sliding-window rate limiter and progressive account lockout for
// the auth endpoints. State is per-process — good enough for the current
// single-instance deployment; move to a shared store (Postgres/Redis) when
// the app scales horizontally (ticket 103/104).

export interface RateLimitOptions {
  /** Max attempts inside the window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const buckets = new Map<string, number[]>();

/**
 * Record an attempt for `key` and report whether it is allowed under the
 * sliding window. Attempts (not just failures) count toward the window.
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const cutoff = now - opts.windowMs;
  const attempts = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (attempts.length >= opts.limit) {
    buckets.set(key, attempts);
    const retryAfterMs = attempts[0] + opts.windowMs - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }
  attempts.push(now);
  buckets.set(key, attempts);
  return { allowed: true };
}

// ── Progressive lockout ──────────────────────────────────────────────────────

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_BASE_MS = 60_000; // 1 min, doubles per extra failure
const LOCKOUT_MAX_MS = 60 * 60_000; // capped at 1 hour

interface FailureState {
  count: number;
  lockedUntil: number;
}

const failures = new Map<string, FailureState>();

/**
 * Record a failed authentication for `key` (e.g. a username). From the 5th
 * consecutive failure on, the key is locked with exponential backoff:
 * 1 min, 2 min, 4 min, ... capped at 1 hour.
 */
export function recordAuthFailure(key: string, now: number = Date.now()): void {
  const state = failures.get(key) ?? { count: 0, lockedUntil: 0 };
  state.count += 1;
  if (state.count >= LOCKOUT_THRESHOLD) {
    const backoffMs = Math.min(
      LOCKOUT_BASE_MS * 2 ** (state.count - LOCKOUT_THRESHOLD),
      LOCKOUT_MAX_MS,
    );
    state.lockedUntil = now + backoffMs;
  }
  failures.set(key, state);
}

/** Clear the failure counter after a successful authentication. */
export function clearAuthFailures(key: string): void {
  failures.delete(key);
}

export function isLockedOut(
  key: string,
  now: number = Date.now(),
): RateLimitResult {
  const state = failures.get(key);
  if (!state || state.lockedUntil <= now) {
    return { allowed: true };
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)),
  };
}

/** Test-only helper: wipe all limiter state. */
export function resetRateLimiter(): void {
  buckets.clear();
  failures.clear();
}
