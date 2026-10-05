import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db, schema } from "#/db";
import { useAppSession } from "#/server/session";

// Test-only endpoint: inserts a categorization rule for the current session
// user. Used by the import-autocat E2E spec to wire up a higher-priority rule
// without requiring the Phase 6 rules-management UI to exist yet.
//
// Body: { pattern, categoryName, priority?, matchType? }
//
// Only enabled when TEST_MODE=1 (same runtime flag as /test-create-user).
export const Route = createFileRoute("/test-add-rule")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.TEST_MODE !== "1") {
          return new Response("Not available", { status: 404 });
        }

        const session = await useAppSession();
        const userId = session.data.userId;
        if (!userId) {
          return new Response("Not signed in", { status: 401 });
        }

        const body = (await request.json()) as {
          pattern?: string;
          categoryName?: string;
          priority?: number;
          matchType?: "substring" | "exact";
        };
        if (!body.pattern || !body.categoryName) {
          return new Response("Missing fields", { status: 400 });
        }

        const cats = await db
          .select({ id: schema.categories.id })
          .from(schema.categories)
          .where(
            and(
              eq(schema.categories.user_id, userId),
              eq(schema.categories.name, body.categoryName),
            ),
          )
          .limit(1);
        if (cats.length === 0) {
          return new Response(
            `Category "${body.categoryName}" not found`,
            { status: 404 },
          );
        }

        const id = crypto.randomUUID();
        await db.insert(schema.categorization_rules).values({
          id,
          user_id: userId,
          pattern: body.pattern,
          match_type: body.matchType ?? "substring",
          category_id: cats[0].id,
          priority: body.priority ?? 100,
        });

        return Response.json({ id });
      },
    },
  },
});
