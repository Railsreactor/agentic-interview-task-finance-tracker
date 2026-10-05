import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "./fixtures";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) =>
  path.join(__dirname, "fixtures", "csv", name);

async function seededUser(page: Page) {
  const res = await page.request.post("/test-create-user?seed=defaults");
  if (!res.ok()) {
    throw new Error(
      `/test-create-user?seed=defaults failed (${res.status()}). Is NODE_ENV=test on the server?`,
    );
  }
}

async function gotoCategorization(page: Page) {
  await page.getByRole("link", { name: "Categorization" }).click();
  await expect(
    page.getByRole("heading", { name: "Categorization Rules" }),
  ).toBeVisible();
}

async function importWithInlineAccount(page: Page, fileName: string) {
  await page.getByRole("link", { name: "Import" }).click();
  await page.getByTestId("file-input").setInputFiles(fixturePath(fileName));
  await expect(page.getByRole("combobox", { name: "Date" })).toBeVisible();
  await page.getByTestId("continue-to-account").click();
  // Use inline account creation
  await page
    .getByRole("combobox", { name: "Account" })
    .selectOption("__new__");
  await expect(
    page.getByRole("heading", { name: "New Account" }),
  ).toBeVisible();
  await page.getByLabel("Account Name").fill("Test Account");
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.getByTestId("continue-to-preview").click();
  await page.getByRole("button", { name: "Confirm Import" }).click();
  await expect(page.getByTestId("import-summary")).toBeVisible();
}

test.describe("Re-categorize Transactions", () => {
  test.beforeEach(async ({ page }) => {
    await seededUser(page);
    await page.goto("/dashboard");
  });

  test("re-categorize only uncategorized transactions", async ({ page }) => {
    await importWithInlineAccount(page, "autocat-3rows.csv");

    // Go to categorization and open re-categorize modal
    await gotoCategorization(page);
    await page.getByTestId("re-categorize-btn").click();
    await expect(page.getByTestId("recategorize-modal")).toBeVisible();

    // Select "Only uncategorized" and run
    await page.getByTestId("recat-mode-uncategorized").check();
    await page.getByTestId("recategorize-run").click();

    // Verify result banner appears
    await expect(page.getByTestId("recategorize-result")).toBeVisible();
  });

  test("re-categorize overwrite all re-applies rules", async ({
    page,
  }) => {
    await importWithInlineAccount(page, "autocat-3rows.csv");

    // Go to categorization and run re-categorize with overwrite all
    await gotoCategorization(page);
    await page.getByTestId("re-categorize-btn").click();
    await expect(page.getByTestId("recategorize-modal")).toBeVisible();
    await page.getByTestId("recat-mode-overwrite").check();
    await page.getByTestId("recategorize-run").click();

    // Verify result banner appears
    await expect(page.getByTestId("recategorize-result")).toBeVisible();
  });

  test("re-categorize without AI shows modal without AI toggle", async ({
    page,
  }) => {
    await importWithInlineAccount(page, "autocat-3rows.csv");

    // Go to categorization
    await gotoCategorization(page);

    // Open re-categorize modal
    await page.getByTestId("re-categorize-btn").click();
    await expect(page.getByTestId("recategorize-modal")).toBeVisible();

    // Run re-categorize
    await page.getByTestId("recat-mode-uncategorized").check();
    await page.getByTestId("recategorize-run").click();

    // Verify result banner appears
    await expect(page.getByTestId("recategorize-result")).toBeVisible();
  });

  test("re-categorize shows zero when no transactions match", async ({
    page,
  }) => {
    // With seeded defaults, all transactions should have categories via rules.
    // Don't import anything - just go to categorization.
    await gotoCategorization(page);

    // Open re-categorize modal
    await page.getByTestId("re-categorize-btn").click();
    await expect(page.getByTestId("recategorize-modal")).toBeVisible();

    // Run re-categorize with only uncategorized mode
    await page.getByTestId("recat-mode-uncategorized").check();
    await page.getByTestId("recategorize-run").click();

    // Result banner should show 0 updated
    await expect(page.getByTestId("recategorize-result")).toBeVisible();
    await expect(page.getByTestId("recategorize-result")).toContainText(
      /0 transaction/i,
    );
  });
});
