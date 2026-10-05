import { test, expect, type Page } from "./fixtures";
import type { APIRequestContext, Browser } from "@playwright/test";

//
// Email-based account lifecycle: signup with verification, password reset
// (with session invalidation), and "log out everywhere". Emails are captured
// in memory by the TEST_MODE email provider and read back via /test-emails.
// Every test creates unique users/emails so the suite runs fully parallel.

type CapturedEmail = { to: string; subject: string; text: string };

async function pollEmails(
  request: APIRequestContext,
  to: string,
  subjectPart: string,
  minCount = 1,
): Promise<CapturedEmail[]> {
  let matching: CapturedEmail[] = [];
  await expect
    .poll(async () => {
      const res = await request.get(`/test-emails?to=${encodeURIComponent(to)}`);
      const { emails } = (await res.json()) as { emails: CapturedEmail[] };
      matching = emails.filter((e) => e.subject.includes(subjectPart));
      return matching.length;
    })
    .toBeGreaterThanOrEqual(minCount);
  return matching;
}

function extractLink(email: CapturedEmail): string {
  const match = email.text.match(/https?:\/\/\S+token=[A-Za-z0-9_-]+/);
  if (!match) throw new Error(`No token link in email: ${email.text}`);
  return match[0];
}

async function login(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(identifier);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
}

async function newSignedOutPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test.describe("Account Lifecycle", () => {
  test("signup sends verification email and the link verifies the account", async ({
    page,
  }) => {
    const slug = `lc_${crypto.randomUUID().slice(0, 8)}`;
    const email = `${slug}@example.com`;

    await page.goto("/setup");
    await page.getByLabel("Username").fill(slug);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Corr3ct-Horse-Battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/dashboard");

    // Unverified accounts see the verification banner
    await expect(
      page.getByText("Please verify your email address"),
    ).toBeVisible();

    const [verifyEmail] = await pollEmails(page.request, email, "Verify");
    await page.goto(extractLink(verifyEmail));
    await expect(
      page.getByText("Your email has been verified"),
    ).toBeVisible();

    await page.goto("/dashboard");
    await expect(
      page.getByText("Please verify your email address"),
    ).toBeHidden();
  });

  test("a verification link cannot be used twice", async ({ page }) => {
    const slug = `lc_${crypto.randomUUID().slice(0, 8)}`;
    const email = `${slug}@example.com`;

    await page.goto("/setup");
    await page.getByLabel("Username").fill(slug);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Corr3ct-Horse-Battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/dashboard");

    const [verifyEmail] = await pollEmails(page.request, email, "Verify");
    const link = extractLink(verifyEmail);
    await page.goto(link);
    await expect(
      page.getByText("Your email has been verified"),
    ).toBeVisible();

    await page.goto(link);
    await expect(page.getByRole("alert")).toContainText(
      "invalid or has expired",
    );
  });

  test("resend verification sends a fresh email", async ({ page }) => {
    const res = await page.request.post("/test-create-user?verified=false");
    const { email } = (await res.json()) as { email: string };

    await page.goto("/dashboard");
    await page
      .getByRole("button", { name: "Resend verification email" })
      .click();
    await expect(page.getByText("Verification email sent")).toBeVisible();
    await pollEmails(page.request, email, "Verify");
  });

  test("verified users do not see the verification banner", async ({
    page,
    signedInUser: _,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByText("Please verify your email address"),
    ).toBeHidden();
  });

  test("password reset works end-to-end and signs out old sessions", async ({
    page,
    browser,
    unauthUser,
  }) => {
    const newPassword = "N3w-Horse-Battery-42";

    // Device A: logged-in session that must die after the reset
    await login(page, unauthUser.email, unauthUser.password);

    // Device B: request and complete the reset
    const deviceB = await newSignedOutPage(browser);
    await deviceB.goto("/forgot-password");
    await deviceB.getByLabel("Email").fill(unauthUser.email);
    await deviceB.getByRole("button", { name: "Send reset link" }).click();
    await expect(deviceB.getByRole("status")).toContainText(
      "a reset link is on its way",
    );

    const [resetEmail] = await pollEmails(
      deviceB.request,
      unauthUser.email,
      "Reset",
    );
    const link = extractLink(resetEmail);
    await deviceB.goto(link);
    await deviceB.getByLabel("New password").fill(newPassword);
    await deviceB.getByRole("button", { name: "Set new password" }).click();
    await expect(deviceB.getByRole("status")).toContainText(
      "All devices have been signed out",
    );

    // The reset link is single-use
    await deviceB.goto(link);
    await deviceB.getByLabel("New password").fill(newPassword);
    await deviceB.getByRole("button", { name: "Set new password" }).click();
    await expect(deviceB.getByRole("alert")).toContainText(
      "invalid or has expired",
    );

    // Old password is dead, new one works
    await deviceB.goto("/login");
    await deviceB.getByLabel("Email or username").fill(unauthUser.email);
    await deviceB.getByLabel("Password").fill(unauthUser.password);
    await deviceB.getByRole("button", { name: "Sign in" }).click();
    await expect(deviceB.getByRole("alert")).toContainText(
      "Invalid credentials",
    );
    await deviceB.getByLabel("Password").fill(newPassword);
    await deviceB.getByRole("button", { name: "Sign in" }).click();
    await expect(deviceB).toHaveURL("/dashboard");

    // Device A's session was invalidated by the reset
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");

    await deviceB.context().close();
  });

  test("forgot password shows identical copy for unknown emails", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page
      .getByLabel("Email")
      .fill(`nobody_${crypto.randomUUID().slice(0, 8)}@example.com`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText(
      "a reset link is on its way",
    );
  });

  test("log out everywhere signs out all devices", async ({
    page,
    browser,
    unauthUser,
  }) => {
    // Two devices, same account
    await login(page, unauthUser.email, unauthUser.password);
    const deviceB = await newSignedOutPage(browser);
    await login(deviceB, unauthUser.username, unauthUser.password);

    await page.getByRole("button", { name: "Log out everywhere" }).click();
    await expect(page).toHaveURL("/login");

    await deviceB.goto("/dashboard");
    await expect(deviceB).toHaveURL("/login");

    await deviceB.context().close();
  });
});
