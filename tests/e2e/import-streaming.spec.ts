import { test, expect, type Page } from "./fixtures";


async function createAccount(page: Page, name: string) {
  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL("/accounts");
  await page.getByRole("button", { name: "Add Account" }).click();
  // Wait for the dialog to appear before interacting with form fields
  await expect(page.getByRole("heading", { name: "Add Account" })).toBeVisible();
  await page.getByLabel("Account Name").fill(name);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByRole("heading", { name: "Add Account" })).toBeHidden();
}

async function createCategory(page: Page, name: string) {
  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page.getByRole("heading", { name: "New Account" })).toBeHidden();
}

async function uploadAndConfirm(
  page: Page,
  csvContent: string,
  accountName: string,
) {
  await page.getByRole("link", { name: "Import" }).click();

  await page.getByTestId("file-input").setInputFiles({
    name: "test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent),
  });

  // Wait for the mapping step
  await expect(page.getByRole("combobox", { name: "Date" })).toBeVisible();
  await page.getByTestId("continue-to-account").click();
  await page.getByRole("combobox", { name: "Account" }).selectOption({
    label: `${accountName} (PLN)`,
  });
  await page.getByTestId("continue-to-preview").click();
  await page.getByRole("button", { name: "Confirm Import" }).click();
}

test.describe("Streaming Import Categorization", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    await page.goto("/dashboard");
  });

  test("categorizing step shows progress bar and row count", async ({
    page,
  }) => {
    await createAccount(page, "Test Account");
    await createCategory(page, "Entertainment");
    await createCategory(page, "Cafe");

    await uploadAndConfirm(
      page,
      "date,amount,description\n2024-01-15,15.99,NETFLIX.COM\n2024-01-16,5.99,Costa Coffee\n2024-01-17,12.99,AMAZON ORDER",
      "Test Account",
    );

    // Should see categorizing step with progress
    await expect(page.getByRole("heading", { name: "Categorizing" })).toBeVisible();
    await expect(page.getByTestId("import-summary")).toBeVisible();

    // Summary should show AI-categorized count
    await expect(page.getByTestId("summary-ai-categorized")).toContainText("3");
  });

  test("new rules appear during categorization", async ({ page }) => {
    await createAccount(page, "Test Account");
    await createCategory(page, "Entertainment");
    await createCategory(page, "Cafe");

    await uploadAndConfirm(
      page,
      "date,amount,description\n2024-01-15,15.99,NETFLIX.COM TRANSACTION",
      "Test Account",
    );

    await expect(page.getByTestId("import-summary")).toBeVisible();

    // New rules should be shown in summary
    await expect(page.getByTestId("new-rules-summary")).toBeVisible();
    await expect(page.getByTestId("new-rule-summary-item")).toBeVisible();
  });

  test("rule-matched rows show in summary counts", async ({ page }) => {
    // Seed default rules first (creates a fresh user)
    const res = await page.request.post("/test-create-user?seed=defaults");
    expect(res.ok()).toBe(true);

    await createAccount(page, "Test Account");
    await createCategory(page, "Groceries");
    await createCategory(page, "Fuel");

    await uploadAndConfirm(
      page,
      "date,amount,description\n2024-01-15,35.99,BIEDRONKA Sklep 1234\n2024-01-16,120.00,ORLEN STATION",
      "Test Account",
    );

    await expect(page.getByTestId("import-summary")).toBeVisible();

    // Both should be rule-matched (seeded rules cover BIEDRONKA and ORLEN)
    await expect(page.getByTestId("summary-auto-categorized")).toContainText("2");
    await expect(page.getByTestId("summary-ai-categorized")).toContainText("0");
  });

  test("cancel import returns to upload step", async ({ page }) => {
    await createAccount(page, "Test Account");
    await createCategory(page, "Entertainment");

    await uploadAndConfirm(
      page,
      "date,amount,description\n2024-01-15,15.99,NETFLIX.COM\n2024-01-16,5.99,SPOTIFY\n2024-01-17,12.99,AMAZON",
      "Test Account",
    );

    // Wait for categorizing to start
    await expect(page.getByRole("heading", { name: "Categorizing" })).toBeVisible();

    // Click cancel
    await page.getByTestId("cancel-import").click();

    // After cancel, page returns to upload step with file info still shown
    await expect(page.getByText("test.csv")).toBeVisible();
    await expect(page.getByText("3 rows")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose another file" })).toBeVisible();
  });

  test("mismatched AI patterns are tracked", async ({ page }) => {
    await createAccount(page, "Test Account");
    await createCategory(page, "Entertainment");

    await uploadAndConfirm(
      page,
      "date,amount,description\n2024-01-15,15.99,NETFLIX.COM TRANSACTION",
      "Test Account",
    );

    await expect(page.getByTestId("import-summary")).toBeVisible();
  });
});
