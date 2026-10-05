import { and, eq, gte, sql } from "drizzle-orm";
import { db as defaultDb, schema } from "#/db";
import { getEntitlements, type Plan } from "#/server/billing.server";
import { env } from "#/server/env";
import { getLogger } from "#/server/logger";
import { checkRateLimit } from "#/server/rate-limit";

//
// Per-user AI usage metering, the monthly scan quota, the per-user scan rate
// limit, and the global daily spend circuit breaker. Every AI call —
// including fake-mode and self-hosted calls, which cost nothing — writes an
// ai_usage row, so quota counting works identically across backends.

type Db = typeof defaultDb;

export type AiUsageKind = "receipt_scan" | "categorize";

export interface AiUsageRecord {
  userId: string;
  kind: AiUsageKind;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costEstimateMicrousd: number;
}

/** Scans allowed per user per minute; multiplied in TEST_MODE because the
 * parallel E2E suite drives many scans from one process. */
const SCAN_RATE_LIMIT = 5;
const SCAN_RATE_WINDOW_MS = 60_000;

/** Fraction of the daily spend cap that triggers the operator warning. */
const SPEND_CAP_WARN_RATIO = 0.8;

export async function recordAiUsage(
  usage: AiUsageRecord,
  db: Db = defaultDb,
): Promise<void> {
  await db.insert(schema.ai_usage).values({
    id: crypto.randomUUID(),
    user_id: usage.userId,
    kind: usage.kind,
    provider: usage.provider,
    model: usage.model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cost_estimate_microusd: usage.costEstimateMicrousd,
  });
}

/** First instant of the calendar month containing `now` (UTC). */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** First instant of the calendar day containing `now` (UTC). */
export function dayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Receipt scans recorded for `userId` in the calendar month of `now`. */
export async function getMonthlyScanCount(
  userId: string,
  db: Db = defaultDb,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(schema.ai_usage)
    .where(
      and(
        eq(schema.ai_usage.user_id, userId),
        eq(schema.ai_usage.kind, "receipt_scan"),
        gte(schema.ai_usage.created_at, monthStart(now)),
      ),
    );
  return rows[0].count;
}

/** Usage summary for the user-facing "usage this month" display. The limit
 * comes from the user's plan entitlements (free vs pro), not a global env. */
export async function getMonthlyUsageSummary(
  userId: string,
  db: Db = defaultDb,
  now: Date = new Date(),
): Promise<{ scansUsed: number; scansLimit: number; plan: Plan }> {
  const entitlements = await getEntitlements(userId, db);
  return {
    scansUsed: await getMonthlyScanCount(userId, db, now),
    scansLimit: entitlements.scansPerMonth,
    plan: entitlements.plan,
  };
}

/** Total spend across all users on a given calendar day, in micro-USD. */
export async function getDailySpendMicrousd(
  db: Db = defaultDb,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`COALESCE(SUM(cost_estimate_microusd), 0)`.mapWith(
        Number,
      ),
    })
    .from(schema.ai_usage)
    .where(gte(schema.ai_usage.created_at, dayStart(now)));
  return rows[0].total;
}

export type ScanGateResult =
  | { allowed: true }
  | {
      allowed: false;
      /** Stable code the UI maps to a localized message. */
      code: "ai_rate_limited" | "ai_quota_exceeded" | "ai_unavailable";
      error: string;
    };

/**
 * All pre-flight gates for a receipt scan, cheapest first: per-user rate
 * limit, monthly quota, then the global daily spend circuit breaker.
 */
export async function checkScanAllowed(
  userId: string,
  db: Db = defaultDb,
  now: Date = new Date(),
): Promise<ScanGateResult> {
  const multiplier = env.isTestMode ? 10_000 : 1;
  const rate = checkRateLimit(
    `ai-scan:${userId}`,
    { limit: SCAN_RATE_LIMIT * multiplier, windowMs: SCAN_RATE_WINDOW_MS },
    now.getTime(),
  );
  if (!rate.allowed) {
    return {
      allowed: false,
      code: "ai_rate_limited",
      error: `Too many scans. Try again in ${rate.retryAfterSeconds}s.`,
    };
  }

  const entitlements = await getEntitlements(userId, db);
  const used = await getMonthlyScanCount(userId, db, now);
  if (used >= entitlements.scansPerMonth) {
    return {
      allowed: false,
      code: "ai_quota_exceeded",
      error: `Monthly scan limit reached (${entitlements.scansPerMonth}).`,
    };
  }

  return checkSpendCap(db, now);
}

/**
 * Global circuit breaker: refuse hosted AI calls once today's total spend
 * reaches AI_DAILY_SPEND_CAP_USD, and warn the operator (via the monitored
 * log stream) at 80%. Fake and self-hosted backends record zero cost, so
 * they are exempt by construction.
 */
export async function checkSpendCap(
  db: Db = defaultDb,
  now: Date = new Date(),
): Promise<ScanGateResult> {
  const capUsd = env.ai.dailySpendCapUsd;
  if (capUsd === undefined) return { allowed: true };

  const capMicrousd = Math.round(capUsd * 1_000_000);
  const spent = await getDailySpendMicrousd(db, now);
  if (spent >= capMicrousd) {
    getLogger().error(
      { spentMicrousd: spent, capMicrousd },
      "ai daily spend cap reached — ai features disabled until midnight utc",
    );
    return {
      allowed: false,
      code: "ai_unavailable",
      error: "AI features are temporarily unavailable. Try again later.",
    };
  }
  if (spent >= capMicrousd * SPEND_CAP_WARN_RATIO) {
    getLogger().warn(
      { spentMicrousd: spent, capMicrousd },
      "ai daily spend above 80% of cap",
    );
  }
  return { allowed: true };
}
