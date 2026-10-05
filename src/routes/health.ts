import { createFileRoute } from "@tanstack/react-router";

//
// Liveness probe: answers 200 as long as the process can serve HTTP. Used by
// the Docker HEALTHCHECK and external uptime monitors. Readiness (DB, schema)
// lives at /health/ready.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => Response.json({ status: "ok" }),
    },
  },
});
