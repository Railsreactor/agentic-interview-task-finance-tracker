import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "./fixtures";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) =>
  path.join(__dirname, "fixtures", "csv", name);

async function createAccount(page: Page, name: string) {
  await page.getByRole("link", { name: "Accounts" }).click();
  await page.getByRole("button", { name: "Add Account" }).click();
  await page.getByLabel("Account Name").fill(name);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(
    page.getByRole("heading", { name: "New Account" }),
  ).toBeHidden();
}

async function importCsv(page: Page, fileName: string, accountLabel: string) {
  await page.goto("/import");
  await page.getByTestId("file-input").setInputFiles(fixturePath(fileName));
  await page.getByTestId("continue-to-account").click();
  await page
    .getByRole("combobox", { name: "Account" })
    .selectOption({ label: accountLabel });
  await page.getByTestId("continue-to-preview").click();
  await page.getByRole("button", { name: "Confirm Import" }).click();
  await expect(page.getByTestId("import-summary")).toBeVisible();
}

async function gotoImport(page: Page) {
  await page.goto("/import");
}

test.describe("CSV import history & undo", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    // These tests use 3 accounts (seeded Main + 2 created), above the free
    // plan's limit — run them as a Pro user. Free-limit gating is covered in
    // billing.spec.ts.
    await page.request.post("/test-set-plan?plan=pro");
    await page.goto("/dashboard");
  });

  test("history lists imports in newest-first order", async ({ page }) => {
    await createAccount(page, "Main");
    await createAccount(page, "Backup");

    await importCsv(page, "generic-3rows.csv", "Main (PLN)");
    await importCsv(page, "generic-overlap.csv", "Backup (PLN)");

    await gotoImport(page);
    const rows = page.getByTestId("import-history-row");
    await expect(rows).toHaveCount(2);

    // Newest first: the second import (generic-overlap.csv into Backup).
    const first = rows.nth(0);
    await expect(first.locator('[data-field="filename"]')).toHaveText(
      "generic-overlap.csv",
    );
    await expect(first.locator('[data-field="account"]')).toHaveText("Backup");
    await expect(first.locator('[data-field="count"]')).toHaveText("4");

    const second = rows.nth(1);
    await expect(second.locator('[data-field="filename"]')).toHaveText(
      "generic-3rows.csv",
    );
    await expect(second.locator('[data-field="account"]')).toHaveText("Main");
    await expect(second.locator('[data-field="count"]')).toHaveText("3");
  });

  test("undoing an import removes its transactions", async ({ page }) => {
    await createAccount(page, "Main");
    await createAccount(page, "Backup");

    await importCsv(page, "generic-3rows.csv", "Main (PLN)");
    await importCsv(page, "generic-overlap.csv", "Backup (PLN)");

    await gotoImport(page);
    // Undo the older Main import (generic-3rows.csv).
    const targetRow = page
      .getByTestId("import-history-row")
      .filter({ hasText: "generic-3rows.csv" });
    await targetRow.getByTestId("undo-import").click();

    await expect(page.getByTestId("undo-confirm")).toBeVisible();
    await expect(page.getByTestId("undo-confirm")).toContainText("3 transaction(s)");
    await page.getByTestId("undo-confirm-button").click();

    // The undone batch is gone; the other one remains.
    await expect(page.getByTestId("undo-confirm")).toBeHidden();
    const rows = page.getByTestId("import-history-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('[data-field="filename"]')).toHaveText(
      "generic-overlap.csv",
    );

    // Transactions page now shows only the 4 rows from the other batch.
    await page.getByRole("link", { name: "Transactions", exact: true }).click();
    const table = page.getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(4 + 1);
    // Rows from the deleted Main batch are gone.
    await expect(table.getByText("January salary")).toBeHidden();
    // Rows from the surviving Backup batch are still there.
    await expect(table.getByText("Lunch")).toBeVisible();
    await expect(table.getByText("Dinner")).toBeVisible();
  });

  test("undo confirmation can be cancelled", async ({ page }) => {
    await createAccount(page, "Main");

    await importCsv(page, "generic-3rows.csv", "Main (PLN)");

    await gotoImport(page);
    await page.getByTestId("undo-import").click();

    await expect(page.getByTestId("undo-confirm")).toBeVisible();
    await page.getByTestId("undo-cancel").click();
    await expect(page.getByTestId("undo-confirm")).toBeHidden();

    // Batch is still in history.
    await expect(page.getByTestId("import-history-row")).toHaveCount(1);

    // Transactions are still present.
    await page.getByRole("link", { name: "Transactions", exact: true }).click();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(3 + 1);
  });

  test("re-importing after undo is not blocked by stale dedup", async ({
    page,
  }) => {
    await createAccount(page, "Main");

    await importCsv(page, "generic-3rows.csv", "Main (PLN)");
    // Sanity: re-import without undo would dedup all 3.
    await importCsv(page, "generic-3rows.csv", "Main (PLN)");
    await expect(page.getByTestId("import-summary")).toContainText(
      "0 new transactions imported",
    );
    await expect(page.getByTestId("import-summary")).toContainText("3 duplicates");

    // Undo the only batch (the second import was a no-op so it didn't create one).
    await gotoImport(page);
    await expect(page.getByTestId("import-history-row")).toHaveCount(1);
    await page.getByTestId("undo-import").click();
    await page.getByTestId("undo-confirm-button").click();
    await expect(page.getByTestId("undo-confirm")).toBeHidden();
    await expect(page.getByTestId("import-history-row")).toHaveCount(0);

    // Re-importing the same file now produces 3 fresh imports.
    await importCsv(page, "generic-3rows.csv", "Main (PLN)");
    await expect(page.getByTestId("import-summary")).toContainText(
      "3 new transactions imported",
    );
    await expect(page.getByTestId("import-summary")).toContainText("0 duplicates");
  });
});
