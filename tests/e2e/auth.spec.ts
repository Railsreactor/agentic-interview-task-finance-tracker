import { test, expect } from "./fixtures";

//
// Login, dashboard, and logout specs. They use `unauthUser` (creates a user
// without setting the session cookie) so they own their credentials and
// don't depend on the setup spec or any other test having run first.

test.describe("Auth Flow", () => {
  test("shows login page when users exist", async ({ page, unauthUser: _ }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
    await expect(
      page.getByRole("heading", { name: "Sign in" }),
    ).toBeVisible();
  });

  test("login with valid credentials succeeds", async ({ page, unauthUser }) => {
    await page.goto("/login");
    await page.getByLabel("Email or username").fill(unauthUser.username);
    await page.getByLabel("Password").fill(unauthUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("login with email succeeds", async ({ page, unauthUser }) => {
    await page.goto("/login");
    await page.getByLabel("Email or username").fill(unauthUser.email);
    await page.getByLabel("Password").fill(unauthUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/dashboard");
  });

  test("login with invalid credentials shows error", async ({
    page,
    unauthUser,
  }) => {
    await page.goto("/login");

    await page.getByLabel("Email or username").fill(unauthUser.username);
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "Invalid credentials",
    );
    await expect(page).toHaveURL("/login");
  });

  test("login with non-existent user shows same error", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email or username").fill("nonexistent_user_xyz");
    await page.getByLabel("Password").fill("anypassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "Invalid credentials",
    );
  });

  test("repeated login failures lock the account", async ({
    page,
    unauthUser,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email or username").fill(unauthUser.username);

    // 5 consecutive failures trigger the progressive lockout
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("Password").fill("wrongpassword");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
    }

    // Even the correct password is now throttled
    await page.getByLabel("Password").fill(unauthUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Too many attempts");
    await expect(page).toHaveURL("/login");
  });

  test("dashboard shows header with username and sign out", async ({
    page,
    unauthUser,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email or username").fill(unauthUser.username);
    await page.getByLabel("Password").fill(unauthUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await expect(page.getByText(unauthUser.username)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign out" }).nth(1),
    ).toBeVisible();
  });

  test("logout redirects to login", async ({ page, unauthUser }) => {
    await page.goto("/login");
    await page.getByLabel("Email or username").fill(unauthUser.username);
    await page.getByLabel("Password").fill(unauthUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.getByRole("link", { name: "Sign out" }).nth(1).click();
    await expect(page).toHaveURL("/login");
  });

  test("redirects unauthenticated users from dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });
});
