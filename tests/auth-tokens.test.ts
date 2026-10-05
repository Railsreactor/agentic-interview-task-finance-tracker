import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "#/db";
import {
  consumeAuthToken,
  createAuthToken,
  hashToken,
} from "#/server/auth-tokens.server";

// Exercises the single-use token lifecycle against the in-memory DB — the
// same SQL the verification and password-reset handlers run.

const userId = "auth-token-user";

beforeAll(async () => {
  await db.insert(schema.users).values({
    id: userId,
    username: "token-tester",
    email: "token-tester@example.com",
    password_hash: "irrelevant",
  });
});

describe("auth tokens", () => {
  it("stores only the SHA-256 hash of the raw token", async () => {
    const raw = await createAuthToken(userId, "verify_email", 60_000);
    const rows = await db
      .select()
      .from(schema.auth_tokens)
      .where(eq(schema.auth_tokens.user_id, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(raw));
    expect(rows[0].token_hash).not.toBe(raw);
  });

  it("consumes a valid token exactly once", async () => {
    const raw = await createAuthToken(userId, "verify_email", 60_000);
    expect(await consumeAuthToken(raw, "verify_email")).toBe(userId);
    expect(await consumeAuthToken(raw, "verify_email")).toBeNull();
  });

  it("rejects the wrong type, expired tokens, and unknown tokens", async () => {
    const raw = await createAuthToken(userId, "verify_email", 60_000);
    expect(await consumeAuthToken(raw, "password_reset")).toBeNull();

    const expired = await createAuthToken(userId, "password_reset", -1_000);
    expect(await consumeAuthToken(expired, "password_reset")).toBeNull();

    expect(await consumeAuthToken("no-such-token", "verify_email")).toBeNull();
  });

  it("invalidates earlier tokens of the same type when reissuing", async () => {
    const first = await createAuthToken(userId, "password_reset", 60_000);
    const second = await createAuthToken(userId, "password_reset", 60_000);
    expect(await consumeAuthToken(first, "password_reset")).toBeNull();
    expect(await consumeAuthToken(second, "password_reset")).toBe(userId);
  });
});
