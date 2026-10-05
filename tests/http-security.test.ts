import { describe, expect, it } from "vitest";
import { isForbiddenCrossSite, securityHeaders } from "#/lib/http-security";

const url = "http://localhost:3000/import";

describe("http security", () => {
  it("securityHeaders sets the standard set with prod-only HSTS", () => {
    const dev = securityHeaders(false);
    expect(dev["X-Content-Type-Options"]).toBe("nosniff");
    expect(dev["X-Frame-Options"]).toBe("DENY");
    expect(dev["Referrer-Policy"]).toBe("same-origin");
    expect(dev["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(dev["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(dev["Strict-Transport-Security"]).toBeUndefined();

    const prod = securityHeaders(true);
    expect(prod["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("rejects provably cross-site state-changing requests", () => {
    expect(
      isForbiddenCrossSite(
        "POST",
        new Headers({ "sec-fetch-site": "cross-site" }),
        url,
      ),
    ).toBe(true);
    expect(
      isForbiddenCrossSite(
        "POST",
        new Headers({ origin: "https://evil.example" }),
        url,
      ),
    ).toBe(true);
    expect(
      isForbiddenCrossSite("POST", new Headers({ origin: "null" }), url),
    ).toBe(true);
    expect(
      isForbiddenCrossSite(
        "POST",
        new Headers({ origin: "not a url" }),
        url,
      ),
    ).toBe(true);
    // DELETE and PUT are state-changing too
    expect(
      isForbiddenCrossSite(
        "DELETE",
        new Headers({ "sec-fetch-site": "cross-site" }),
        url,
      ),
    ).toBe(true);
  });

  it("allows same-origin, safe-method, and non-browser requests", () => {
    // Same-origin browser POST
    expect(
      isForbiddenCrossSite(
        "POST",
        new Headers({
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
        }),
        url,
      ),
    ).toBe(false);
    // TLS-terminating proxy: https Origin, http internal URL — same host
    expect(
      isForbiddenCrossSite(
        "POST",
        new Headers({ origin: "https://localhost:3000" }),
        url,
      ),
    ).toBe(false);
    // GET is never blocked, even cross-site
    expect(
      isForbiddenCrossSite(
        "GET",
        new Headers({ "sec-fetch-site": "cross-site" }),
        url,
      ),
    ).toBe(false);
    // Non-browser client: no Origin, no Sec-Fetch metadata
    expect(isForbiddenCrossSite("POST", new Headers(), url)).toBe(false);
  });
});
