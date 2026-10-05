import { test, expect, type Page } from "./fixtures";


async function createAccount(page: Page, name: string) {
  await page.getByRole("link", { name: "Accounts" }).click();
  await page.getByRole("button", { name: "Add Account" }).click();
  await page
    .getByRole("textbox", { name: /Account Name/i })
    .first()
    .fill(name);
  await page.getByRole("button", { name: "Create Account" }).first().click();
  await expect(page.getByText(name)).toBeVisible();
}

async function createCategory(page: Page, name: string) {
  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByRole("textbox", { name: /Name/i }).fill(name);
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(
    page.getByRole("heading", { name: "Create Category" }),
  ).toBeHidden();
}

async function uploadAndImport(
  page: Page,
  csvContent: string,
  accountName: string,
  fileName = "test.csv",
) {
  await page.getByRole("link", { name: "Import" }).click();

  // File input is sr-only (visually hidden), so we set files directly on the
  // input element rather than clicking the "Choose File" label.
  await page
    .locator('input[type="file"][accept=".csv"]')
    .setInputFiles({
      name: fileName,
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

  // Wait for the mapping step to render after the async server call completes
  await expect(page.getByRole("combobox", { name: "Date" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByRole("combobox", { name: "Account" })
    .selectOption({ label: `${accountName} (PLN)` });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Confirm Import" }).click();
  await expect(page.getByText(/new transactions imported/)).toBeVisible();
}

test.describe("AI Fallback Categorization", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    await page.goto("/dashboard");
  });

  test("AI fills in categories that no rule matched", async ({ page }) => {
    await createAccount(page, "ai-fallback-account");
    await createCategory(page, "Entertainment");
    await createCategory(page, "Cafe");

    await uploadAndImport(
      page,
      "date,amount,description\n2024-01-15,15.99,NETFLIX.COM TRANSACTION",
      "ai-fallback-account",
    );

    await expect(page.getByText("1 matched by AI")).toBeVisible();

    await page.getByRole("link", { name: "View transactions" }).click();
    await page.waitForURL("/transactions");

    const row = page
      .getByRole("table")
      .getByRole("row")
      .filter({ hasText: "NETFLIX" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Entertainment");
  });

  test("AI suggestion creates a persistent rule", async ({ page }) => {
    await createAccount(page, "ai-rule-account");
    await createCategory(page, "Entertainment");
    await createCategory(page, "Cafe");

    await uploadAndImport(
      page,
      "date,amount,description\n2024-01-15,15.99,NETFLIX.COM TRANSACTION",
      "ai-rule-account",
    );

    await page.getByRole("link", { name: "Categorization" }).click();
    await page.waitForURL("/categorization");

    const aiRule = page
      .getByRole("table", { name: "Categorization rules" })
      .getByRole("row")
      .filter({ hasText: "NETFLIX" });
    await expect(aiRule).toBeVisible();
    await expect(aiRule.getByText("AI", { exact: true })).toBeVisible();
  });

  test("Subsequent identical rows match the new rule, not the AI", async ({
    page,
  }) => {
    await createAccount(page, "ai-rule-reuse-account");
    await createCategory(page, "Entertainment");
    await createCategory(page, "Cafe");

    // First import — no rules exist, so AI categorizes the row.
    await uploadAndImport(
      page,
      "date,amount,description\n2024-01-15,15.99,NETFLIX.COM TRANSACTION",
      "ai-rule-reuse-account",
    );

    await expect(page.getByText("1 matched by AI")).toBeVisible();
    await expect(page.getByText("0 matched by rules")).toBeVisible();

    // Second import — the AI-created rule now matches, skipping the AI call.
    await page.getByRole("button", { name: "Import another file" }).click();

    await uploadAndImport(
      page,
      "date,amount,description\n2024-01-16,19.99,NETFLIX.COM NEW CHARGE",
      "ai-rule-reuse-account",
      "test2.csv",
    );

    await expect(page.getByText("1 matched by rules")).toBeVisible();
    await expect(page.getByText("0 matched by AI")).toBeVisible();
  });
});
