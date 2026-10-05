import { and, count, eq, isNull } from "drizzle-orm";
import { describe, expect, it, beforeAll } from "vitest";
import { db, schema } from "../src/db/index.ts";
import { seed } from "../scripts/seed.ts";

describe("category seeding", () => {
  const userId = "seed-test-user";

  beforeAll(async () => {
    await db.insert(schema.users).values({
      id: userId,
      username: "seed-test-user",
      password_hash: "x",
    });
    await seed(userId);
  });

  it("inserts all 8 top-level categories", async () => {
    const rows = await db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .where(
        and(
          isNull(schema.categories.parent_id),
          eq(schema.categories.user_id, userId),
        ),
      )
      .orderBy(schema.categories.sort_order);

    expect(rows.length).toBe(8);
    const names = rows.map((r) => r.name);
    expect(names).toContain("Groceries");
    expect(names).toContain("Housing");
    expect(names).toContain("Transport");
    expect(names).toContain("Entertainment");
    expect(names).toContain("Health");
    expect(names).toContain("Shopping");
    expect(names).toContain("Income");
    expect(names).toContain("Transfers");
  });

  it("inserts 26 sub-categories with correct parent references", async () => {
    const all = await db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        parent_id: schema.categories.parent_id,
      })
      .from(schema.categories)
      .where(eq(schema.categories.user_id, userId))
      .orderBy(schema.categories.sort_order);

    expect(all.length).toBe(34); // 8 top-level + 26 sub

    const groceries = all.find((c) => c.name === "Groceries");
    expect(groceries).toBeDefined();
    const groceryChildren = all.filter((c) => c.parent_id === groceries?.id);
    expect(groceryChildren.length).toBe(9);
    const groceryNames = groceryChildren.map((c) => c.name);
    expect(groceryNames).toContain("Vegetables");
    expect(groceryNames).toContain("Fruits");
    expect(groceryNames).toContain("Meat & Fish");
  });

  it("sets sort_order in insertion order per level", async () => {
    const rows = await db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        sort_order: schema.categories.sort_order,
      })
      .from(schema.categories)
      .where(
        and(
          isNull(schema.categories.parent_id),
          eq(schema.categories.user_id, userId),
        ),
      )
      .orderBy(schema.categories.sort_order);

    const orders = rows.map((r) => r.sort_order);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("assigns hex colors to all categories", async () => {
    const rows = await db
      .select({ color: schema.categories.color })
      .from(schema.categories)
      .where(eq(schema.categories.user_id, userId))
      .orderBy(schema.categories.sort_order);

    for (const row of rows) {
      expect(row.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("generates UUIDs for all category ids", async () => {
    const rows = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.user_id, userId))
      .orderBy(schema.categories.sort_order);

    for (const row of rows) {
      expect(row.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it("is idempotent — does not duplicate on second call for same user", async () => {
    const first = await db
      .select({ count: count() })
      .from(schema.categories)
      .where(eq(schema.categories.user_id, userId));

    const second = await seed(userId);

    expect(second).toBe(first[0].count);
    expect(first[0].count).toBe(34);
  });
});
