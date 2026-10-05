import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";


// Any Postgres-dialect Drizzle database, regardless of driver.
// oxlint-disable-next-line no-explicit-any
export type AnyPgDatabase = NodePgDatabase<any> | PgliteDatabase<any>;

/**
 * Throws when the database has fewer applied migrations than the journal
 * expects — the code would be running against an outdated schema.
 */
export async function assertSchemaUpToDate(
  db: AnyPgDatabase,
  migrationsFolder: string,
): Promise<void> {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: unknown[] };
  const result = await db.execute(
    sql`SELECT count(*)::int AS c FROM drizzle.__drizzle_migrations`,
  );
  const applied = (result.rows[0] as { c: number }).c;
  if (applied < journal.entries.length) {
    throw new Error(
      `[DB] Schema out of date: ${applied} of ${journal.entries.length} migrations applied. Refusing to start.`,
    );
  }
}

/**
 * Applies all pending Drizzle migrations (idempotent — applied migrations
 * are tracked in `drizzle.__drizzle_migrations`), then asserts the schema
 * version matches what the code expects. Runs at startup for every database —
 * in-memory test DBs and the production Postgres alike.
 */
export async function runMigrations(
  db: AnyPgDatabase,
  driver: "node-postgres" | "pglite",
  migrationsFolder: string = join(process.cwd(), "drizzle"),
): Promise<void> {
  if (driver === "pglite") {
    await migratePglite(db as PgliteDatabase<Record<string, unknown>>, {
      migrationsFolder,
    });
  } else {
    await migrateNodePg(db as NodePgDatabase<Record<string, unknown>>, {
      migrationsFolder,
    });
  }
  await assertSchemaUpToDate(db, migrationsFolder);
}
