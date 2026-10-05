import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./fixtures";

//
// Quota accounting drives these tests: each fixture user starts with a fresh
// monthly allowance (default 10 scans), and /test-seed-ai-usage backfills
// usage rows so exhaustion can be tested without performing 10 real scans.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const receiptImage = path.join(
  __dirname,
  "fixtures",
  "images",
  "receipt-test.png",
);

test.describe("AI scan quota", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    await page.goto("/receipts/scan");
  });

  test("shows the monthly usage counter and increments it after a scan", async ({
    page,
  }) => {
    await expect(page.getByTestId("scan-usage")).toHaveText(
      /0 of \d+ scans used this month/,
    );

    await page.getByTestId("file-input").setInputFiles(receiptImage);
    await expect(page.getByTestId("store-name-input")).toHaveValue(
      "FAKE_STORE",
    );

    // Back on the upload view, the counter reflects the consumed scan.
    await page.goto("/receipts/scan");
    await expect(page.getByTestId("scan-usage")).toHaveText(
      /1 of \d+ scans used this month/,
    );
  });

  test("blocks scanning with a friendly error once the quota is exhausted", async ({
    page,
  }) => {
    // Backfill a full month of usage for this user.
    const res = await page.request.post("/test-seed-ai-usage?count=10");
    expect(res.ok()).toBe(true);

    await page.goto("/receipts/scan");
    await expect(page.getByTestId("scan-usage")).toHaveText(
      /10 of 10 scans used this month/,
    );

    await page.getByTestId("file-input").setInputFiles(receiptImage);

    await expect(page.getByTestId("error-message")).toBeVisible();
    await expect(
      page.getByText(/used all 10 scans for this month/),
    ).toBeVisible();
    // No extraction happened.
    await expect(page.getByTestId("store-name-input")).toBeHidden();
  });

  test("one user's exhausted quota does not affect another user", async ({
    page,
  }) => {
    await page.request.post("/test-seed-ai-usage?count=10");

    // A different user (fresh context via new fixture user is not available
    // here, so verify via the API surface: this user is blocked, then a
    // fresh user created in the same browser gets a clean counter).
    const fresh = await page.request.post("/test-create-user?seed=defaults");
    expect(fresh.ok()).toBe(true);

    await page.goto("/receipts/scan");
    await expect(page.getByTestId("scan-usage")).toHaveText(
      /0 of \d+ scans used this month/,
    );
  });
});
