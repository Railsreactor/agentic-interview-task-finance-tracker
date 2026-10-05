import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "#/db";

//
// Single-use, time-limited auth tokens. The raw token travels only inside
// the email link; the database stores its SHA-256 hash, so a leaked DB dump
// cannot be replayed into a working link.

export type AuthTokenType = "verify_email" | "password_reset";

export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Issue a fresh token for the user, invalidating any earlier tokens of the
 * same type (only the most recent email link works). Returns the raw token
 * for embedding in the email link.
 */
export async function createAuthToken(
  userId: string,
  type: AuthTokenType,
  ttlMs: number,
): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");

  await db
    .delete(schema.auth_tokens)
    .where(
      and(
        eq(schema.auth_tokens.user_id, userId),
        eq(schema.auth_tokens.type, type),
      ),
    );

  await db.insert(schema.auth_tokens).values({
    id: crypto.randomUUID(),
    user_id: userId,
    type,
    token_hash: hashToken(rawToken),
    expires_at: new Date(Date.now() + ttlMs),
  });

  return rawToken;
}

/**
 * Redeem a token: valid only if it exists, matches the type, is unexpired,
 * and has not been used. The claim is atomic — the UPDATE only matches rows
 * with `used_at IS NULL`, so concurrent redemptions of the same token cannot
 * both succeed. Returns the owning user id, or null for anything invalid;
 * failure modes are deliberately indistinguishable.
 */
export async function consumeAuthToken(
  rawToken: string,
  type: AuthTokenType,
): Promise<string | null> {
  const now = new Date();

  const rows = await db
    .update(schema.auth_tokens)
    .set({ used_at: now })
    .where(
      and(
        eq(schema.auth_tokens.token_hash, hashToken(rawToken)),
        eq(schema.auth_tokens.type, type),
        isNull(schema.auth_tokens.used_at),
      ),
    )
    .returning();

  const token = rows[0];
  if (!token) return null;
  if (token.expires_at.getTime() < now.getTime()) return null;
  return token.user_id;
}
