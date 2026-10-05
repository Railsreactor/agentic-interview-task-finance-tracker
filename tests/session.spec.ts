import { describe, expect, it } from "vitest";
import { getSessionCookieConfig } from "#/server/session";

describe("getSessionCookieConfig", () => {
  it("keeps cookies insecure for plain HTTP requests", () => {
    expect(
      getSessionCookieConfig("http://192.168.50.2:3000/dashboard"),
    ).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("keeps cookies secure for proxied HTTPS requests", () => {
    expect(
      getSessionCookieConfig(
        "http://finance-tracker.internal/dashboard",
        "https",
      ),
    ).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
});
