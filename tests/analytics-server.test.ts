// @vitest-environment node
// Required: TanStack Start's import protection mocks server modules in jsdom (client) environment.
// Running in node environment ensures the real server functions execute against the in-memory DB.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.ts";
import {
  getSpendingSankeyInternal,
  getDashboardSummaryInternal,
} from "../src/server/analytics.server.ts";


describe("analytics server functions", () => {
  const userId = "analytics-test-user";

  const insertAccount = (id: string, name: string) =>
    db.insert(schema.accounts).values({ id, user_id: userId, name });

  const insertCategory = (
    id: string,
    name: string,
    color: string,
    parentId: string | null = null,
  ) =>
    db
      .insert(schema.categories)
      .values({ id, user_id: userId, name, color, parent_id: parentId });

  const insertTransaction = (
    id: string,
    accountId: string,
    date: string,
    amountMinor: number,
    description: string,
    categoryId: string | null,
  ) =>
    db.insert(schema.transactions).values({
      id,
      user_id: userId,
      account_id: accountId,
      date,
      amount_minor: amountMinor,
      description,
      category_id: categoryId,
    });

  const insertReceipt = (id: string, transactionId: string) =>
    db
      .insert(schema.receipts)
      .values({ id, user_id: userId, transaction_id: transactionId });

  const insertReceiptItem = (
    id: string,
    receiptId: string,
    name: string,
    totalPriceMinor: number,
    categoryId: string | null,
  ) =>
    db.insert(schema.receipt_items).values({
      id,
      receipt_id: receiptId,
      name,
      total_price_minor: totalPriceMinor,
      category_id: categoryId,
    });

  afterEach(async () => {
    // Clean up all data in dependency order to avoid foreign key violations
    await db.delete(schema.receipt_items);
    await db.delete(schema.receipts);
    await db.delete(schema.transactions);
    await db.delete(schema.categories);
    await db.delete(schema.accounts);
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  beforeEach(async () => {
    await db.insert(schema.users).values({
      id: userId,
      username: "analytics-test",
      password_hash: "x",
    });
  });

  // --- Basic functionality tests ---

  it("getSpendingSankeyInternal returns nodes and links", async () => {
    await insertAccount("acc-basic", "Test Account");

    await insertCategory("cat-basic", "Groceries", "#ef4444");

    await insertTransaction("txn-1", "acc-basic", "2025-01-15", -5000, "Grocery store", "cat-basic");

    await insertTransaction("txn-2", "acc-basic", "2025-01-20", -3000, "Supermarket", "cat-basic");

    // Income transaction — should be excluded from Sankey (expenses only)
    await insertTransaction("txn-3", "acc-basic", "2025-01-10", 200000, "Salary", null);

    const result = await getSpendingSankeyInternal(userId, {});

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.links.length).toBeGreaterThan(0);
  });

  it("getDashboardSummaryInternal returns summary data", async () => {
    await insertAccount("acc-summary", "Test Account");

    await insertCategory("cat-summary", "Groceries", "#ef4444");

    await insertTransaction("txn-1", "acc-summary", "2025-01-15", -5000, "Grocery store", "cat-summary");

    await insertTransaction("txn-2", "acc-summary", "2025-01-20", -3000, "Supermarket", "cat-summary");

    await insertTransaction("txn-3", "acc-summary", "2025-01-10", 200000, "Salary", null);

    const result = await getDashboardSummaryInternal(userId, {});

    expect(result.totalIncome).toBeGreaterThan(0);
    expect(result.totalExpenses).toBeGreaterThan(0);
    expect(result.net).toBe(200000 - 8000);
  });

  // --- Sankey: top-level category only (no subcategories) ---

  it("getSpendingSankeyInternal builds correct flow for top-level category with no subcategories", async () => {
    // 1 account, 1 top-level category, 2 transactions
    await insertAccount("acc-1", "Main Account");

    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    await insertTransaction("txn-1", "acc-1", "2025-01-15", -5000, "Grocery store", "cat-groceries");

    await insertTransaction("txn-2", "acc-1", "2025-01-20", -3000, "Supermarket", "cat-groceries");

    const result = await getSpendingSankeyInternal(userId, {});

    // Nodes: Main Account, Groceries (level 2), Groceries (level 3)
    // Links: Main Account → Groceries (80), Groceries → Groceries (80)
    // Each top-level category gets its own 3rd-level node with the same name
    expect(result.nodes).toHaveLength(3);
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames).toContain("Main Account");
    expect(nodeNames).toContain("Groceries");

    expect(result.links).toHaveLength(2);

    const findLink = (from: string, to: string) =>
      result.links.find(
        (l) =>
          result.nodes[l.source].name === from &&
          result.nodes[l.target].name === to,
      );
    expect(findLink("Main Account", "Groceries")!.value).toBe(8000); // 50 + 30
    // All spending flows to a 3rd-level node named after the category itself
    expect(findLink("Groceries", "Groceries")!.value).toBe(8000);
  });

  // --- Sankey: direct subcategory categorization ---

  it("getSpendingSankeyInternal correctly shows spending by subcategory when transactions are categorized to subcategories", async () => {
    await insertAccount("acc-sub", "Main Account");

    // Groceries (top-level) → Alcohol (subcategory)
    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    await insertCategory("cat-alcohol", "Alcohol", "#AB47BC", "cat-groceries");

    // Transport (top-level, no subcategory)
    await insertCategory("cat-transport", "Transport", "#FF9800");

    // Transaction 1: 100 PLN categorized to Alcohol (subcategory of Groceries)
    await insertTransaction("txn-1", "acc-sub", "2025-01-15", -10000, "Bar purchase", "cat-alcohol");

    // Transaction 2: 200 PLN categorized to Transport (top-level)
    await insertTransaction("txn-2", "acc-sub", "2025-01-20", -20000, "Gas station", "cat-transport");

    const result = await getSpendingSankeyInternal(userId, {});

    // Nodes: Main Account, Groceries(1), Alcohol(2), Transport(3), Transport-copy(4)
    // Groceries has a subcategory (Alcohol), so it flows there.
    // Transport has no subcategory, so it flows to a 3rd-level "Transport" node.
    expect(result.nodes).toHaveLength(5);
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames).toContain("Main Account");
    expect(nodeNames).toContain("Groceries");
    expect(nodeNames).toContain("Alcohol");
    expect(nodeNames).toContain("Transport");
    // Count "Groceries" appearances (level 2 and level 3)
    expect(nodeNames.filter((n) => n === "Groceries").length).toBe(1); // Only at level 2 (has subcategories)
    expect(nodeNames.filter((n) => n === "Transport").length).toBe(2); // Level 2 and level 3

    // Links:
    // Main Account → Groceries (100)
    // Main Account → Transport (200)
    // Groceries → Alcohol (100)
    // Transport → Transport (200) — 3rd level node with same name
    expect(result.links).toHaveLength(4);

    const accToGroc = result.links.find(
      (l) =>
        result.nodes[l.source].name === "Main Account" &&
        result.nodes[l.target].name === "Groceries",
    );
    expect(accToGroc!.value).toBe(10000);

    const accToTrans = result.links.find(
      (l) =>
        result.nodes[l.source].name === "Main Account" &&
        result.nodes[l.target].name === "Transport",
    );
    expect(accToTrans!.value).toBe(20000);

    const grocToAlc = result.links.find(
      (l) =>
        result.nodes[l.source].name === "Groceries" &&
        result.nodes[l.target].name === "Alcohol",
    );
    expect(grocToAlc!.value).toBe(10000);

    // Transport flows to its own 3rd-level node (same name, different index)
    const transToTrans = result.links.filter(
      (l) =>
        result.nodes[l.source].name === "Transport" &&
        result.nodes[l.target].name === "Transport" &&
        l.source !== l.target,
    );
    expect(transToTrans).toHaveLength(1);
    expect(transToTrans[0]!.value).toBe(20000);
  });

  // --- Sankey: receipt items drive subcategory breakdown ---

  it("getSpendingSankeyInternal uses receipt items for subcategory breakdown when receipt exists", async () => {
    await insertAccount("acc-receipt", "Wallet");

    // Groceries (top-level) → Alcohol, Vegetables (subcategories)
    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    await insertCategory("cat-alcohol", "Alcohol", "#AB47BC", "cat-groceries");

    await insertCategory("cat-vegetables", "Vegetables", "#66BB6A", "cat-groceries");

    // Transaction 1: 100 PLN at grocery store, categorized to Groceries, WITH receipt
    // Receipt has 2 items: Alcohol (40) + Vegetables (60) = 100
    await insertTransaction("txn-1", "acc-receipt", "2025-01-15", -10000, "Grocery store", "cat-groceries");

    await insertReceipt("rcpt-1", "txn-1");

    await insertReceiptItem("ri-1", "rcpt-1", "Beer", 4000, "cat-alcohol");

    await insertReceiptItem("ri-2", "rcpt-1", "Carrots", 6000, "cat-vegetables");

    // Transaction 2: 30 PLN at convenience store, categorized to Groceries, NO receipt
    await insertTransaction("txn-2", "acc-receipt", "2025-01-20", -3000, "Convenience store", "cat-groceries");

    const result = await getSpendingSankeyInternal(userId, {});

    // Nodes: Wallet, Groceries(1), Alcohol(2), Vegetables(3), Groceries-copy(4)
    // The no-receipt transaction flows to a 3rd-level "Groceries" node
    expect(result.nodes).toHaveLength(5);
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames).toContain("Wallet");
    expect(nodeNames).toContain("Groceries");
    expect(nodeNames).toContain("Alcohol");
    expect(nodeNames).toContain("Vegetables");
    // Count "Groceries" appearances (level 2 and level 3)
    expect(nodeNames.filter((n) => n === "Groceries").length).toBe(2);

    // Balanced Sankey:
    // Wallet → Groceries: 130 (total of both transactions)
    // Groceries → Alcohol: 40 (from receipt item)
    // Groceries → Vegetables: 60 (from receipt item)
    // Groceries → Groceries: 30 (from transaction without receipt, 3rd level)
    // Verify balance: 130 = 40 + 60 + 30 ✓
    expect(result.links).toHaveLength(4);

    const findLink = (from: string, to: string) =>
      result.links.find(
        (l) =>
          result.nodes[l.source].name === from &&
          result.nodes[l.target].name === to,
      );

    expect(findLink("Wallet", "Groceries")!.value).toBe(13000);
    expect(findLink("Groceries", "Alcohol")!.value).toBe(4000);
    expect(findLink("Groceries", "Vegetables")!.value).toBe(6000);

    // No-receipt transaction flows to 3rd-level "Groceries" node
    const grocToGroc = result.links.filter(
      (l) =>
        result.nodes[l.source].name === "Groceries" &&
        result.nodes[l.target].name === "Groceries" &&
        l.source !== l.target,
    );
    expect(grocToGroc).toHaveLength(1);
    expect(grocToGroc[0]!.value).toBe(3000);
  });

  // --- Sankey: receipt items without category fall back to parent ---

  it("getSpendingSankeyInternal falls back to parent category for receipt items without subcategory", async () => {
    await insertAccount("acc-uncat", "Savings");

    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    // Transaction 1: 50 PLN with receipt, but receipt item has NO category
    await insertTransaction("txn-1", "acc-uncat", "2025-01-15", -5000, "Grocery store", "cat-groceries");

    await insertReceipt("rcpt-1", "txn-1");

    await insertReceiptItem("ri-1", "rcpt-1", "Milk", 5000, null); // No category on receipt item

    // Transaction 2: 25 PLN, NO receipt
    await insertTransaction("txn-2", "acc-uncat", "2025-01-20", -2500, "Supermarket", "cat-groceries");

    const result = await getSpendingSankeyInternal(userId, {});

    // Nodes: Savings, Groceries(1), Groceries-copy(2)
    // Both transactions' spending flows to a 3rd-level "Groceries" node
    // (receipt item without category uses parent category name)
    expect(result.nodes).toHaveLength(3);
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames).toContain("Savings");
    expect(nodeNames).toContain("Groceries");
    expect(nodeNames.filter((n) => n === "Groceries").length).toBe(2);

    // Savings → Groceries: 75 (50 + 25)
    // Groceries → Groceries: 75 (3rd level node with same name)
    expect(result.links).toHaveLength(2);

    const findLink = (from: string, to: string) =>
      result.links.find(
        (l) =>
          result.nodes[l.source].name === from &&
          result.nodes[l.target].name === to,
      );
    expect(findLink("Savings", "Groceries")!.value).toBe(7500);

    // Spending flows to 3rd-level "Groceries" node
    const grocToGroc = result.links.filter(
      (l) =>
        result.nodes[l.source].name === "Groceries" &&
        result.nodes[l.target].name === "Groceries" &&
        l.source !== l.target,
    );
    expect(grocToGroc).toHaveLength(1);
    expect(grocToGroc[0]!.value).toBe(7500);
  });

  // --- Sankey: uncategorized transactions ---

  it("getSpendingSankeyInternal falls back to 'Other' for transactions without any category", async () => {
    await insertAccount("acc-other", "Cash");

    // Transaction with no category and no receipt
    await insertTransaction("txn-1", "acc-other", "2025-01-15", -2000, "Misc purchase", null);

    const result = await getSpendingSankeyInternal(userId, {});

    // Nodes: Cash, Other
    // Link: Cash → Other (20)
    // Uncategorized transactions still flow to "Other" as a top-level category
    expect(result.nodes).toHaveLength(2);
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames).toContain("Cash");
    expect(nodeNames).toContain("Other");

    expect(result.links).toHaveLength(1);
    expect(result.links[0].value).toBe(2000);
    expect(result.nodes[result.links[0].source].name).toBe("Cash");
    expect(result.nodes[result.links[0].target].name).toBe("Other");
  });

  // --- Sankey: multiple accounts ---

  it("getSpendingSankeyInternal correctly aggregates spending across multiple accounts", async () => {
    await insertAccount("acc-1", "Checking");

    await insertAccount("acc-2", "Credit Card");

    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    await insertCategory("cat-dining", "Dining", "#FF9800");

    // Checking: 50 to Groceries
    await insertTransaction("txn-1", "acc-1", "2025-01-15", -5000, "Grocery", "cat-groceries");

    // Credit Card: 80 to Groceries, 30 to Dining
    await insertTransaction("txn-2", "acc-2", "2025-01-16", -8000, "Supermarket", "cat-groceries");

    await insertTransaction("txn-3", "acc-2", "2025-01-17", -3000, "Restaurant", "cat-dining");

    const result = await getSpendingSankeyInternal(userId, {});

    // Nodes: Checking(0), Credit Card(1), Groceries(2), Dining(3), Groceries-copy(4), Dining-copy(5)
    // Each category gets its own 3rd-level node
    expect(result.nodes).toHaveLength(6);

    // Checking → Groceries: 50
    const checkToGroc = result.links.find((l) => l.source === 0 && l.target === 2);
    expect(checkToGroc!.value).toBe(5000);

    // Credit Card → Groceries: 80
    const ccToGroc = result.links.find((l) => l.source === 1 && l.target === 2);
    expect(ccToGroc!.value).toBe(8000);

    // Credit Card → Dining: 30
    const ccToDining = result.links.find((l) => l.source === 1 && l.target === 3);
    expect(ccToDining!.value).toBe(3000);

    // Groceries → Groceries: 130 (50 + 80, 3rd level node)
    const grocToGroc = result.links.filter(
      (l) =>
        result.nodes[l.source].name === "Groceries" &&
        result.nodes[l.target].name === "Groceries" &&
        l.source !== l.target,
    );
    expect(grocToGroc).toHaveLength(1);
    expect(grocToGroc[0]!.value).toBe(13000);

    // Dining → Dining: 30 (3rd level node)
    const diningToDining = result.links.filter(
      (l) =>
        result.nodes[l.source].name === "Dining" &&
        result.nodes[l.target].name === "Dining" &&
        l.source !== l.target,
    );
    expect(diningToDining).toHaveLength(1);
    expect(diningToDining[0]!.value).toBe(3000);
  });

  // --- Sankey: receipt with partial categorization ---

  it("getSpendingSankeyInternal handles receipts with some items categorized and some not", async () => {
    await insertAccount("acc-partial", "Debit");

    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    await insertCategory("cat-alcohol", "Alcohol", "#AB47BC", "cat-groceries");

    await insertCategory("cat-dairy", "Dairy", "#2196F3", "cat-groceries");

    // Transaction: 90 PLN with receipt
    // Receipt items: Alcohol (30), Dairy (20), Uncategorized (40)
    await insertTransaction("txn-1", "acc-partial", "2025-01-15", -9000, "Grocery store", "cat-groceries");

    await insertReceipt("rcpt-1", "txn-1");

    await insertReceiptItem("ri-1", "rcpt-1", "Beer", 3000, "cat-alcohol");

    await insertReceiptItem("ri-2", "rcpt-1", "Milk", 2000, "cat-dairy");

    await insertReceiptItem("ri-3", "rcpt-1", "Misc", 4000, null); // Uncategorized item

    const result = await getSpendingSankeyInternal(userId, {});

    // Nodes: Debit(0), Groceries(1), Alcohol(2), Dairy(3), Groceries-copy(4)
    // Uncategorized receipt item uses parent category name as subcategory
    expect(result.nodes).toHaveLength(5);

    // Debit → Groceries: 90
    const debitToGroc = result.links.find((l) => l.source === 0 && l.target === 1);
    expect(debitToGroc!.value).toBe(9000);

    // Groceries → Alcohol: 30
    const grocToAlc = result.links.find((l) => l.source === 1 && l.target === 2);
    expect(grocToAlc!.value).toBe(3000);

    // Groceries → Dairy: 20
    const grocToDairy = result.links.find((l) => l.source === 1 && l.target === 3);
    expect(grocToDairy!.value).toBe(2000);

    // Groceries → Groceries: 40 (uncategorized receipt item, 3rd level)
    const grocToGroc = result.links.filter(
      (l) =>
        result.nodes[l.source].name === "Groceries" &&
        result.nodes[l.target].name === "Groceries" &&
        l.source !== l.target,
    );
    expect(grocToGroc).toHaveLength(1);
    expect(grocToGroc[0]!.value).toBe(4000);

    // Balance check: 90 = 30 + 20 + 40 ✓
  });

  // --- Sankey: receipt items sum differs from transaction amount ---

  it("getSpendingSankeyInternal handles receipt items whose sum differs from transaction amount", async () => {
    await insertAccount("acc-mismatch", "Wallet");

    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    await insertCategory("cat-alcohol", "Alcohol", "#AB47BC", "cat-groceries");

    // Transaction: 100 PLN, but receipt items only sum to 80 (e.g., loyalty discount)
    await insertTransaction("txn-1", "acc-mismatch", "2025-01-15", -10000, "Grocery store", "cat-groceries");

    await insertReceipt("rcpt-1", "txn-1");

    await insertReceiptItem("ri-1", "rcpt-1", "Beer", 5000, "cat-alcohol");

    await insertReceiptItem("ri-2", "rcpt-1", "Snacks", 3000, null); // Uncategorized

    const result = await getSpendingSankeyInternal(userId, {});

    // Nodes: Wallet(0), Groceries(1), Alcohol(2), Groceries-copy(3)
    // Uncategorized item and delta both use parent category name
    expect(result.nodes).toHaveLength(4);

    // Wallet → Groceries: 100 (full transaction amount)
    const walletToGroc = result.links.find((l) => l.source === 0 && l.target === 1);
    expect(walletToGroc!.value).toBe(10000);

    // Groceries → Alcohol: 50 (from receipt item)
    const grocToAlc = result.links.find((l) => l.source === 1 && l.target === 2);
    expect(grocToAlc!.value).toBe(5000);

    // Groceries → Groceries: 50 (30 from uncategorized item + 20 delta, 3rd level)
    const grocToGroc = result.links.filter(
      (l) =>
        result.nodes[l.source].name === "Groceries" &&
        result.nodes[l.target].name === "Groceries" &&
        l.source !== l.target,
    );
    expect(grocToGroc).toHaveLength(1);
    expect(grocToGroc[0]!.value).toBe(5000);

    // Balance: 100 = 50 + 50 ✓
  });

  // --- Sankey: receipt items with direct subcategory transaction ---

  it("getSpendingSankeyInternal aggregates receipt item subcategories with direct subcategory transactions", async () => {
    await insertAccount("acc-mixed", "Main Account");

    // Groceries (top-level) → Alcohol, Vegetables (subcategories)
    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    await insertCategory("cat-alcohol", "Alcohol", "#AB47BC", "cat-groceries");

    await insertCategory("cat-vegetables", "Vegetables", "#66BB6A", "cat-groceries");

    // Transaction 1: -100, categorized to Groceries, WITH receipt
    // Receipt items: Alcohol (-50) + Vegetables (-50) = -100
    await insertTransaction("txn-1", "acc-mixed", "2025-01-15", -10000, "Grocery store", "cat-groceries");

    await insertReceipt("rcpt-1", "txn-1");

    await insertReceiptItem("ri-1", "rcpt-1", "Beer", 5000, "cat-alcohol");

    await insertReceiptItem("ri-2", "rcpt-1", "Carrots", 5000, "cat-vegetables");

    // Transaction 2: -20, categorized directly to Alcohol (subcategory of Groceries), NO receipt
    await insertTransaction("txn-2", "acc-mixed", "2025-01-20", -2000, "Bar", "cat-alcohol");

    const result = await getSpendingSankeyInternal(userId, {});

    // Nodes: Main Account, Groceries, Alcohol, Vegetables (4 total)
    // All spending has subcategory detail, no "Other" needed
    expect(result.nodes).toHaveLength(4);
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames).toContain("Main Account");
    expect(nodeNames).toContain("Groceries");
    expect(nodeNames).toContain("Alcohol");
    expect(nodeNames).toContain("Vegetables");

    // Balanced Sankey:
    // Main Account → Groceries: 120 (100 from receipt txn + 20 from direct Alcohol txn)
    // Groceries → Alcohol: 70 (50 from receipt item + 20 from direct subcategory txn)
    // Groceries → Vegetables: 50 (from receipt item)
    // Balance: 120 = 70 + 50 ✓
    expect(result.links).toHaveLength(3);

    const findLink = (from: string, to: string) =>
      result.links.find(
        (l) =>
          result.nodes[l.source].name === from &&
          result.nodes[l.target].name === to,
      );

    expect(findLink("Main Account", "Groceries")!.value).toBe(12000);
    expect(findLink("Groceries", "Alcohol")!.value).toBe(7000);
    expect(findLink("Groceries", "Vegetables")!.value).toBe(5000);
  });

  // --- Sankey: period filter ---

  it("getSpendingSankeyInternal respects date range filters", async () => {
    await insertAccount("acc-filter", "Main");

    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    // January transaction
    await insertTransaction("txn-1", "acc-filter", "2025-01-15", -5000, "Jan grocery", "cat-groceries");

    // February transaction
    await insertTransaction("txn-2", "acc-filter", "2025-02-15", -8000, "Feb grocery", "cat-groceries");

    // Filter to January only
    const result = await getSpendingSankeyInternal(userId, {
      from: "2025-01-01",
      to: "2025-01-31",
    });

    // Only January transaction should be included
    const mainToGroc = result.links.find((l) => l.source === 0 && l.target === 1);
    expect(mainToGroc!.value).toBe(5000);
  });

  // --- Sankey: account filter ---

  it("getSpendingSankeyInternal respects account filter", async () => {
    await insertAccount("acc-1", "Checking");

    await insertAccount("acc-2", "Savings");

    await insertCategory("cat-groceries", "Groceries", "#4CAF50");

    await insertTransaction("txn-1", "acc-1", "2025-01-15", -5000, "Checking purchase", "cat-groceries");

    await insertTransaction("txn-2", "acc-2", "2025-01-20", -8000, "Savings purchase", "cat-groceries");

    // Filter to Checking only
    const result = await getSpendingSankeyInternal(userId, { accountId: "acc-1" });

    // Only Checking account and its transaction
    expect(result.nodes).toHaveLength(3); // Checking, Groceries, Groceries-copy
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames).toContain("Checking");
    expect(nodeNames).toContain("Groceries");
    expect(nodeNames.filter((n) => n === "Groceries").length).toBe(2); // Level 2 and level 3

    const findLink = (from: string, to: string) =>
      result.links.find(
        (l) =>
          result.nodes[l.source].name === from &&
          result.nodes[l.target].name === to,
      );
    expect(findLink("Checking", "Groceries")!.value).toBe(5000);

    // Groceries → Groceries: 50 (3rd level node)
    const grocToGroc = result.links.filter(
      (l) =>
        result.nodes[l.source].name === "Groceries" &&
        result.nodes[l.target].name === "Groceries" &&
        l.source !== l.target,
    );
    expect(grocToGroc).toHaveLength(1);
    expect(grocToGroc[0]!.value).toBe(5000);
  });

  // --- Dashboard summary tests ---

  it("getDashboardSummaryInternal returns correct top categories", async () => {
    await insertAccount("acc-1", "Main");

    await insertCategory("cat-1", "Groceries", "#4CAF50");

    await insertCategory("cat-2", "Dining", "#FF9800");

    await insertCategory("cat-3", "Transport", "#2196F3");

    await insertTransaction("txn-1", "acc-1", "2025-01-15", -20000, "Groceries", "cat-1");

    await insertTransaction("txn-2", "acc-1", "2025-01-16", -15000, "Restaurant", "cat-2");

    await insertTransaction("txn-3", "acc-1", "2025-01-17", -10000, "Gas", "cat-3");

    await insertTransaction("txn-4", "acc-1", "2025-01-10", 300000, "Salary", null);

    const result = await getDashboardSummaryInternal(userId, {});

    expect(result.totalIncome).toBe(300000);
    expect(result.totalExpenses).toBe(45000);
    expect(result.net).toBe(255000);
    expect(result.topCategories).toHaveLength(3);
    expect(result.topCategories[0].categoryName).toBe("Groceries");
    expect(result.topCategories[0].totalSpent).toBe(20000);
    expect(result.topCategories[1].categoryName).toBe("Dining");
    expect(result.topCategories[1].totalSpent).toBe(15000);
  });

  it("getDashboardSummaryInternal returns zeros for empty data", async () => {
    await insertAccount("acc-empty", "Empty Account");

    const result = await getDashboardSummaryInternal(userId, {});

    expect(result.totalIncome).toBe(0);
    expect(result.totalExpenses).toBe(0);
    expect(result.net).toBe(0);
    expect(result.topCategories).toHaveLength(0);
  });
});
