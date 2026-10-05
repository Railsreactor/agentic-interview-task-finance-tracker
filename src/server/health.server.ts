import { join } from "node:path";
import { sql } from "drizzle-orm";
import { assertSchemaUpToDate, type AnyPgDatabase } from "#/db/migrate";

//
// Readiness logic, separated from the route handler so it can be unit-tested
// against an in-memory database. Liveness needs no helper — a process that
// can answer HTTP is alive.

export interface ReadinessResult {
  ready: boolean;
  checks: {
    database: "ok" | "error";
    migrations: "ok" | "error";
  };
}

/**
 * Ready = the database answers a query AND every migration the code expects
 * has been applied. A schema-outdated instance reports not-ready so a load
 * balancer / orchestrator never routes traffic to it.
 */
export async function checkReadiness(
  db: AnyPgDatabase,
  migrationsFolder: string = join(process.cwd(), "drizzle"),
): Promise<ReadinessResult> {
  const checks: ReadinessResult["checks"] = {
    database: "error",
    migrations: "error",
  };
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
    await assertSchemaUpToDate(db, migrationsFolder);
    checks.migrations = "ok";
  } catch {
    // The failing check keeps its "error" value; details go to the logs at
    // the call site — this result is returned to unauthenticated probes.
  }
  return { ready: checks.database === "ok" && checks.migrations === "ok", checks };
}
