import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { db, schema } from "#/db";


// --- Types ---

export interface AnalyticsFilter {
  from?: string;
  to?: string;
  accountId?: string;
}

export interface TopCategory {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  /** Integer minor units (grosze/cents). */
  totalSpent: number;
}

export interface DashboardSummary {
  /** All totals are integer minor units (grosze/cents). */
  totalIncome: number;
  totalExpenses: number;
  net: number;
  topCategories: TopCategory[];
}

export interface SankeyNode {
  name: string;
  color?: string;
}

export interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

export interface SpendingOverTimeEntry {
  month: string;
  /** Income and per-category amounts are integer minor units (grosze/cents). */
  income: number;
  categories: Array<{
    name: string;
    color: string;
    amount: number;
  }>;
}

interface ReceiptItemRow {
  id: string;
  receiptId: string;
  totalPriceMinor: number;
  categoryId: string | null;
  itemName: string | null;
  itemColor: string | null;
  itemParentId: string | null;
}

// --- Helpers ---

function buildWhereClause(userId: string, filter: AnalyticsFilter) {
  const conditions = [eq(schema.transactions.user_id, userId)];

  if (filter.from) {
    conditions.push(gte(schema.transactions.date, filter.from));
  }
  if (filter.to) {
    conditions.push(lte(schema.transactions.date, filter.to));
  }
  if (filter.accountId) {
    conditions.push(eq(schema.transactions.account_id, filter.accountId));
  }

  return and(...conditions);
}

// --- Server Logic ---

/**
 * Fetches high-level dashboard summary: total income, expenses, net, and top spending categories.
 */
export async function getDashboardSummaryInternal(
  userId: string,
  filter: AnalyticsFilter,
): Promise<DashboardSummary> {
  const whereClause = buildWhereClause(userId, filter);

  // Total income (positive amounts) and expenses (negative amounts)
  const totals = await db
    .select({
      // SUM over integers is bigint in Postgres (returned as a string) — map back to number.
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amount_minor} > 0 THEN ${schema.transactions.amount_minor} ELSE 0 END), 0)`.mapWith(Number),
      totalExpenses: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amount_minor} < 0 THEN ABS(${schema.transactions.amount_minor}) ELSE 0 END), 0)`.mapWith(Number),
    })
    .from(schema.transactions)
    .where(whereClause);

  const { totalIncome, totalExpenses } =
    totals[0] ?? { totalIncome: 0, totalExpenses: 0 };

  // Top spending categories (by absolute expense amount)
  const topCategories = await db
    .select({
      categoryId: schema.categories.id,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
      totalSpent: sql<number>`COALESCE(SUM(ABS(${schema.transactions.amount_minor})), 0)`.mapWith(Number),
    })
    .from(schema.transactions)
    .innerJoin(
      schema.categories,
      eq(schema.transactions.category_id, schema.categories.id),
    )
    .where(
      and(
        whereClause,
        sql`${schema.transactions.amount_minor} < 0`,
      ),
    )
    .groupBy(
      schema.categories.id,
      schema.categories.name,
      schema.categories.color,
    )
    .orderBy(sql`SUM(ABS(${schema.transactions.amount_minor})) DESC`)
    .limit(5);

  return {
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    topCategories,
  };
}

/**
 * Fetches spending data formatted for a Sankey diagram: 3-level flow from accounts to categories to subcategories.
 *
 * For each expense transaction:
 * - If it has a receipt, receipt items determine subcategory breakdown.
 *   Each item's category_id determines the subcategory; the parent of that
 *   category (or the transaction's category) is the top-level category.
 *   Items without category_id use the parent category name as the subcategory node.
 * - If it has no receipt, the transaction's category determines the flow.
 *   The top-level category is the parent (if subcategory) or the category itself.
 *   When the transaction is categorized to a subcategory, spending flows to that subcategory.
 *   When the transaction is categorized to a top-level category only, spending flows to a
 *   subcategory node with the same name as the parent category.
 * - If the transaction has no category, it flows to an "Other" top-level node.
 *
 * The Sankey is balanced: account→category total = sum of category→subcategory totals.
 * Each category gets its own distinct 3rd-level node (e.g., "Groceries" → "Groceries")
 * so that spending from different categories is visually separated.
 */
