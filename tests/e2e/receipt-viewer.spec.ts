import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "./fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) =>
  path.join(__dirname, "fixtures", "images", name);

async function scanAndSaveReceipt(page: Page) {
  // Navigate to scan receipt page
  await page.goto("/receipts/scan");
  await expect(page).toHaveURL("/receipts/scan");

  // Upload receipt image
  await page.getByTestId("file-input").setInputFiles(fixturePath("receipt-test.png"));

  // Wait for extraction
  await expect(page.getByTestId("loading-spinner")).toBeHidden();
  await expect(page.getByTestId("store-name-input")).toHaveValue("FAKE_STORE");

  // Select account (first available)
  await page.getByTestId("account-select").selectOption({ index: 1 });

  // Save receipt
  await page.getByTestId("save-receipt-btn").click();
  await expect(page.getByText("Receipt saved successfully")).toBeVisible();
}

test.describe("Receipt Viewer", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    await page.goto("/dashboard");
  });

  test("shows receipt indicator for receipt-backed transaction", async ({ page }) => {
    // First create a receipt
    await scanAndSaveReceipt(page);

    // Navigate to transactions list
    await page.goto("/transactions");
    await expect(
      page.getByRole("heading", { name: "Transactions", exact: true }),
    ).toBeVisible();

    // Should see receipt icon on the row
    const receiptIcon = page.getByTestId("view-receipt");
    await expect(receiptIcon).toBeVisible();
  });

  test("does not show receipt indicator for plain transaction", async ({ page }) => {
    // Navigate to transactions list
    await page.goto("/transactions");
    await expect(
      page.getByRole("heading", { name: "Transactions", exact: true }),
    ).toBeVisible();

    // No receipt icons should be visible (no receipts created)
    const receiptIcons = page.getByTestId("view-receipt");
    await expect(receiptIcons).toBeHidden();
  });

  test("clicking receipt indicator opens viewer page", async ({ page }) => {
    // First create a receipt
    await scanAndSaveReceipt(page);

    // Navigate to transactions list
    await page.goto("/transactions");
    await expect(
      page.getByRole("heading", { name: "Transactions", exact: true }),
    ).toBeVisible();

    // Click receipt icon
    await page.getByTestId("view-receipt").click();

    // Should navigate to receipt viewer
    await expect(page).toHaveURL(/\/receipts\/view\//);
    await expect(page.getByRole("heading", { name: "Receipt" })).toBeVisible();
  });

  test("viewer shows receipt metadata", async ({ page }) => {
    // First create a receipt
    await scanAndSaveReceipt(page);

    // Navigate to transactions list and click receipt icon
    await page.goto("/transactions");
    await page.getByTestId("view-receipt").click();

    // Should show store name, date, and total
    await expect(page.getByText("FAKE_STORE")).toBeVisible();
    await expect(page.getByText("36.99 PLN", { exact: true })).toBeVisible();
  });

  test("viewer shows items table", async ({ page }) => {
    // First create a receipt
    await scanAndSaveReceipt(page);

    // Navigate to receipt viewer
    await page.goto("/transactions");
    await page.getByTestId("view-receipt").click();

    // Should show items
    await expect(page.getByText("Product A")).toBeVisible();
    await expect(page.getByText("Product B")).toBeVisible();
    await expect(page.getByText("21.00")).toBeVisible();
    await expect(page.getByText("15.99")).toBeVisible();
  });

  test("back button returns to transactions list", async ({ page }) => {
    // First create a receipt
    await scanAndSaveReceipt(page);

    // Navigate to receipt viewer
    await page.goto("/transactions");
    await page.getByTestId("view-receipt").click();

    // Click back button (in banner/header)
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Back to transactions" })
      .click();

    // Should return to transactions
    await expect(page).toHaveURL("/transactions");
    await expect(
      page.getByRole("heading", { name: "Transactions", exact: true }),
    ).toBeVisible();
  });

  test("shows empty state for transaction without receipt", async ({ page }) => {
    // Navigate directly to a non-existent receipt viewer
    await page.goto("/receipts/view/00000000-0000-0000-0000-000000000000");

    // Should show empty state
    await expect(page.getByText("Receipt not found")).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Back to transactions" }),
    ).toBeVisible();
  });

  test("another user's receipt is not accessible (IDOR)", async ({ page }) => {
    // User A creates a receipt and we capture its viewer URL
    await scanAndSaveReceipt(page);
    await page.goto("/transactions");
    await page.getByTestId("view-receipt").click();
    await expect(page).toHaveURL(/\/receipts\/view\/.+/);
    const receiptUrl = page.url();
    await expect(page.getByText("Image Preview")).toBeVisible();

    // Switch the browser session to a fresh user B (the endpoint replaces
    // the session cookie), then open user A's receipt URL directly
    const res = await page.request.post("/test-create-user?seed=defaults");
    expect(res.ok()).toBe(true);
    await page.goto(receiptUrl);

    // Cross-tenant access must be indistinguishable from a missing receipt
    await expect(page.getByText("Receipt not found")).toBeVisible();
    await expect(page.getByText("Image Preview")).toBeHidden();
  });

  test("displays receipt image in viewer", async ({ page }) => {
    // First create a receipt
    await scanAndSaveReceipt(page);

    // Navigate to receipt viewer
    await page.goto("/transactions");
    await page.getByTestId("view-receipt").click();

    // Should show image preview section
    await expect(page.getByText("Image Preview")).toBeVisible();
    // Image should be visible (data URL)
    const image = page.locator("img[alt='Image Preview']");
    await expect(image).toBeVisible();
  });

  test("shows sum reconciliation in viewer", async ({ page }) => {
    // First create a receipt
    await scanAndSaveReceipt(page);

    // Navigate to receipt viewer
    await page.goto("/transactions");
    await page.getByTestId("view-receipt").click();

    // Should show items total and receipt total
    await expect(page.getByText(/Items total:/)).toBeVisible();
  });
});
