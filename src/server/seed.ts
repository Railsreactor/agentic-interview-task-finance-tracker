import { eq } from "drizzle-orm";
import { db, schema } from "#/db";

// Server-side seeders used by /test-create-user?seed=defaults and the CLI helper at
// `[[scripts/seed.ts]]`. Kept under src/server/ so vite SSR can import them
// from a route without pulling in the CLI shebang or top-level argv handling.

interface CategoryDef {
  name: string;
  color: string;
  children: CategoryDef[] | undefined;
}

const CATEGORIES: CategoryDef[] = [
  {
    name: "Groceries",
    color: "#4CAF50",
    children: [
      { name: "Vegetables", color: "#66BB6A", children: [] },
      { name: "Fruits", color: "#FFA726", children: [] },
      { name: "Meat & Fish", color: "#EF5350", children: [] },
      { name: "Dairy & Eggs", color: "#FFEE58", children: [] },
      { name: "Bread & Bakery", color: "#8D6E63", children: [] },
      { name: "Alcohol", color: "#AB47BC", children: [] },
      { name: "Beverages", color: "#29B6F6", children: [] },
      { name: "Snacks & Sweets", color: "#EC407A", children: [] },
      { name: "Household Items", color: "#78909C", children: [] },
    ],
  },
  {
    name: "Housing",
    color: "#2196F3",
    children: [
      { name: "Rent / Mortgage", color: "#42A5F5", children: [] },
      { name: "Utilities", color: "#64B5F6", children: [] },
      { name: "Maintenance", color: "#90CAF9", children: [] },
    ],
  },
  {
    name: "Transport",
    color: "#FF9800",
    children: [
      { name: "Fuel", color: "#FFA726", children: [] },
      { name: "Public Transport", color: "#FFB74D", children: [] },
      { name: "Car Maintenance", color: "#FFCC80", children: [] },
    ],
  },
  {
    name: "Entertainment",
    color: "#9C27B0",
    children: [
      { name: "Dining Out", color: "#BA68C8", children: [] },
      { name: "Subscriptions", color: "#CE93D8", children: [] },
      { name: "Hobbies", color: "#E1BEE7", children: [] },
    ],
  },
  {
    name: "Health",
    color: "#4CAF50",
    children: [
      { name: "Pharmacy", color: "#81C784", children: [] },
      { name: "Medical Services", color: "#A5D6A7", children: [] },
    ],
  },
  {
    name: "Shopping",
    color: "#795548",
    children: [
      { name: "Clothing", color: "#8D6E63", children: [] },
      { name: "Electronics", color: "#A1887F", children: [] },
      { name: "Other", color: "#BCAAA4", children: [] },
    ],
  },
  {
    name: "Income",
    color: "#009688",
    children: [
      { name: "Salary", color: "#26A69A", children: [] },
      { name: "Freelance", color: "#4DB6AC", children: [] },
      { name: "Other Income", color: "#80CBC4", children: [] },
    ],
  },
  {
    name: "Transfers",
    color: "#607D8B",
    children: [],
  },
];

async function insertCategory(
  userId: string,
  name: string,
  parentId: string | null,
  color: string,
  sortOrder: number,
  existing: { id: string; name: string; parent_id: string | null }[],
): Promise<string> {
  for (const row of existing) {
    if (row.parent_id === parentId && row.name === name) {
      return row.id;
    }
  }
  const id = crypto.randomUUID();
  await db.insert(schema.categories).values({
    id,
    user_id: userId,
    name,
    parent_id: parentId,
    color,
    sort_order: sortOrder,
  });
  return id;
}

async function seedCategories(
  userId: string,
  defs: CategoryDef[],
  parentId: string | null,
  existing: { id: string; name: string; parent_id: string | null }[],
): Promise<void> {
  let order = 0;
  for (const def of defs) {
    const id = await insertCategory(userId, def.name, parentId, def.color, order, existing);
    order++;
    const children = def.children ?? [];
    if (children.length > 0) {
      await seedCategories(userId, children, id, existing);
    }
  }
}

export async function seedAccount(
  userId: string,
  name: string,
  currency: string = "PLN",
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(schema.accounts).values({
    id,
    user_id: userId,
    name,
    currency,
  });
  return id;
}

export async function seed(userId: string): Promise<number> {
  const existing = await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      parent_id: schema.categories.parent_id,
    })
    .from(schema.categories)
    .where(eq(schema.categories.user_id, userId));
  if (existing.length > 0) return existing.length;

  await seedCategories(userId, CATEGORIES, null, existing);
  return CATEGORIES.reduce((sum, c) => sum + 1 + (c.children?.length ?? 0), 0);
}

interface DefaultRule {
  pattern: string;
  categoryName: string;
}

const DEFAULT_RULES: DefaultRule[] = [
  { pattern: "Biedronka", categoryName: "Groceries" },
  { pattern: "BIEDRONKA", categoryName: "Groceries" },
  { pattern: "Lidl", categoryName: "Groceries" },
  { pattern: "Auchan", categoryName: "Groceries" },
  { pattern: "Żabka", categoryName: "Groceries" },
  { pattern: "ZABKA", categoryName: "Groceries" },
  { pattern: "Orlen", categoryName: "Fuel" },
  { pattern: "ORLEN", categoryName: "Fuel" },
  { pattern: "BP", categoryName: "Fuel" },
  { pattern: "Allegro", categoryName: "Shopping" },
];

export async function seedDefaultRules(userId: string): Promise<number> {
  const existing = await db
    .select({ id: schema.categorization_rules.id })
    .from(schema.categorization_rules)
    .where(eq(schema.categorization_rules.user_id, userId))
    .limit(1);
  if (existing.length > 0) return 0;

  const cats = await db
    .select({ id: schema.categories.id, name: schema.categories.name })
    .from(schema.categories)
    .where(eq(schema.categories.user_id, userId));
  const byName = new Map<string, string>();
  for (const c of cats) byName.set(c.name.toLowerCase(), c.id);

  let inserted = 0;
  for (const rule of DEFAULT_RULES) {
    const categoryId = byName.get(rule.categoryName.toLowerCase());
    if (!categoryId) continue;
    await db.insert(schema.categorization_rules).values({
      id: crypto.randomUUID(),
      user_id: userId,
      pattern: rule.pattern,
      match_type: "substring",
      category_id: categoryId,
      priority: 100,
    });
    inserted++;
  }
  return inserted;
}