export async function getSpendingSankeyInternal(
  userId: string,
  filter: AnalyticsFilter,
): Promise<{ nodes: SankeyNode[]; links: SankeyLink[] }> {
  const whereClause = buildWhereClause(userId, filter);

  // 1. Get all accounts for this user (respecting account filter)
  const accountWhere = filter.accountId
    ? and(eq(schema.accounts.user_id, userId), eq(schema.accounts.id, filter.accountId))
    : eq(schema.accounts.user_id, userId);
  const accounts = await db
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
    })
    .from(schema.accounts)
    .where(accountWhere);

  // 2. Get all expense transactions with account and category info
  const transactions = await db
    .select({
      id: schema.transactions.id,
      accountId: schema.transactions.account_id,
      amountMinor: schema.transactions.amount_minor,
      categoryId: schema.transactions.category_id,
      accountName: schema.accounts.name,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
      categoryParentId: schema.categories.parent_id,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.account_id, schema.accounts.id),
    )
    .leftJoin(
      schema.categories,
      eq(schema.transactions.category_id, schema.categories.id),
    )
    .where(
      and(
        whereClause,
        sql`${schema.transactions.amount_minor} < 0`,
      ),
    );

  // 3. Get receipts for these transactions
  const transactionIds = transactions.map((t) => t.id);
  const receipts = transactionIds.length > 0
    ? await db
        .select({
          id: schema.receipts.id,
          transactionId: schema.receipts.transaction_id,
        })
        .from(schema.receipts)
        .where(inArray(schema.receipts.transaction_id, transactionIds))
    : [];

  // 4. Get receipt items for these receipts
  const receiptIds = receipts.map((r) => r.id);
  const receiptItems: ReceiptItemRow[] = receiptIds.length > 0
    ? (await db
        .select({
          id: schema.receipt_items.id,
          receiptId: schema.receipt_items.receipt_id,
          totalPriceMinor: schema.receipt_items.total_price_minor,
          categoryId: schema.receipt_items.category_id,
          itemName: schema.categories.name,
          itemColor: schema.categories.color,
          itemParentId: schema.categories.parent_id,
        })
        .from(schema.receipt_items)
        .leftJoin(
          schema.categories,
          eq(schema.receipt_items.category_id, schema.categories.id),
        )
        .where(inArray(schema.receipt_items.receipt_id, receiptIds))) as ReceiptItemRow[]
    : [];

  // Build lookup maps
  const receiptByTransaction = new Map<string, (typeof receipts)[0]>();
  for (const r of receipts) {
    receiptByTransaction.set(r.transactionId!, r);
  }

  const itemsByReceipt = new Map<string, ReceiptItemRow[]>();
  for (const item of receiptItems) {
    if (!itemsByReceipt.has(item.receiptId)) {
      itemsByReceipt.set(item.receiptId, []);
    }
    itemsByReceipt.get(item.receiptId)!.push(item);
  }

  // Build category info map from all categories referenced
  const categoryInfo = new Map<
    string,
    { name: string; color: string; parentId: string | null }
  >();
  for (const t of transactions) {
    if (t.categoryId && !categoryInfo.has(t.categoryId)) {
      categoryInfo.set(t.categoryId, {
        name: t.categoryName ?? "Unknown",
        color: t.categoryColor ?? "#6b7280",
        parentId: t.categoryParentId,
      });
    }
  }
  for (const item of receiptItems) {
    if (item.categoryId && !categoryInfo.has(item.categoryId)) {
      categoryInfo.set(item.categoryId, {
        name: item.itemName ?? "Unknown",
        color: item.itemColor ?? "#6b7280",
        parentId: item.itemParentId,
      });
    }
  }

  // Also fetch parent categories that aren't directly referenced by any transaction
  // This ensures getTopCategory can resolve parent chains
  const allParentIds = new Set<string>();
  for (const info of categoryInfo.values()) {
    if (info.parentId) allParentIds.add(info.parentId);
  }
  if (allParentIds.size > 0) {
    const parentCategories = await db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        color: schema.categories.color,
        parentId: schema.categories.parent_id,
      })
      .from(schema.categories)
      .where(inArray(schema.categories.id, Array.from(allParentIds)));
    for (const pc of parentCategories) {
      if (!categoryInfo.has(pc.id)) {
        categoryInfo.set(pc.id, {
          name: pc.name,
          color: pc.color ?? "#6b7280",
          parentId: pc.parentId,
        });
      }
    }
  }

  // Helper: get top-level category info from a category ID
  // Returns the parent if the category has one, otherwise the category itself
  function getTopCategory(catId: string | null) {
    if (!catId) return null;
    const info = categoryInfo.get(catId);
    if (!info) return null;
    if (info.parentId) {
      const parent = categoryInfo.get(info.parentId);
      if (parent) return { id: info.parentId, ...parent };
      // Parent not in our map — treat this category as top-level
      return { id: catId, ...info };
    }
    return { id: catId, ...info };
  }

  // Process transactions and build spending maps
  const accCatSpending = new Map<string, number>(); // account|topCat → total
  const catSubSpending = new Map<string, number>(); // topCat|subCat → total

  for (const txn of transactions) {
    const absAmount = Math.abs(txn.amountMinor);
    const receipt = receiptByTransaction.get(txn.id);

    if (receipt) {
      // Transaction has a receipt — use receipt items for subcategory breakdown
      const items = itemsByReceipt.get(receipt.id) ?? [];
      const itemsTotal = items.reduce((sum, i) => sum + (i.totalPriceMinor ?? 0), 0);
      const delta = absAmount - itemsTotal;

      // Determine top category from transaction's category
      const topCat = getTopCategory(txn.categoryId);

      if (topCat) {
        // Transaction's category determines the top-level flow
        const accCatKey = `${txn.accountId}|${topCat.id}`;
        accCatSpending.set(
          accCatKey,
          (accCatSpending.get(accCatKey) ?? 0) + absAmount,
        );

        // Process each receipt item — items provide subcategory breakdown
        for (const item of items) {
          const itemAmount = item.totalPriceMinor ?? 0;
          if (item.categoryId) {
            // Use item's category as the subcategory under transaction's top category
            const catSubKey = `${topCat.id}|${item.categoryId}`;
            catSubSpending.set(
              catSubKey,
              (catSubSpending.get(catSubKey) ?? 0) + itemAmount,
            );
          } else {
            // Uncategorized receipt item → use parent category name as subcategory
            const catSubKey = `${topCat.id}|${topCat.id}`;
            catSubSpending.set(
              catSubKey,
              (catSubSpending.get(catSubKey) ?? 0) + itemAmount,
            );
          }
        }

        // Delta (transaction amount - items sum) → use parent category name as subcategory
        if (delta > 0) {
          const catSubKey = `${topCat.id}|${topCat.id}`;
          catSubSpending.set(
            catSubKey,
            (catSubSpending.get(catSubKey) ?? 0) + delta,
          );
        }
      } else {
        // No category on transaction — items determine categories
        for (const item of items) {
          const itemAmount = item.totalPriceMinor ?? 0;
          if (item.categoryId) {
            const itemTopCat = getTopCategory(item.categoryId);
            if (itemTopCat) {
              const accCatKey = `${txn.accountId}|${itemTopCat.id}`;
              accCatSpending.set(
                accCatKey,
                (accCatSpending.get(accCatKey) ?? 0) + itemAmount,
              );
              const catSubKey = `${itemTopCat.id}|${item.categoryId}`;
              catSubSpending.set(
                catSubKey,
                (catSubSpending.get(catSubKey) ?? 0) + itemAmount,
              );
            }
          }
        }
        // Remaining amount (uncategorized items + delta) → "Other" top-level
        const uncategorizedAmount = items
          .filter((i) => !i.categoryId)
          .reduce((sum, i) => sum + (i.totalPriceMinor ?? 0), 0);
        const remaining = uncategorizedAmount + Math.max(0, delta);
        if (remaining > 0) {
          const accCatKey = `${txn.accountId}|Other`;
          accCatSpending.set(
            accCatKey,
            (accCatSpending.get(accCatKey) ?? 0) + remaining,
          );
        }
      }
    } else {
      // No receipt — use transaction category directly
      const topCat = getTopCategory(txn.categoryId);

      if (topCat) {
        const accCatKey = `${txn.accountId}|${topCat.id}`;
        accCatSpending.set(
          accCatKey,
          (accCatSpending.get(accCatKey) ?? 0) + absAmount,
        );

        // If transaction is categorized to a subcategory, preserve that detail
        if (txn.categoryId && topCat.id !== txn.categoryId) {
          const catSubKey = `${topCat.id}|${txn.categoryId}`;
          catSubSpending.set(
            catSubKey,
            (catSubSpending.get(catSubKey) ?? 0) + absAmount,
          );
        } else {
          // Transaction's category IS the top category (no subcategory detail)
          // Use the category's own ID as the subcategory node
          const catSubKey = `${topCat.id}|${topCat.id}`;
          catSubSpending.set(
            catSubKey,
            (catSubSpending.get(catSubKey) ?? 0) + absAmount,
          );
        }
      } else {
        // No category at all → "Other" top-level (no subcategory link needed)
        const accCatKey = `${txn.accountId}|Other`;
        accCatSpending.set(
          accCatKey,
          (accCatSpending.get(accCatKey) ?? 0) + absAmount,
        );
      }
    }
  }

  // Build Sankey nodes and links
  const accountIndex = new Map<string, number>();
  const categoryIndex = new Map<string, number>();
  const subcategoryIndex = new Map<string, number>();
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Add account nodes first
  for (const account of accounts) {
    const idx = nodes.length;
    accountIndex.set(account.id, idx);
    nodes.push({ name: account.name, color: "#94a3b8" });
  }

  // Add category nodes (from accCatSpending keys), then "Other" last
  const categoryIds = new Set<string>();
  for (const [key] of accCatSpending) {
    const [_accountId, catId] = key.split("|");
    categoryIds.add(catId);
  }
  // Add non-Other categories first, then "Other" last
  for (const catId of categoryIds) {
    if (catId === "Other") continue;
    const info = categoryInfo.get(catId);
    const idx = nodes.length;
    categoryIndex.set(catId, idx);
    nodes.push({
      name: info?.name ?? catId,
      color: info?.color ?? "#6b7280",
    });
  }
  // Add subcategory nodes (from catSubSpending keys)
  // Each subcategory gets its own node, even if it shares a name with a category.
  // This ensures the Sankey renders distinct columns for category and subcategory levels
  // (e.g., "Groceries" at level 2 and "Groceries" at level 3 are separate nodes).
  const subcategoryIds = new Set<string>();
  for (const [key] of catSubSpending) {
    const [_topCatId, subCatId] = key.split("|");
    subcategoryIds.add(subCatId);
  }
  for (const subCatId of subcategoryIds) {
    const info = categoryInfo.get(subCatId);
    const idx = nodes.length;
    subcategoryIndex.set(subCatId, idx);
    nodes.push({
      name: info?.name ?? subCatId,
      color: info?.color ?? "#6b7280",
    });
  }
  // Add "Other" as a category node only (for uncategorized transactions with no category)
  if (categoryIds.has("Other")) {
    const idx = nodes.length;
    categoryIndex.set("Other", idx);
    subcategoryIndex.set("Other", idx);
    nodes.push({ name: "Other", color: "#9ca3af" });
  }

  // Create links: account → category
  for (const [key, value] of accCatSpending) {
    const [accountId, catId] = key.split("|");
    const sourceIdx = accountIndex.get(accountId);
    const targetIdx = categoryIndex.get(catId);
    if (sourceIdx !== undefined && targetIdx !== undefined) {
      links.push({ source: sourceIdx, target: targetIdx, value });
    }
  }

  // Create links: category → subcategory
  for (const [key, value] of catSubSpending) {
    const [topCatId, subCatId] = key.split("|");
    const sourceIdx = categoryIndex.get(topCatId);
    const targetIdx = subcategoryIndex.get(subCatId);
    if (sourceIdx !== undefined && targetIdx !== undefined) {
      links.push({ source: sourceIdx, target: targetIdx, value });
    }
  }

  return { nodes, links };
}

