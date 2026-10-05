import { createFileRoute } from "@tanstack/react-router";
import { getCapturedEmails } from "#/server/email";

// Test-only endpoint: returns transactional emails captured in memory by the
// "test" email provider so E2E tests can extract verification and password
// reset links. `?to=` filters by recipient — required in practice because
// tests run in parallel and share the capture buffer.
// Only enabled when TEST_MODE=1 (same gating as /test-create-user).
export const Route = createFileRoute("/test-emails")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (process.env.TEST_MODE !== "1") {
          return new Response("Not available", { status: 404 });
        }
        const to = new URL(request.url).searchParams.get("to") ?? undefined;
        return Response.json({ emails: getCapturedEmails(to) });
      },
    },
  },
});
