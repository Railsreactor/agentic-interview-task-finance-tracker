import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "#/db";
import { checkBudgetLimit } from "#/server/billing.server";
import { requireUserId } from "#/server/session";

const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  limitMinor: z.number().int().positive().safe(),
});

const updateBudgetSchema = z.object({
  id: z.string().min(1),
  limitMinor: z.number().int().positive().safe(),
});

const deleteBudgetSchema = z.object({
  id: z.string().min(1),
});

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(year, month + 1, 1));
  const end = `${nextMonth.getUTCFullYear()}-${String(
    nextMonth.getUTCMonth() + 1,
  ).padStart(2, "0")}-01`;

  return { month: start.slice(0, 7), start, end };
}

export const getBudgets = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    const { month, start, end } = getCurrentMonthRange();

    const [budgets, categories] = await Promise.all([
      db
        .select({
          id: schema.budgets.id,
          category_id: schema.budgets.category_id,
          limit_minor: schema.budgets.limit_minor,
          created_at: schema.budgets.created_at,
          updated_at: schema.budgets.updated_at,
        })
        .from(schema.budgets)
        .where(eq(schema.budgets.user_id, userId)),
      db
        .select({
          id: schema.categories.id,
          name: schema.categories.name,
          parent_id: schema.categories.parent_id,
        })
        .from(schema.categories)
        .where(eq(schema.categories.user_id, userId)),
    ]);

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const childrenByParent = new Map<string, string[]>();

    for (const category of categories) {
      if (category.parent_id) {
        const children = childrenByParent.get(category.parent_id) ?? [];
        children.push(category.id);
        childrenByParent.set(category.parent_id, children);
      }
    }

    const categoryIds = new Set<string>();
    for (const budget of budgets) {
      const stack = [budget.category_id];

      while (stack.length > 0) {
        const id = stack.pop()!;
        if (categoryIds.has(id)) continue;
        categoryIds.add(id);
        stack.push(...(childrenByParent.get(id) ?? []));
      }
    }

    const transactions =
      categoryIds.size > 0
        ? await db
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
                inArray(
                  schema.transactions.category_id,
                  [...categoryIds],
                ),
              ),
            )
        : [];

    const spendByCategory = new Map<string, number>();
    for (const transaction of transactions) {
      if (!transaction.category_id) continue;
      spendByCategory.set(
        transaction.category_id,
        (spendByCategory.get(transaction.category_id) ?? 0) -
          transaction.amount_minor,
      );
    }

    return budgets.map((budget) => {
      const stack = [budget.category_id];
      const visited = new Set<string>();
      let spendMinor = 0;

      while (stack.length > 0) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        spendMinor += spendByCategory.get(id) ?? 0;
        stack.push(...(childrenByParent.get(id) ?? []));
      }

      return {
        ...budget,
        category_name: categoryById.get(budget.category_id)?.name ?? "Unknown",
        month,
        spend_minor: spendMinor,
        remaining_minor: budget.limit_minor - spendMinor,
        percent_used: (spendMinor / budget.limit_minor) * 100,
      };
    });
  },
);

export const createBudget = createServerFn({ method: "POST" })
  .inputValidator(createBudgetSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();

    const category = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.id, data.categoryId),
          eq(schema.categories.user_id, userId),
        ),
      )
      .limit(1);

    if (category.length === 0) {
      return { error: "Category does not exist" };
    }

    const existing = await db
      .select({ id: schema.budgets.id })
      .from(schema.budgets)
      .where(
        and(
          eq(schema.budgets.user_id, userId),
          eq(schema.budgets.category_id, data.categoryId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return { error: "A budget already exists for this category" };
    }

    const limit = await checkBudgetLimit(userId);
    if (!limit.allowed) {
      return {
        error: limit.error,
        code: limit.code,
        limit: limit.limit,
      };
    }

    const id = crypto.randomUUID();

    try {
      await db.insert(schema.budgets).values({
        id,
        user_id: userId,
        category_id: data.categoryId,
        limit_minor: data.limitMinor,
      });
    } catch (error) {
      // Handle a concurrent request for the same user/category safely.
      const duplicate = await db
        .select({ id: schema.budgets.id })
        .from(schema.budgets)
        .where(
          and(
            eq(schema.budgets.user_id, userId),
            eq(schema.budgets.category_id, data.categoryId),
          ),
        )
        .limit(1);

      if (duplicate.length > 0) {
        return { error: "A budget already exists for this category" };
      }

      throw error;
    }

    return { success: true, id };
  });

export const updateBudget = createServerFn({ method: "POST" })
  .inputValidator(updateBudgetSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();

    const updated = await db
      .update(schema.budgets)
      .set({
        limit_minor: data.limitMinor,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(schema.budgets.id, data.id),
          eq(schema.budgets.user_id, userId),
        ),
      )
      .returning({ id: schema.budgets.id });

    if (updated.length === 0) {
      return { error: "Budget not found" };
    }

    return { success: true };
  });

export const deleteBudget = createServerFn({ method: "POST" })
  .inputValidator(deleteBudgetSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();

    const deleted = await db
      .delete(schema.budgets)
      .where(
        and(
          eq(schema.budgets.id, data.id),
          eq(schema.budgets.user_id, userId),
        ),
      )
      .returning({ id: schema.budgets.id });

    if (deleted.length === 0) {
      return { error: "Budget not found" };
    }

    return { success: true };
  });
