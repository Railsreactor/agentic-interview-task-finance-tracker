import { test, expect } from "./fixtures";


test.describe("Security headers & CSRF", () => {
  test("responses carry the standard security headers", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response).not.toBeNull();
    const headers = response!.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("same-origin");
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    // App still renders under the CSP.
    await expect(
      page.getByRole("heading", { name: /sign in/i }),
    ).toBeVisible();
  });

  test("cross-site POST requests are rejected with 403", async ({
    request,
  }) => {
    const crossSite = await request.post("/", {
      headers: { origin: "https://evil.example" },
    });
    expect(crossSite.status()).toBe(403);

    const secFetch = await request.post("/", {
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(secFetch.status()).toBe(403);
  });

  test("same-origin POST requests are not blocked", async ({
    request,
    baseURL,
  }) => {
    const sameOrigin = await request.post("/", {
      headers: { origin: baseURL! },
    });
    expect(sameOrigin.status()).not.toBe(403);
  });
});
