import { test, expect } from "./fixtures";


test.describe("Import upload limits", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    await page.goto("/import");
    await expect(
      page.getByRole("heading", { name: "Import", exact: true }),
    ).toBeVisible();
  });

  test("rejects a CSV with too many rows", async ({ page }) => {
    const header = "Date,Amount,Description\n";
    const row = "2025-01-15,-12.34,Row over the limit\n";
    const csv = header + row.repeat(10_001);

    await page.getByTestId("file-input").setInputFiles({
      name: "too-many-rows.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    await expect(page.getByText(/too many rows/i)).toBeVisible();
    // Import does not advance past the upload step.
    await expect(page.getByTestId("file-input")).toBeAttached();
  });

  test("rejects an oversized import file", async ({ page }) => {
    // 5MB + padding of valid CSV-ish content.
    const header = "Date,Amount,Description\n";
    const filler = "x".repeat(1024);
    const csv = header + `2025-01-15,-1.00,"${filler}"\n`.repeat(5 * 1024 + 16);

    await page.getByTestId("file-input").setInputFiles({
      name: "oversized.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    await expect(page.getByText(/exceeds 5MB limit/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("file-input")).toBeAttached();
  });
});
