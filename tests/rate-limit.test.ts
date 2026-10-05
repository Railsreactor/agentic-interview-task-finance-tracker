import { afterEach, describe, expect, it } from "vitest";
import { checkPasswordPolicy } from "#/server/password-policy";
import {
  checkRateLimit,
  clearAuthFailures,
  isLockedOut,
  recordAuthFailure,
  resetRateLimiter,
} from "#/server/rate-limit";

const WINDOW = { limit: 3, windowMs: 60_000 };

afterEach(() => {
  resetRateLimiter();
});

describe("rate limiting", () => {
  it("sliding window blocks after the limit and recovers when it slides", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("k", WINDOW, t0).allowed).toBe(true);
    expect(checkRateLimit("k", WINDOW, t0 + 1).allowed).toBe(true);
    expect(checkRateLimit("k", WINDOW, t0 + 2).allowed).toBe(true);

    const blocked = checkRateLimit("k", WINDOW, t0 + 3);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    }

    // Independent keys are unaffected
    expect(checkRateLimit("other", WINDOW, t0 + 3).allowed).toBe(true);

    // After the first attempt slides out of the window, one slot frees up
    expect(checkRateLimit("k", WINDOW, t0 + 60_001).allowed).toBe(true);
  });

  it("locks out after 5 failures with exponential backoff, cleared on success", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) {
      recordAuthFailure("user", t0);
      expect(isLockedOut("user", t0).allowed).toBe(true);
    }

    // 5th failure → locked for 1 minute
    recordAuthFailure("user", t0);
    const locked = isLockedOut("user", t0);
    expect(locked.allowed).toBe(false);
    if (!locked.allowed) {
      expect(locked.retryAfterSeconds).toBe(60);
    }
    expect(isLockedOut("user", t0 + 61_000).allowed).toBe(true);

    // 6th failure doubles the backoff (2 min)
    recordAuthFailure("user", t0 + 61_000);
    const locked2 = isLockedOut("user", t0 + 61_000);
    expect(locked2.allowed).toBe(false);
    if (!locked2.allowed) {
      expect(locked2.retryAfterSeconds).toBe(120);
    }

    // Success clears the counter entirely
    clearAuthFailures("user");
    expect(isLockedOut("user", t0 + 61_000).allowed).toBe(true);
  });
});

describe("password policy", () => {
  it("rejects short, common, and username-equal passwords", () => {
    expect(checkPasswordPolicy("short")).toMatch(/at least 8/);
    expect(checkPasswordPolicy("password123")).toMatch(/too common/);
    expect(checkPasswordPolicy("P@SSW0RD")).toMatch(/too common/);
    expect(checkPasswordPolicy("john-doe-42", "John-Doe-42")).toMatch(
      /must not equal the username/,
    );
    expect(checkPasswordPolicy("Corr3ct-Horse-Battery", "someone")).toBeNull();
  });
});
