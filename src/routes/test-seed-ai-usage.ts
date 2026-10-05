import { createFileRoute } from "@tanstack/react-router";
import { db, schema } from "#/db";
import { requireUserId } from "#/server/session";

// Test-only endpoint: seeds ai_usage rows for the signed-in user so E2E
// tests can exercise quota exhaustion without performing N real scans.
//
// Query params:
//   ?count=10 — number of receipt_scan usage rows to insert (default 10)
//
// Only enabled when TEST_MODE=1 (same gating as test-create-user).
export const Route = createFileRoute("/test-seed-ai-usage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.TEST_MODE !== "1") {
          return new Response("Not available", { status: 404 });
        }

        const userId = await requireUserId();
        const url = new URL(request.url);
        const count = Number(url.searchParams.get("count") ?? "10");

        await db.insert(schema.ai_usage).values(
          Array.from({ length: count }, () => ({
            id: crypto.randomUUID(),
            user_id: userId,
            kind: "receipt_scan" as const,
            provider: "fake",
            model: "fake",
            input_tokens: 0,
            output_tokens: 0,
            cost_estimate_microusd: 0,
          })),
        );

        return Response.json({ seeded: count });
      },
    },
  },
});
