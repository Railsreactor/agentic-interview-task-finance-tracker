import { createFileRoute } from "@tanstack/react-router";
import { db } from "#/db";
import { checkAIBackendHealth } from "#/server/ai";
import { checkReadiness } from "#/server/health.server";

//
// Readiness probe: 200 when the database is reachable and the schema is
// migration-current, 503 otherwise. Deploy gating and load balancers key off
// this — a booting or schema-outdated instance must not receive traffic.
// The AI backend check is informational only (an unreachable llama.cpp box
// degrades scanning gracefully; it must not pull the instance from rotation).
export const Route = createFileRoute("/health/ready")({
  server: {
    handlers: {
      GET: async () => {
        const result = await checkReadiness(db);
        const ai = await checkAIBackendHealth();
        return Response.json(
          { ...result, checks: { ...result.checks, ai } },
          { status: result.ready ? 200 : 503 },
        );
      },
    },
  },
});
