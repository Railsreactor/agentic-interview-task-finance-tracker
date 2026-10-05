import { createFileRoute } from "@tanstack/react-router";
import bcrypt from "bcryptjs";
import { db, schema } from "#/db";
import { useAppSession } from "#/server/session";
import { seed, seedDefaultRules, seedAccount } from "#/server/seed";

// Test-only endpoint: creates a fresh user with a known password. Each e2e
// test calls this to get its own scoped data and runs in parallel with every
// other test — the app is multi-user server-side, so this is just a thin
// shortcut around the same insert real users would hit if registration
// were exposed in production.
//
// Query params:
//   ?seed=defaults — also seed default categories, rules, and a "Main" account
//   ?signIn=false  — skip setting the session cookie (for login-flow tests
//                    that need an existing user but want to drive the login
//                    UI themselves)
//   ?verified=false — leave the email unverified (for verification-gating
//                     tests); users are created verified by default
//
// Response: { userId, username, email, password } so login tests can drive
// the UI.
// Only enabled when TEST_MODE=1 (a runtime flag separate from NODE_ENV so the
// production build can be served by the e2e webserver without leaking this
// endpoint into real deployments).
export const Route = createFileRoute("/test-create-user")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.TEST_MODE !== "1") {
          return new Response("Not available", { status: 404 });
        }

        const id = crypto.randomUUID();
        const username = `t_${id.slice(0, 8)}`;
        const email = `${username}@example.com`;
        const password = "test-password";
        const passwordHash = await bcrypt.hash(password, 4);

        const url = new URL(request.url);
        const verified = url.searchParams.get("verified") !== "false";

        await db.insert(schema.users).values({
          id,
          username,
          email,
          email_verified_at: verified ? new Date() : null,
          password_hash: passwordHash,
        });

        if (url.searchParams.get("seed") === "defaults") {
          await seed(id);
          await seedDefaultRules(id);
          await seedAccount(id, "Main");
        }

        if (url.searchParams.get("signIn") !== "false") {
          const session = await useAppSession();
          await session.update({ userId: id, username, sessionVersion: 0 });
        }

        return Response.json({ userId: id, username, email, password });
      },
    },
  },
});
