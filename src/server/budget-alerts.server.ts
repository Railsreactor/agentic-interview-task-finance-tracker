import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import { db, schema } from "#/db";
import { formatMinor } from "#/lib/money";
import { sendEmail } from "#/server/email";
import { logger } from "#/server/logger";

const LEASE_MS = 5 * 60 * 1000;

function getMonthRange() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  return {
    month,
    start: `${month}-01`,
    end: `${year + (monthIndex === 11 ? 1 : 0)}-${String(
      ((monthIndex + 1) % 12) + 1,
    ).padStart(2, "0")}-01`,
  };
}

function getDescendantIds(
  categoryId: string,
  childrenByParent: Map<string, string[]>,
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const stack = [categoryId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;

    visited.add(current);
    result.push(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }

  return result;
}

/**
 * Checks the current month's category budgets and sends threshold alerts.
 * Email failures are logged and never propagated to the transaction writer.
 */
export async function checkBudgetAlerts(userId: string): Promise<void> {
  try {
    const [user] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    // Legacy accounts may not have an email address.
    if (!user?.email) return;

    const { month, start, end } = getMonthRange();

    const [budgets, categories] = await Promise.all([
      db
        .select({
          id: schema.budgets.id,
          category_id: schema.budgets.category_id,
          limit_minor: schema.budgets.limit_minor,
        })
        .from(schema.budgets)
        .where(eq(schema.budgets.user_id, userId)),
      db
        .select({
          id: schema.categories.id,
          parent_id: schema.categories.parent_id,
        })
        .from(schema.categories)
        .where(eq(schema.categories.user_id, userId)),
    ]);

    if (budgets.length === 0) return;

    const childrenByParent = new Map<string, string[]>();
    for (const category of categories) {
      if (!category.parent_id) continue;

      const children = childrenByParent.get(category.parent_id) ?? [];
      children.push(category.id);
      childrenByParent.set(category.parent_id, children);
    }

    const categoryIds = [...new Set(categories.map((category) => category.id))];
    if (categoryIds.length === 0) return;

    const transactions = await db
      .select({
        category_id: schema.transactions.category_id,
        amount_minor: schema.transactions.amount_minor,
      })
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.user_id, userId),
          gte(schema.transactions.date, start),
          lt(schema.transactions.date, end),
          lt(schema.transactions.amount_minor, 0),
          inArray(schema.transactions.category_id, categoryIds),
        ),
      );

    const spendByCategory = new Map<string, number>();
    for (const transaction of transactions) {
      if (!transaction.category_id) continue;

      spendByCategory.set(
        transaction.category_id,
        (spendByCategory.get(transaction.category_id) ?? 0) -
          transaction.amount_minor,
      );
    }

    for (const budget of budgets) {
      const descendantIds = getDescendantIds(
        budget.category_id,
        childrenByParent,
      );
      const spent = descendantIds.reduce(
        (total, id) => total + (spendByCategory.get(id) ?? 0),
        0,
      );

      if (spent < budget.limit_minor) continue;

      const now = new Date();
      const leaseUntil = new Date(now.getTime() + LEASE_MS);

      // Insert a reservation, or reclaim one whose lease expired / failed.
      // A sent alert can never be claimed again for the same budget and month.
      const [reservation] = await db
        .insert(schema.budget_alerts)
        .values({
          budget_id: budget.id,
          month,
          status: "pending",
          lease_until: leaseUntil,
          sent_at: null,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [
            schema.budget_alerts.budget_id,
            schema.budget_alerts.month,
          ],
          set: {
            status: "pending",
            lease_until: leaseUntil,
            sent_at: null,
            updated_at: now,
          },
          setWhere: or(
            eq(schema.budget_alerts.status, "failed"),
            lt(schema.budget_alerts.lease_until, now),
          ),
        })
        .returning({ budget_id: schema.budget_alerts.budget_id });

      if (!reservation) continue;

      try {
        await sendEmail({
          to: user.email,
          subject: "You've reached a budget limit",
          text: [
            `Your spending has reached the limit for budget ${budget.id}.`,
            `Month: ${month}`,
            `Spending: ${formatMinor(spent)}`,
            `Budget limit: ${formatMinor(budget.limit_minor)}`,
            "",
            "Amounts use the same minor-unit calculation as your existing budgets; no currency conversion is performed.",
          ].join("\n"),
        });

        await db
          .update(schema.budget_alerts)
          .set({
            status: "sent",
            sent_at: new Date(),
            lease_until: null,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(schema.budget_alerts.budget_id, budget.id),
              eq(schema.budget_alerts.month, month),
              eq(schema.budget_alerts.status, "pending"),
              eq(schema.budget_alerts.lease_until, leaseUntil),
            ),
          );
      } catch (error) {
        // Release the reservation for a future retry, without breaking the
        // transaction/import/receipt operation that triggered this check.
        await db
          .update(schema.budget_alerts)
          .set({
            status: "failed",
            lease_until: null,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(schema.budget_alerts.budget_id, budget.id),
              eq(schema.budget_alerts.month, month),
              eq(schema.budget_alerts.status, "pending"),
              eq(schema.budget_alerts.lease_until, leaseUntil),
            ),
          );

        logger.error(
          { err: error, budgetId: budget.id, month },
          "Failed to send budget alert email",
        );
      }
    }
  } catch (error) {
    // Alerting must not make financial writes fail.
    logger.error({ err: error, userId }, "Failed to check budget alerts");
  }
}
