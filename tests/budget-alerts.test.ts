// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.ts";

vi.mock("#/server/email", () => ({
  sendEmail: vi.fn(),
}));

import { sendEmail } from "#/server/email";
import { checkBudgetAlerts } from "../src/server/budget-alerts.server.ts";

const mockedSendEmail = vi.mocked(sendEmail);

describe("budget email alerts", () => {
  const userId = `budget-alert-test-${crypto.randomUUID()}`;
  const accountId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedSendEmail.mockResolvedValue(undefined);

    await db.insert(schema.users).values({
      id: userId,
      username: userId,
      email: `${userId}@example.com`,
      password_hash: "x",
    });

    await db.insert(schema.accounts).values({
      id: accountId,
      user_id: userId,
      name: "Test account",
    });

    await db.insert(schema.categories).values({
      id: categoryId,
      user_id: userId,
      name: "Test category",
    });

    await db.insert(schema.budgets).values({
      id: budgetId,
      user_id: userId,
      category_id: categoryId,
      limit_minor: 1000,
    });

    const now = new Date();
    const date = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

    await db.insert(schema.transactions).values({
      id: crypto.randomUUID(),
      user_id: userId,
      account_id: accountId,
      date,
      amount_minor: -1000,
      category_id: categoryId,
      source: "manual",
    });
  });

  afterEach(async () => {
    await db
      .delete(schema.budget_alerts)
      .where(eq(schema.budget_alerts.budget_id, budgetId));
    await db
      .delete(schema.transactions)
      .where(eq(schema.transactions.user_id, userId));
    await db.delete(schema.budgets).where(eq(schema.budgets.user_id, userId));
    await db
      .delete(schema.categories)
      .where(eq(schema.categories.user_id, userId));
    await db.delete(schema.accounts).where(eq(schema.accounts.user_id, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("sends only one email for the same budget and month", async () => {
    await checkBudgetAlerts(userId);
    await checkBudgetAlerts(userId);

    expect(mockedSendEmail).toHaveBeenCalledTimes(1);

    const [alert] = await db
      .select()
      .from(schema.budget_alerts)
      .where(eq(schema.budget_alerts.budget_id, budgetId));

    expect(alert?.status).toBe("sent");
    expect(alert?.sent_at).toBeInstanceOf(Date);
  });

  it("allows retry after the email provider fails", async () => {
    mockedSendEmail.mockRejectedValueOnce(new Error("Provider unavailable"));

    await checkBudgetAlerts(userId);

    const [failedAlert] = await db
      .select()
      .from(schema.budget_alerts)
      .where(eq(schema.budget_alerts.budget_id, budgetId));

    expect(failedAlert?.status).toBe("failed");

    await checkBudgetAlerts(userId);

    expect(mockedSendEmail).toHaveBeenCalledTimes(2);

    const [alert] = await db
      .select()
      .from(schema.budget_alerts)
      .where(eq(schema.budget_alerts.budget_id, budgetId));

    expect(alert?.status).toBe("sent");
  });

  it("reclaims an expired pending reservation", async () => {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}`;

    await db.insert(schema.budget_alerts).values({
      budget_id: budgetId,
      month,
      status: "pending",
      lease_until: new Date(Date.now() - 60_000),
      sent_at: null,
      updated_at: new Date(),
    });

    await checkBudgetAlerts(userId);

    expect(mockedSendEmail).toHaveBeenCalledTimes(1);

    const [alert] = await db
      .select()
      .from(schema.budget_alerts)
      .where(
        and(
          eq(schema.budget_alerts.budget_id, budgetId),
          eq(schema.budget_alerts.month, month),
        ),
      );

    expect(alert?.status).toBe("sent");
  });
});
