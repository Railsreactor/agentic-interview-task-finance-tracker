import { expect, test } from "@playwright/test";

// Health probes are unauthenticated infrastructure endpoints served by the
// production build — exactly what the Docker HEALTHCHECK and uptime monitors
// hit.

test("GET /health reports the process is alive", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["x-request-id"]).toBeTruthy();
});

test("GET /health/ready reports database and migrations ok", async ({
  request,
}) => {
  const response = await request.get("/health/ready");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    ready: true,
    // ai is informational (fake mode reports ok); it never gates readiness.
    checks: { database: "ok", migrations: "ok", ai: "ok" },
  });
});
