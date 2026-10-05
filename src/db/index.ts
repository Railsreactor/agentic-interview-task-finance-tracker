import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";
import { runMigrations } from "./migrate.ts";
import { logger } from "#/server/logger";

// Driver selection (one dialect — Postgres — three deployment shapes):
//   - DATABASE_URL set (postgres://…)  → node-postgres pool (production/managed PG)
//   - TEST_MODE=1                      → in-memory PGlite (unit tests, E2E dev server)
//   - otherwise                        → persistent PGlite at ./data/pg (local dev)

/** Canonical DB type — PGlite databases are query-API compatible. */
export type Db = NodePgDatabase<typeof schema>;

async function createDb(): Promise<Db> {
  // TEST_MODE wins over DATABASE_URL: tests must be hermetic and never
  // touch a real database, whatever the local .env says.
  const url = process.env.TEST_MODE === "1" ? undefined : process.env.DATABASE_URL;
  if (url) {
    if (!url.startsWith("postgres")) {
      throw new Error(
        `[DB] DATABASE_URL must be a postgres:// connection string, got: ${url}`,
      );
    }
    logger.info("connecting to Postgres via node-postgres pool");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pg = (await import("pg")).default;
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzle(pool, { schema });
    logger.info("running migrations");
    await runMigrations(db, "node-postgres");
    return db;
  }

  const dataDir = process.env.TEST_MODE === "1" ? "memory://" : "./data/pg";
  logger.info({ dataDir }, "starting PGlite");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  logger.info("running migrations");
  await runMigrations(db, "pglite");
  return db as unknown as Db;
}

export const db: Db = await createDb();

export { schema };