/**
 * Fetches monthly spending data broken down by category for bar/line charts.
 */
export async function getSpendingOverTimeInternal(
  userId: string,
  filter: AnalyticsFilter,
): Promise<SpendingOverTimeEntry[]> {
  const whereClause = buildWhereClause(userId, filter);

  // Monthly spending by category (expenses only)
  const monthExpr = sql<string>`to_char(${schema.transactions.date}, 'YYYY-MM')`;
  const monthlyData = await db
    .select({
      month: monthExpr,
      categoryId: schema.categories.id,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
      totalSpent: sql<number>`COALESCE(SUM(ABS(${schema.transactions.amount_minor})), 0)`.mapWith(Number),
    })
    .from(schema.transactions)
    .innerJoin(
      schema.categories,
      eq(schema.transactions.category_id, schema.categories.id),
    )
    .where(
      and(
        whereClause,
        sql`${schema.transactions.amount_minor} < 0`,
      ),
    )
    .groupBy(
      monthExpr,
      schema.categories.id,
      schema.categories.name,
      schema.categories.color,
    )
    .orderBy(monthExpr);

  // Monthly income
  const monthlyIncome = await db
    .select({
      month: monthExpr,
      totalIncome: sql<number>`COALESCE(SUM(${schema.transactions.amount_minor}), 0)`.mapWith(Number),
    })
    .from(schema.transactions)
    .where(
      and(
        whereClause,
        sql`${schema.transactions.amount_minor} > 0`,
      ),
    )
    .groupBy(monthExpr)
    .orderBy(monthExpr);

  // Pivot into monthly buckets
  const months = new Map<
    string,
    {
      month: string;
      income: number;
      categories: Map<
        string,
        { name: string; color: string; amount: number }
      >;
    }
  >();

  for (const row of monthlyIncome) {
    if (!months.has(row.month)) {
      months.set(row.month, {
        month: row.month,
        income: 0,
        categories: new Map(),
      });
    }
    months.get(row.month)!.income = row.totalIncome;
  }

  for (const row of monthlyData) {
    if (!months.has(row.month)) {
      months.set(row.month, {
        month: row.month,
        income: 0,
        categories: new Map(),
      });
    }
    const entry = months.get(row.month)!;
    entry.categories.set(row.categoryId, {
      name: row.categoryName,
      color: row.categoryColor ?? "#6b7280",
      amount: row.totalSpent,
    });
  }

  // Convert to array sorted by month
  const result = Array.from(months.values())
    .map((entry) => ({
      month: entry.month,
      income: entry.income,
      categories: Array.from(entry.categories.values()),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return result;
}
