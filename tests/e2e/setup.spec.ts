import { test, expect } from "./fixtures";

//
// Setup specs run serially in a dedicated playwright project. They rely on
// global state ("are there any users?") that other specs cannot share, so
// they must run before any other spec creates a user.

test.describe.serial("Setup Flow", () => {
  test("shows setup page when no users exist", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/setup");
    await expect(
      page.getByRole("heading", { name: "Set up your account" }),
    ).toBeVisible();
  });

  test("rejects a too-common password", async ({ page }) => {
    await page.goto("/setup");

    await page.getByLabel("Username").fill("testuser");
    await page.getByLabel("Email").fill("testuser@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("alert")).toContainText("too common");
    await expect(page).toHaveURL("/setup");
  });

  test("can create first account on setup page", async ({ page }) => {
    await page.goto("/setup");

    await page.getByLabel("Username").fill("testuser");
    await page.getByLabel("Email").fill("testuser@example.com");
    await page.getByLabel("Password").fill("Corr3ct-Horse-Battery");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });
});
