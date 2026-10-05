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

test.describe("PKO BP CSV import", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    await page.goto("/dashboard");
  });

  test("pko file is auto-detected and skips column mapping", async ({ page }) => {
    await createAccount(page, "Main");
    await page.getByRole("link", { name: "Import" }).click();

    await uploadFile(page, "pko-sample.csv");

    // No mapping step — banner appears on the account step.
    await expect(page.getByTestId("format-banner")).toContainText("PKO BP");
    await expect(page.getByRole("heading", { name: "Choose account" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeHidden();

    await page.getByRole("combobox", { name: "Account" }).selectOption({
      label: "Main (PLN)",
    });
    await page.getByTestId("continue-to-preview").click();

    await expect(page.getByTestId("preview-row")).toHaveCount(3);
  });

  test("pko rows are parsed with cleaned descriptions", async ({ page }) => {
    await createAccount(page, "Main");
    await page.getByRole("link", { name: "Import" }).click();

    await uploadFile(page, "pko-sample.csv");
    await page.getByRole("combobox", { name: "Account" }).selectOption({
      label: "Main (PLN)",
    });
    await page.getByTestId("continue-to-preview").click();

    const firstRow = page.getByTestId("preview-row").first();
    await expect(firstRow.locator('[data-field="description"]')).toContainText(
      "ZABKA Z8052 K.1 WROCLAW",
    );
    await expect(firstRow.locator('[data-field="amount"]')).toContainText(
      "-33.96",
    );
    await expect(firstRow.locator('[data-field="date"]')).toContainText(
      "2026-03-01",
    );

    // Confirm import then check the cleaned description on the Transactions page.
    await page.getByRole("button", { name: "Confirm Import" }).click();
    await expect(page.getByTestId("import-summary")).toContainText("3");
    await page.getByRole("link", { name: "View transactions" }).click();
    const table = page.getByRole("table");
    await expect(table.getByText("ZABKA Z8052 K.1 WROCLAW")).toBeVisible();
    await expect(table.getByText("AUCHAN WROCLAW HUBSKA WROCLAW")).toBeVisible();
    await expect(table.getByText("Wynagrodzenie marzec")).toBeVisible();
  });

  test("windows-1250 polish characters render without mojibake", async ({ page }) => {
    await page.getByRole("link", { name: "Import" }).click();
    await uploadFile(page, "pko-sample.csv");

    // Banner is still pure ASCII; the encoding test is that no descriptions
    // contain the typical mojibake replacement chars (e.g. Ã/Â/¿).
    await page.getByRole("combobox", { name: "Account" }).selectOption("__new__");
    await page.getByLabel("Account Name").fill("PKO");
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByTestId("continue-to-preview").click();

    const allDescriptions = await page
      .getByTestId("preview-row")
      .locator('[data-field="description"]')
      .allTextContents();
    expect(allDescriptions.join("|")).not.toMatch(/[�ÂÃ]/);
    // The merchant lines came from the Lokalizacja field; assert they survived
    // round-tripping through the Windows-1250 → string → server pipeline.
    expect(allDescriptions.some((d) => d.includes("ZABKA"))).toBe(true);
    expect(allDescriptions.some((d) => d.includes("AUCHAN"))).toBe(true);
  });

  test("user can fall back to generic mapping", async ({ page }) => {
    await createAccount(page, "Main");
    await page.getByRole("link", { name: "Import" }).click();

    await uploadFile(page, "pko-sample.csv");
    await expect(page.getByTestId("format-banner")).toBeVisible();

    await page.getByTestId("use-generic-mapping").click();

    // Mapping step is now visible.
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
    await expect(page.getByTestId("generic-fallback-hint")).toBeVisible();

    // The PKO header has columns we can map: Data operacji, Kwota, Opis transakcji.
    await page
      .getByRole("combobox", { name: "Date" })
      .selectOption("Data operacji");
    await page.getByRole("combobox", { name: "Amount" }).selectOption("Kwota");
    await page
      .getByRole("combobox", { name: "Description" })
      .selectOption("Opis transakcji");

    await page.getByTestId("continue-to-account").click();
    await page.getByRole("combobox", { name: "Account" }).selectOption({
      label: "Main (PLN)",
    });
    await page.getByTestId("continue-to-preview").click();

    // Generic mapping does not strip the "Tytuł:"/"Lokalizacja:" prefixes —
    // the description is just the contents of the "Opis transakcji" column.
    // The transaction reference number from the raw Tytuł field appears here
    // but would not appear in a cleaned PKO description.
    await expect(page.getByTestId("preview-row")).toHaveCount(3);
    const firstDesc = page
      .getByTestId("preview-row")
      .first()
      .locator('[data-field="description"]');
    await expect(firstDesc).toContainText("000498849");
  });
});
