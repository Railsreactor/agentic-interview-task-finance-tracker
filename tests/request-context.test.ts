import { describe, expect, it } from "vitest";
import { getLogger } from "#/server/logger";
import {
  getRequestContext,
  runWithRequestContext,
  setContextUserId,
} from "#/server/request-context";

describe("request context", () => {
  it("binds requestId and userId to loggers inside the context", () => {
    runWithRequestContext({ requestId: "req-1" }, () => {
      expect(getLogger().bindings()).toMatchObject({ requestId: "req-1" });
      setContextUserId("user-1");
      expect(getLogger().bindings()).toMatchObject({
        requestId: "req-1",
        userId: "user-1",
      });
      expect(getRequestContext()).toEqual({
        requestId: "req-1",
        userId: "user-1",
      });
    });
  });

  it("has no bindings and no context outside a request", () => {
    expect(getRequestContext()).toBeUndefined();
    expect(getLogger().bindings()).toEqual({});
    // setContextUserId outside a request is a safe no-op.
    setContextUserId("user-x");
    expect(getRequestContext()).toBeUndefined();
  });
});
