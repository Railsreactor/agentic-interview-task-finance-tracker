import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db, schema } from "#/db";

// Test-only endpoint: rewinds timestamps so E2E tests can cross retention /
// grace-period boundaries without waiting weeks. Only enabled when
// TEST_MODE=1.
//
// Query params (both optional, at least one required):
//   ?deletionDays=15&userId=... — backdate users.deletion_requested_at
//   ?receiptDays=91&userId=...  — backdate receipts.created_at for the user
export const Route = createFileRoute("/test-backdate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.TEST_MODE !== "1") {
          return new Response("Not available", { status: 404 });
        }

        const url = new URL(request.url);
        const userId = url.searchParams.get("userId");
        const deletionDays = Number(url.searchParams.get("deletionDays"));
        const receiptDays = Number(url.searchParams.get("receiptDays"));
        if (!userId || (!deletionDays && !receiptDays)) {
          return new Response("Bad request", { status: 400 });
        }

        const DAY_MS = 24 * 60 * 60 * 1000;
        if (deletionDays) {
          await db
            .update(schema.users)
            .set({
              deletion_requested_at: new Date(Date.now() - deletionDays * DAY_MS),
            })
            .where(eq(schema.users.id, userId));
        }
        if (receiptDays) {
          await db
            .update(schema.receipts)
            .set({ created_at: new Date(Date.now() - receiptDays * DAY_MS) })
            .where(eq(schema.receipts.user_id, userId));
        }
        return Response.json({ ok: true });
      },
    },
  },
});
