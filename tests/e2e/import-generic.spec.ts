import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "./fixtures";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) =>
  path.join(__dirname, "fixtures", "csv", name);

async function createAccount(page: Page, name: string) {
  await page.getByRole("link", { name: "Accounts" }).click();
  await page.getByRole("button", { name: "Add Account" }).click();
  // Wait for the dialog to appear (rise-in animation starts at opacity: 0)
  await expect(
    page.getByRole("textbox", { name: /Account Name/i }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: /Account Name/i }).fill(name);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(
    page.getByRole("heading", { name: "Add Account" }),
  ).toBeHidden();
}

async function uploadFile(page: Page, fileName: string) {
  await page.getByTestId("file-input").setInputFiles(fixturePath(fileName));
}

test.describe("Generic CSV import", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    await page.goto("/dashboard");
  });

  test("import page is reachable from the sidebar", async ({ page }) => {
    await page.getByRole("link", { name: "Import" }).click();
    await expect(page).toHaveURL("/import");
    await expect(
      page.getByRole("heading", { name: "Import", exact: true }),
    ).toBeVisible();
  });

  test("imports a generic CSV end-to-end", async ({ page }) => {
    await createAccount(page, "Main");
    await page.getByRole("link", { name: "Import" }).click();

    await uploadFile(page, "generic-3rows.csv");

    // Mapping step — auto-detected for headers Date/Amount/Description.
    await expect(page.getByRole("combobox", { name: "Date" })).toHaveValue(
      "Date",
    );
    await expect(page.getByRole("combobox", { name: "Amount" })).toHaveValue(
      "Amount",
    );
    await expect(
      page.getByRole("combobox", { name: "Description" }),
    ).toHaveValue("Description");

    await page.getByTestId("continue-to-account").click();

    // Account step.
    await page.getByRole("combobox", { name: "Account" }).selectOption({
      label: "Main (PLN)",
    });
    await page.getByTestId("continue-to-preview").click();

    // Preview step — 3 rows visible.
    await expect(page.getByTestId("preview-row")).toHaveCount(3);
    await page.getByRole("button", { name: "Confirm Import" }).click();

    // Wait for categorizing to complete and summary to appear.
    await expect(page.getByTestId("import-summary")).toBeVisible();
    const summary = page.getByTestId("import-summary");
    await expect(summary).toContainText("3");
    await expect(summary).toContainText("0 duplicates");
    await expect(summary).toContainText("0 errors");

    // Verify rows on the Transactions page.
    await page.getByRole("link", { name: "View transactions" }).click();
    await expect(page).toHaveURL("/transactions");
    const table = page.getByRole("table");
    await expect(table.getByText("Coffee shop")).toBeVisible();
    await expect(table.getByText("Grocery shopping")).toBeVisible();
    await expect(table.getByText("January salary")).toBeVisible();
    await expect(table.getByText("− 25.50")).toBeVisible();
    await expect(table.getByText("+ 3000.00")).toBeVisible();
  });

  test("preview reflects the chosen column mapping", async ({ page }) => {
    await createAccount(page, "Main");
    await page.getByRole("link", { name: "Import" }).click();

    await uploadFile(page, "generic-altcols.csv");

    // Mapping → Account → Preview with the auto-guessed mapping.
    await page.getByTestId("continue-to-account").click();
    await page.getByRole("combobox", { name: "Account" }).selectOption({
      label: "Main (PLN)",
    });
    await page.getByTestId("continue-to-preview").click();

    const firstRow = page.getByTestId("preview-row").first();
    await expect(firstRow.locator('[data-field="amount"]')).toContainText(
      "-25.50",
    );

    // Switch the amount mapping to FeeAmount and verify preview updates.
    await page.getByRole("button", { name: "Back" }).click(); // preview → account
    await page.getByRole("button", { name: "Back" }).click(); // account → mapping
    await page
      .getByRole("combobox", { name: "Amount" })
      .selectOption("FeeAmount");
    await page.getByTestId("continue-to-account").click();
    await page.getByTestId("continue-to-preview").click();

    const updatedFirstRow = page.getByTestId("preview-row").first();
    await expect(
      updatedFirstRow.locator('[data-field="amount"]'),
    ).toContainText("-1.00");
  });

  test("required-field validation blocks confirm", async ({ page }) => {
    await createAccount(page, "Main");
    await page.getByRole("link", { name: "Import" }).click();

    await uploadFile(page, "generic-3rows.csv");

    // Clear the date mapping; Continue should be disabled and an error shown.
    await page.getByRole("combobox", { name: "Date" }).selectOption("");
    await expect(
      page.getByTestId("mapping-required-error"),
    ).toBeVisible();
    await expect(page.getByTestId("continue-to-account")).toBeDisabled();
  });

  test("imported transactions carry source = csv_import", async ({ page }) => {
    await createAccount(page, "Main");
    await page.getByRole("link", { name: "Import" }).click();

    await uploadFile(page, "generic-3rows.csv");
    await page.getByTestId("continue-to-account").click();
    await page.getByRole("combobox", { name: "Account" }).selectOption({
      label: "Main (PLN)",
    });
    await page.getByTestId("continue-to-preview").click();
    await page.getByRole("button", { name: "Confirm Import" }).click();
    await expect(page.getByTestId("import-summary")).toBeVisible();

    await page.getByRole("link", { name: "View transactions" }).click();
    const importedRows = page
      .getByRole("table")
      .locator('[data-source="csv_import"]');
    await expect(importedRows).toHaveCount(3);
  });

  test("inline-create a new account during import", async ({ page }) => {
    await page.getByRole("link", { name: "Import" }).click();

    await uploadFile(page, "generic-3rows.csv");
    await page.getByTestId("continue-to-account").click();

    // Pick "Create new account" from the dropdown to open the inline modal.
    await page
      .getByRole("combobox", { name: "Account" })
      .selectOption("__new__");
    await expect(
      page.getByRole("heading", { name: "New Account" }),
    ).toBeVisible();
    await page.getByLabel("Account Name").fill("Imported");
    await page.getByRole("button", { name: "Create Account" }).click();

    // The new account is selected automatically.
    await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue(
      /.+/,
    );
    await page.getByTestId("continue-to-preview").click();
    await page.getByRole("button", { name: "Confirm Import" }).click();
    await expect(page.getByTestId("import-summary")).toContainText("3");

    await page.getByRole("link", { name: "View transactions" }).click();
    const table = page.getByRole("table");
    await expect(table.getByText("Coffee shop")).toBeVisible();
    // The new account "Imported" appears in the account column of every row.
    await expect(table.getByText("Imported")).toHaveCount(3);
  });
});
