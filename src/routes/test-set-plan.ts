import { createFileRoute } from "@tanstack/react-router";
import { db, schema } from "#/db";
import { requireUserId } from "#/server/session";

// Test-only endpoint: sets the signed-in user's plan directly so E2E tests
// can exercise gated flows (scan quota, account limit, billing page) without
// touching Stripe. Mirrors what a verified webhook would have written.
//
// Query params:
//   ?plan=pro|free   — target plan (default pro)
//   ?status=active   — raw Stripe status to mirror (default active)
//
// Only enabled when TEST_MODE=1 (same gating as test-create-user).
export const Route = createFileRoute("/test-set-plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.TEST_MODE !== "1") {
          return new Response("Not available", { status: 404 });
        }

        const userId = await requireUserId();
        const url = new URL(request.url);
        const plan = url.searchParams.get("plan") === "free" ? "free" : "pro";
        const status = url.searchParams.get("status") ?? "active";

        await db
          .insert(schema.subscriptions)
          .values({
            user_id: userId,
            stripe_customer_id: `cus_test_${userId}`,
            stripe_subscription_id: `sub_test_${userId}`,
            plan,
            status,
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.subscriptions.user_id,
            set: { plan, status, updated_at: new Date() },
          });

        return Response.json({ plan, status });
      },
    },
  },
});
