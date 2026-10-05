// @vitest-environment node
// Required: TanStack Start's import protection mocks server modules in jsdom (client) environment.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.ts";
import {
  checkScanAllowed,
  checkSpendCap,
  dayStart,
  getDailySpendMicrousd,
  getMonthlyScanCount,
  getMonthlyUsageSummary,
  monthStart,
  recordAiUsage,
} from "../src/server/ai-usage.server.ts";
import { env } from "../src/server/env.ts";

describe("ai usage metering and quotas", () => {
  const userId = "ai-usage-test-user";

  const insertUsage = (
    kind: "receipt_scan" | "categorize",
    createdAt: Date,
    costMicrousd = 0,
  ) =>
    db.insert(schema.ai_usage).values({
      id: crypto.randomUUID(),
      user_id: userId,
      kind,
      provider: "fake",
      model: "fake",
      input_tokens: 0,
      output_tokens: 0,
      cost_estimate_microusd: costMicrousd,
      created_at: createdAt,
    });

  beforeEach(async () => {
    await db.insert(schema.users).values({
      id: userId,
      username: userId,
      password_hash: "x",
    });
  });

  afterEach(async () => {
    await db.delete(schema.ai_usage);
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("monthStart and dayStart compute UTC boundaries", () => {
    const now = new Date("2026-07-15T13:45:00Z");
    expect(monthStart(now).toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(dayStart(now).toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("recordAiUsage writes a row and getMonthlyScanCount counts only this month's scans", async () => {
    const now = new Date("2026-07-15T12:00:00Z");
    await recordAiUsage({
      userId,
      kind: "receipt_scan",
      provider: "openrouter",
      model: "test-model",
      inputTokens: 100,
      outputTokens: 50,
      costEstimateMicrousd: 1234,
    });
    // Last month's scan and this month's categorize call must not count.
    await insertUsage("receipt_scan", new Date("2026-06-30T23:59:00Z"));
    await insertUsage("categorize", now);

    expect(await getMonthlyScanCount(userId, db, now)).toBe(1);

    const rows = await db.select().from(schema.ai_usage);
    const recorded = rows.find((r) => r.provider === "openrouter");
    expect(recorded).toMatchObject({
      user_id: userId,
      kind: "receipt_scan",
      model: "test-model",
      input_tokens: 100,
      output_tokens: 50,
      cost_estimate_microusd: 1234,
    });
  });

  it("getMonthlyUsageSummary reports used scans and the configured limit", async () => {
    const now = new Date("2026-07-15T12:00:00Z");
    await insertUsage("receipt_scan", now);
    await insertUsage("receipt_scan", now);
    const summary = await getMonthlyUsageSummary(userId, db, now);
    expect(summary).toEqual({
      scansUsed: 2,
      scansLimit: env.ai.freeScansPerMonth,
      plan: "free",
    });
  });

  it("checkScanAllowed blocks with ai_quota_exceeded once the monthly quota is used", async () => {
    const now = new Date("2026-07-15T12:00:00Z");
    for (let i = 0; i < env.ai.freeScansPerMonth; i++) {
      await insertUsage("receipt_scan", now);
    }
    const gate = await checkScanAllowed(userId, db, now);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("ai_quota_exceeded");
    }
  });

  it("last month's scans do not count toward this month's quota", async () => {
    const lastMonth = new Date("2026-06-15T12:00:00Z");
    const now = new Date("2026-07-15T12:00:00Z");
    for (let i = 0; i < env.ai.freeScansPerMonth; i++) {
      await insertUsage("receipt_scan", lastMonth);
    }
    const gate = await checkScanAllowed(userId, db, now);
    expect(gate.allowed).toBe(true);
  });

  it("checkSpendCap blocks once today's global spend reaches the cap and sums only today", async () => {
    const now = new Date("2026-07-15T12:00:00Z");
    // Yesterday's spend is ignored by the daily sum.
    await insertUsage("receipt_scan", new Date("2026-07-14T12:00:00Z"), 9_000_000);
    await insertUsage("receipt_scan", now, 2_000_000); // $2 today

    expect(await getDailySpendMicrousd(db, now)).toBe(2_000_000);

    const originalCap = env.ai.dailySpendCapUsd;
    try {
      env.ai.dailySpendCapUsd = 5;
      expect((await checkSpendCap(db, now)).allowed).toBe(true);

      env.ai.dailySpendCapUsd = 2;
      const blocked = await checkSpendCap(db, now);
      expect(blocked.allowed).toBe(false);
      if (!blocked.allowed) {
        expect(blocked.code).toBe("ai_unavailable");
      }
    } finally {
      env.ai.dailySpendCapUsd = originalCap;
    }
  });

  it("checkSpendCap allows everything when no cap is configured", async () => {
    const now = new Date("2026-07-15T12:00:00Z");
    await insertUsage("receipt_scan", now, 999_000_000);
    const originalCap = env.ai.dailySpendCapUsd;
    try {
      env.ai.dailySpendCapUsd = undefined;
      expect((await checkSpendCap(db, now)).allowed).toBe(true);
    } finally {
      env.ai.dailySpendCapUsd = originalCap;
    }
  });
});
