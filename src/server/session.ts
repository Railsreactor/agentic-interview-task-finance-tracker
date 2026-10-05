import { getRequest, getRequestHeader, useSession } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { db, schema } from "#/db";
import { env } from "#/server/env";
import { setContextUserId } from "#/server/request-context";


export type SessionData = {
  userId: string;
  username: string;
  // users.session_version at issue time. A mismatch on read means the user
  // revoked their sessions (password reset / "log out everywhere") after
  // this cookie was minted — the session is dead.
  sessionVersion: number;
};

// Explicit session lifetime — cookies are not browser-session-scoped and
// expire deterministically after 30 days.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function getSessionCookieConfig(requestUrl: string, forwardedProto?: string) {
  const normalizedForwardedProto = forwardedProto
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const requestProtocol = new URL(requestUrl).protocol.replace(":", "");
  const secure = (normalizedForwardedProto ?? requestProtocol) === "https";

  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function useAppSession() {
  const request = getRequest();
  const forwardedProto = getRequestHeader("x-forwarded-proto") ?? undefined;

  return useSession<SessionData>({
    // Validated at startup by src/server/env.ts — fails closed in production
    // when unset, too short, or equal to the dev fallback.
    password: env.sessionSecret,
    cookie: getSessionCookieConfig(request.url, forwardedProto),
  });
}

/**
 * Rotate the session: clear any existing (possibly attacker-fixated) session
 * before establishing a new identity. Call on every privilege change —
 * login, registration, and (once it exists) password change.
 */
export async function rotateSession(data: SessionData): Promise<void> {
  const session = await useAppSession();
  await session.clear();
  await session.update(data);
}

/**
 * Resolve the current session against the database: the user must still
 * exist and the cookie's sessionVersion must match users.session_version.
 * Clears the stale cookie and returns null otherwise.
 */
export async function resolveSessionUser() {
  const session = await useAppSession();
  const { userId, sessionVersion } = session.data;
  if (!userId) return null;

  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      email_verified_at: schema.users.email_verified_at,
      session_version: schema.users.session_version,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const user = users[0];
  // Legacy cookies minted before session versioning carry no sessionVersion;
  // treat them as version 0 (the column's backfill default).
  if (!user || user.session_version !== (sessionVersion ?? 0)) {
    await session.clear();
    return null;
  }
  // Tag the request context so logs and error reports carry the user id.
  setContextUserId(user.id);
  return user;
}

export async function requireUserId(): Promise<string> {
  const user = await resolveSessionUser();
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user.id;
}

/**
 * Whether the user may trigger AI spend. Legacy accounts without an email
 * predate verification and stay allowed; email accounts must be verified.
 */
export async function isEmailVerified(userId: string): Promise<boolean> {
  const users = await db
    .select({
      email: schema.users.email,
      email_verified_at: schema.users.email_verified_at,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const user = users[0];
  if (!user) return false;
  return user.email ? user.email_verified_at != null : true;
}
