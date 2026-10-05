import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "./fixtures";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) =>
  path.join(__dirname, "fixtures", "csv", name);

async function createAccount(page: Page, name: string) {
  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL("/accounts");
  await page.getByRole("button", { name: "Add Account" }).click();
  await page.getByLabel("Account Name").fill(name);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function importFile(page: Page, fileName: string, accountLabel: string) {
  await page.getByRole("link", { name: "Import" }).click();
  // Wait for upload section to be ready, then upload file
  await expect(page.getByRole("button", { name: "Choose File" })).toBeVisible();
  await page
    .locator('input[type="file"][accept=".csv"]')
    .setInputFiles(fixturePath(fileName));
  // Wait for the mapping step to render after the async server call completes
  await expect(page.getByRole("combobox", { name: "Date" })).toBeVisible();
  // Mapping → Account
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Choose account" })).toBeVisible();
  await page.getByRole("combobox", { name: "Account" }).selectOption({
    label: accountLabel,
  });
  // Account → Preview
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  // Preview → Summary
  await page.getByRole("button", { name: "Confirm Import" }).click();
  await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible();
}

test.describe("Import auto-categorization", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    await page.goto("/dashboard");
  });

  test("default rules categorize matching merchants on import", async ({
    page,
  }) => {
    await createAccount(page, "autocat-main");
    await importFile(page, "autocat-3rows.csv", "autocat-main (PLN)");

    // Verify summary counts: 3 imported, 2 matched by rules, 1 matched by AI, 0 uncategorized
    await expect(page.getByText(/3 new transactions imported/)).toBeVisible();
    await expect(page.getByText(/2 matched by rules/)).toBeVisible();
    await expect(page.getByText(/1 matched by AI/)).toBeVisible();
    await expect(page.getByText(/0 uncategorized/)).toBeVisible();

    await page.getByRole("link", { name: "View transactions" }).click();
    const table = page.getByRole("table");
    const biedronkaRow = table
      .getByRole("row")
      .filter({ hasText: "BIEDRONKA" });
    await expect(biedronkaRow).toContainText("Groceries");
    const orlenRow = table.getByRole("row").filter({ hasText: "ORLEN" });
    await expect(orlenRow).toContainText("Fuel");
  });

  test("unmatched rows are categorized by AI fallback and visible via the filter", async ({
    page,
  }) => {
    await createAccount(page, "autocat-ai-account");
    await importFile(page, "autocat-3rows.csv", "autocat-ai-account (PLN)");

    await page.getByRole("link", { name: "View transactions" }).click();

    // The "unknown merchant" row is not matched by any rule, so AI fallback
    // categorizes it. Verify it's visible and not in the rule-matched categories.
    const table = page.getByRole("table");
    await expect(table.getByText("Some unknown merchant")).toBeVisible();
    await expect(table.getByText("BIEDRONKA")).toBeVisible();
    await expect(table.getByText("ORLEN")).toBeVisible();

    // The unknown merchant row should not have a Groceries or Fuel category
    // (those are rule-categorized). It gets an AI-assigned category instead.
    const unknownRow = table
      .getByRole("row")
      .filter({ hasText: "Some unknown merchant" });
    await expect(unknownRow).not.toContainText("Groceries");
    await expect(unknownRow).not.toContainText("Fuel");
  });

  test("priority order is respected — higher-priority rule wins", async ({
    page,
  }) => {
    await createAccount(page, "autocat-priority-account");

    // Wire a higher-priority rule: "Biedronka" → "Snacks & Sweets" with
    // priority 1 (default rules are at 100, so this beats them).
    const res = await page.request.post("/test-add-rule", {
      data: {
        pattern: "Biedronka",
        categoryName: "Snacks & Sweets",
        priority: 1,
      },
    });
    expect(res.ok()).toBe(true);

    await importFile(page, "autocat-biedronka.csv", "autocat-priority-account (PLN)");

    await page.getByRole("link", { name: "View transactions" }).click();
    const table = page.getByRole("table");
    const biedronkaRow = table
      .getByRole("row")
      .filter({ hasText: "BIEDRONKA" });
    await expect(biedronkaRow).toContainText("Snacks & Sweets");
    await expect(biedronkaRow).not.toContainText("Groceries");
  });
});
