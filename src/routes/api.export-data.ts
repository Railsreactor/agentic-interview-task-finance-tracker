import { createFileRoute } from "@tanstack/react-router";
import { buildExportZip } from "#/server/compliance.server";
import { resolveSessionUser } from "#/server/session";

//
// GDPR data-portability download: everything the app stores about the
// signed-in user as a zip (export.json, per-table CSVs, receipt images).
// A GET server route rather than a server function so the browser gets a
// real file download (Content-Disposition) instead of an RPC payload.
// Session-cookie authenticated; GET is exempt from the CSRF middleware but
// only ever reads the caller's own data.
export const Route = createFileRoute("/api/export-data")({
  server: {
    handlers: {
      GET: async () => {
        const user = await resolveSessionUser();
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }

        const zip = await buildExportZip(user.id);
        const date = new Date().toISOString().slice(0, 10);
        return new Response(new Uint8Array(zip), {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="finance-tracker-export-${date}.zip"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
