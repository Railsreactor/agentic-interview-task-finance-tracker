import { test, expect, type Page } from "./fixtures";


test.describe("Transaction CRUD", () => {
  test.beforeEach(async ({ page, signedInUser: _signedInUser }) => {
    await page.goto("/transactions");
    await expect(page).toHaveURL("/transactions");
  });

  async function fillNewForm(
    page: Page,
    opts: {
      date: string;
      description: string;
      amount: string;
      account: string;
      category?: string;
      isIncome?: boolean;
    },
  ) {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Add Transaction" })
      .click();

    const modal = page
      .getByRole("dialog", { name: "New Transaction" });

    // datetime-local input requires YYYY-MM-DDTHH:mm format
    const datetimeLocal = opts.date.includes("T")
      ? opts.date
      : `${opts.date}T00:00`;
    await modal.getByLabel("Date").fill(datetimeLocal);
    await modal.getByLabel("Description").fill(opts.description);
    await modal
      .getByRole("spinbutton", { name: "Amount", exact: true })
      .fill(opts.amount);
    await modal.getByLabel("Account").selectOption(opts.account);
    if (opts.category) {
      await modal.getByLabel("Category").selectOption(opts.category);
    }
    if (opts.isIncome) {
      await modal.getByLabel("Income").check();
    }
    await modal.getByRole("button", { name: "Create Transaction" }).click();
  }

  async function createAccount(page: Page, name: string) {
    await page.getByRole("link", { name: "Accounts" }).click();
    await page.getByRole("button", { name: "Add Account" }).click();
    await page.getByLabel("Account Name").fill(name);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByRole("link", { name: "Transactions" }).click();
  }

  async function createCategory(page: Page, name: string) {
    await page.getByRole("link", { name: "Categories" }).click();
    await page.getByRole("button", { name: "Add Category" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create Category" }).click();
    await page.getByRole("link", { name: "Transactions" }).click();
  }

  test("creates a new expense transaction", async ({ page }) => {
    await createAccount(page, "Main");
    await createCategory(page, "Groceries");

    await fillNewForm(page, {
      date: "2025-01-15",
      description: "Grocery Shopping",
      amount: "150.00",
      account: "Main (PLN)",
      category: "Groceries",
    });

    await expect(
      page.getByRole("heading", { name: "New Transaction" }),
    ).toBeHidden();

    const table = page.getByRole("table");
    await expect(table.getByText("Grocery Shopping")).toBeVisible();
    await expect(table.getByText("150.00")).toBeVisible();
  });

  test("creates a new income transaction", async ({ page }) => {
    await createAccount(page, "Main");

    await fillNewForm(page, {
      date: "2025-01-15",
      description: "Salary",
      amount: "3000.00",
      account: "Main (PLN)",
      isIncome: true,
    });

    await expect(
      page.getByRole("heading", { name: "New Transaction" }),
    ).toBeHidden();
    const table = page.getByRole("table");
    await expect(table.getByText("Salary")).toBeVisible();
    await expect(table.getByText("+ 3000.00")).toBeVisible();
  });

  test("shows validation error when account is missing", async ({ page }) => {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Add Transaction" })
      .click();

    const modal = page
      .getByRole("dialog", { name: "New Transaction" });

    await modal.getByLabel("Date").fill("2025-01-15T00:00");
    await modal.getByLabel("Description").fill("No Account");
    await modal
      .getByRole("spinbutton", { name: "Amount", exact: true })
      .fill("10.00");

    await modal.getByRole("button", { name: "Create Transaction" }).click();

    await expect(page.getByText("Account is required")).toBeVisible();
  });

  test("shows validation error when amount is zero", async ({ page }) => {
    await createAccount(page, "Main");

    await page
      .getByRole("banner")
      .getByRole("button", { name: "Add Transaction" })
      .click();

    const modal = page
      .getByRole("dialog", { name: "New Transaction" });

    await modal.getByLabel("Date").fill("2025-01-15T00:00");
    await modal.getByLabel("Description").fill("Zero Amount");
    await modal
      .getByRole("spinbutton", { name: "Amount", exact: true })
      .fill("0");
    await modal.getByLabel("Account").selectOption("Main (PLN)");
    await modal.getByRole("button", { name: "Create Transaction" }).click();

    await expect(
      page.getByText("Amount must be a non-zero number"),
    ).toBeVisible();
  });

  test("edits an existing transaction", async ({ page }) => {
    await createAccount(page, "Main");

    await fillNewForm(page, {
      date: "2025-01-15",
      description: "Original Description",
      amount: "100.00",
      account: "Main (PLN)",
    });

    const editTable = page.getByRole("table");
    await editTable.getByTestId("transaction-row").filter({ hasText: "Original Description" }).getByTestId("edit-transaction").click();

    const modal = page
      .getByRole("dialog", { name: "Edit Transaction" });
    await modal.getByLabel("Description").fill("Updated Description");
    await modal
      .getByRole("spinbutton", { name: "Amount", exact: true })
      .fill("200.00");
    await modal.getByRole("button", { name: "Save Changes" }).click();

    await expect(
      page.getByRole("heading", { name: "Edit Transaction" }),
    ).toBeHidden();
    const table = page.getByRole("table");
    await expect(table.getByText("Updated Description")).toBeVisible();
    await expect(table.getByText("200.00")).toBeVisible();
  });

  test("edit form is pre-filled with existing data", async ({ page }) => {
    await createAccount(page, "Main");

    await fillNewForm(page, {
      date: "2025-06-15",
      description: "Pre-fill Test",
      amount: "75.50",
      account: "Main (PLN)",
    });

    const prefillTable = page.getByRole("table");
    await prefillTable.getByTestId("transaction-row").filter({ hasText: "Pre-fill Test" }).getByTestId("edit-transaction").click();

    const modal = page
      .getByRole("dialog", { name: "Edit Transaction" });
    await expect(modal.getByLabel("Date")).toHaveValue("2025-06-15T00:00");
    await expect(modal.getByLabel("Description")).toHaveValue("Pre-fill Test");
    await expect(modal.getByLabel("Amount")).toHaveValue("75.50");
  });

  test("cancel edit form discards changes", async ({ page }) => {
    await createAccount(page, "Main");

    await fillNewForm(page, {
      date: "2025-01-15",
      description: "Cancel Edit Test",
      amount: "50.00",
      account: "Main (PLN)",
    });

    // Open the edit form
    const editTable = page.getByRole("table");
    await editTable.getByTestId("transaction-row").filter({ hasText: "Cancel Edit Test" }).getByTestId("edit-transaction").click();

    const modal = page
      .getByRole("dialog", { name: "Edit Transaction" });

    // Change the description
    await modal.getByLabel("Description").fill("Changed Description");

    // Cancel the edit
    await modal.getByRole("button", { name: "Cancel" }).first().click();

    // Verify the modal is closed and original data is still in the table
    await expect(
      page.getByRole("heading", { name: "Edit Transaction" }),
    ).toBeHidden();
    const table = page.getByRole("table");
    await expect(table.getByText("Cancel Edit Test")).toBeVisible();
    await expect(table.getByText("Changed Description")).toBeHidden();
  });

  test("cancel delete confirmation keeps transaction", async ({ page }) => {
    await createAccount(page, "Main");

    await fillNewForm(page, {
      date: "2025-01-15",
      description: "Keep Me",
      amount: "10.00",
      account: "Main (PLN)",
    });

    // Open the delete confirmation dialog
    const deleteTable = page.getByRole("table");
    await deleteTable.getByTestId("transaction-row").filter({ hasText: "Keep Me" }).getByTestId("delete-transaction").click();

    await expect(
      page.getByRole("heading", { name: "Delete Transaction" }),
    ).toBeVisible();

    // Cancel the deletion
    await page.getByRole("button", { name: "Cancel" }).first().click();

    // Verify the transaction is still in the table
    await expect(
      page.getByRole("heading", { name: "Delete Transaction" }),
    ).toBeHidden();
    await expect(page.getByRole("table").getByText("Keep Me")).toBeVisible();
  });

  test("deletes a transaction", async ({ page }) => {
    await createAccount(page, "Main");

    await fillNewForm(page, {
      date: "2025-01-15",
      description: "Delete Me",
      amount: "10.00",
      account: "Main (PLN)",
    });

    const deleteTable = page.getByRole("table");
    await deleteTable.getByTestId("transaction-row").filter({ hasText: "Delete Me" }).getByTestId("delete-transaction").click();

    const confirm = page.getByRole("alertdialog", {
      name: "Delete Transaction",
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete" }).click();

    await expect(confirm).toBeHidden();
    await expect(page.getByRole("table").getByText("Delete Me")).toBeHidden();
  });
});
