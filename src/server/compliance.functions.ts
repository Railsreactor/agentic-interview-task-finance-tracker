import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "#/db";
import { m } from "#/paraglide/messages";
import { sendEmail } from "#/server/email";
import { env } from "#/server/env";
import { getLogger } from "#/server/logger";
import { checkRateLimit } from "#/server/rate-limit";
import { resolveSessionUser } from "#/server/session";
import {
  DELETION_GRACE_DAYS,
  deletionEffectiveAt,
} from "#/server/compliance.server";


// A handful of attempts per window — password-confirmed, so this only
// throttles guessing. Relaxed in TEST_MODE like the auth limits.
const DELETE_ATTEMPT_LIMIT = {
  limit: 5 * (env.isTestMode ? 10_000 : 1),
  windowMs: 15 * 60_000,
};

function deletionStatus(requestedAt: Date | null) {
  return {
    requestedAt: requestedAt?.toISOString() ?? null,
    effectiveAt: requestedAt
      ? deletionEffectiveAt(requestedAt).toISOString()
      : null,
    graceDays: DELETION_GRACE_DAYS,
  };
}

/** Deletion state for the settings page (pending banner + cancel button). */
export const getDeletionStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await resolveSessionUser();
    if (!user) throw new Response("Unauthorized", { status: 401 });
    const [row] = await db
      .select({ deletion_requested_at: schema.users.deletion_requested_at })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1);
    return deletionStatus(row?.deletion_requested_at ?? null);
  },
);

/**
 * Start the deletion grace period. Requires the current password so a
 * hijacked session alone cannot destroy the account; the notification email
 * gives the real owner a window to cancel.
 */
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .inputValidator(z.object({ password: z.string().min(1).max(128) }))
  .handler(async ({ data }) => {
    const user = await resolveSessionUser();
    if (!user) throw new Response("Unauthorized", { status: 401 });

    const limit = checkRateLimit(`delete-account:${user.id}`, DELETE_ATTEMPT_LIMIT);
    if (!limit.allowed) {
      return { error: m.error_too_many_attempts() };
    }

    const [row] = await db
      .select({
        password_hash: schema.users.password_hash,
        deletion_requested_at: schema.users.deletion_requested_at,
      })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1);
    if (!row) throw new Response("Unauthorized", { status: 401 });

    if (!(await bcrypt.compare(data.password, row.password_hash))) {
      return { error: m.settings_delete_wrong_password() };
    }

    if (row.deletion_requested_at) {
      return { success: true, ...deletionStatus(row.deletion_requested_at) };
    }

    const requestedAt = new Date();
    await db
      .update(schema.users)
      .set({ deletion_requested_at: requestedAt })
      .where(eq(schema.users.id, user.id));

    if (user.email) {
      void sendEmail({
        to: user.email,
        subject: m.email_deletion_requested_subject(),
        text: m.email_deletion_requested_body({
          date: deletionEffectiveAt(requestedAt).toISOString().slice(0, 10),
        }),
      }).catch((error) =>
        getLogger().error({ err: error }, "failed to send deletion-requested notice"),
      );
    }

    getLogger().info("account deletion requested");
    return { success: true, ...deletionStatus(requestedAt) };
  });

/** Cancel a pending deletion — a no-op when none is pending. */
export const cancelAccountDeletion = createServerFn({ method: "POST" }).handler(
  async () => {
    const user = await resolveSessionUser();
    if (!user) throw new Response("Unauthorized", { status: 401 });

    await db
      .update(schema.users)
      .set({ deletion_requested_at: null })
      .where(eq(schema.users.id, user.id));

    if (user.email) {
      void sendEmail({
        to: user.email,
        subject: m.email_deletion_canceled_subject(),
        text: m.email_deletion_canceled_body(),
      }).catch((error) =>
        getLogger().error({ err: error }, "failed to send deletion-canceled notice"),
      );
    }

    getLogger().info("account deletion canceled");
    return { success: true, ...deletionStatus(null) };
  },
);
