#!/usr/bin/env -S npx tsx
// scripts/migrate-sqlite-to-postgres.ts — one-shot data migration for
// existing self-hosted installs: copies every row from the legacy SQLite
// file into the Postgres database selected by the environment (DATABASE_URL
// → managed Postgres, otherwise the local PGlite instance at ./data/pg),
// and moves receipt images into the configured storage driver.
//
// Usage: npx tsx scripts/migrate-sqlite-to-postgres.ts [path/to/finance.db]
//
// Tolerates any historical SQLite schema version (the SQLite migration
// history is no longer shipped, so the source may be arbitrarily old):
//   - float-era money columns (`amount`, `unit_price`, `total_price`) are
//     converted to integer minor units; `*_minor` columns are used directly
//   - receipts without a `user_id` column derive ownership from their linked
//     transaction; unlinked receipts are skipped with a warning
//   - missing tables/columns (auth_tokens, users.email, …) are skipped or
//     defaulted
//   - unix-epoch integer timestamps → timestamptz
//   - transactions.date "YYYY-MM-DDTHH:mm:ss" → DATE (time part truncated)
//   - receipts.image_path "data/receipts/…" → storage key "receipts/…";
//     when STORAGE_DRIVER=s3, image bytes are also uploaded to the bucket
//
// Idempotent: rows already present in the target (same primary key) are
// skipped, so a partially-failed run can simply be re-run.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";

const sqlitePath = process.argv[2] ?? "./data/finance.db";
if (!fs.existsSync(sqlitePath)) {
  console.error(`[migrate] SQLite database not found: ${sqlitePath}`);
  process.exit(1);
}

const { db, schema } = await import("../src/db/index.ts");
const { normalizeStorageKey, storage } = await import("../src/server/storage.ts");

const sqlite = new Database(sqlitePath, { readonly: true });

type Row = Record<string, unknown>;

function tableExists(table: string): boolean {
  return (
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) !== undefined
  );
}

function columns(table: string): Set<string> {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(cols.map((c) => c.name));
}

function all(table: string): Row[] {
  return sqlite.prepare(`SELECT * FROM ${table}`).all() as Row[];
}

function toDate(epochSeconds: unknown): Date | null {
  if (epochSeconds === null || epochSeconds === undefined) return null;
  return new Date(Number(epochSeconds) * 1000);
}

function toDateOnly(value: unknown): string {
  // "2025-01-15T14:30:00" or "2025-01-15" → "2025-01-15"
  return String(value).slice(0, 10);
}

function toMinor(row: Row, minorCol: string, floatCol: string): number | null {
  if (minorCol in row && row[minorCol] !== null && row[minorCol] !== undefined) {
    return Number(row[minorCol]);
  }
  if (row[floatCol] === null || row[floatCol] === undefined) return null;
  return Math.round(Number(row[floatCol]) * 100);
}

async function countRows(table: string): Promise<number> {
  const result = await db.execute(
    sql`SELECT count(*)::int AS c FROM ${sql.identifier(table)}`,
  );
  return (result.rows[0] as { c: number }).c;
}

async function insertAll(
  label: string,
  // oxlint-disable-next-line no-explicit-any
  table: any,
  rows: Row[],
): Promise<void> {
  const before = await countRows(label);
  for (const row of rows) {
    await db.insert(table).values(row).onConflictDoNothing();
  }
  const inserted = (await countRows(label)) - before;
  console.log(
    `[migrate] ${label}: ${inserted}/${rows.length} rows inserted (rest already present)`,
  );
}

// --- users ---

await insertAll(
  "users",
  schema.users,
  all("users").map((r) => ({
    id: r.id,
    username: r.username,
    email: (r.email as string | undefined) ?? null,
    email_verified_at: toDate(r.email_verified_at ?? null),
    password_hash: r.password_hash,
    session_version: Number(r.session_version ?? 0),
    created_at: toDate(r.created_at),
  })),
);

// --- auth_tokens (added in ticket 102 — may not exist in old installs) ---

if (tableExists("auth_tokens")) {
  await insertAll(
    "auth_tokens",
    schema.auth_tokens,
    all("auth_tokens").map((r) => ({
      ...r,
      expires_at: toDate(r.expires_at),
      used_at: toDate(r.used_at),
      created_at: toDate(r.created_at),
    })),
  );
} else {
  console.log("[migrate] auth_tokens: table not present in source, skipping");
}

// --- sessions (skipped: users just log in again) ---

console.log("[migrate] sessions: intentionally not migrated (users re-login)");

// --- accounts, categories, import_batches ---

await insertAll(
  "accounts",
  schema.accounts,
  all("accounts").map((r) => ({ ...r, created_at: toDate(r.created_at) })),
);

await insertAll(
  "categories",
  schema.categories,
  all("categories").map((r) => ({ ...r, created_at: toDate(r.created_at) })),
);

await insertAll(
  "import_batches",
  schema.import_batches,
  all("import_batches").map((r) => ({ ...r, created_at: toDate(r.created_at) })),
);

// --- transactions (float era: `amount`; minor era: `amount_minor`) ---

await insertAll(
  "transactions",
  schema.transactions,
  all("transactions").map((r) => ({
    id: r.id,
    user_id: r.user_id,
    account_id: r.account_id,
    date: toDateOnly(r.date),
    amount_minor: toMinor(r, "amount_minor", "amount") ?? 0,
    description: r.description ?? null,
    category_id: r.category_id ?? null,
    source: r.source ?? "manual",
    source_ref: r.source_ref ?? null,
    import_batch_id: r.import_batch_id ?? null,
    created_at: toDate(r.created_at),
  })),
);

// --- receipts (user_id column added in ticket 101 — derive when missing) ---

let migratedImages = 0;
const receiptCols = tableExists("receipts") ? columns("receipts") : new Set<string>();
const txnOwner = new Map<string, string>(
  all("transactions").map((r) => [String(r.id), String(r.user_id)]),
);

const receiptRows: Row[] = [];
for (const r of tableExists("receipts") ? all("receipts") : []) {
  const userId = receiptCols.has("user_id")
    ? r.user_id
    : r.transaction_id
      ? txnOwner.get(String(r.transaction_id))
      : undefined;
  if (!userId) {
    console.warn(`[migrate] receipts: skipping unowned receipt ${r.id} (no user_id, no linked transaction)`);
    continue;
  }

  let key: string | null = null;
  if (r.image_path) {
    key = normalizeStorageKey(String(r.image_path));
    if (!key) {
      console.warn(`[migrate] receipts: invalid image path on ${r.id}: ${r.image_path}`);
    } else if (process.env.STORAGE_DRIVER === "s3") {
      // Local driver: bytes are already at ./data/<key>. S3: upload them.
      const localPath = path.resolve(process.cwd(), String(r.image_path));
      if (fs.existsSync(localPath)) {
        await storage.put(key, fs.readFileSync(localPath));
        migratedImages++;
      } else {
        console.warn(`[migrate] receipts: image missing on disk, key kept anyway: ${r.image_path}`);
      }
    }
  }

  receiptRows.push({
    id: r.id,
    user_id: userId,
    transaction_id: r.transaction_id ?? null,
    image_path: key,
    ai_raw_response: r.ai_raw_response ?? null,
    created_at: toDate(r.created_at),
  });
}
await insertAll("receipts", schema.receipts, receiptRows);

// --- receipt_items (float era: unit_price/total_price) ---

const keptReceiptIds = new Set(receiptRows.map((r) => String(r.id)));
await insertAll(
  "receipt_items",
  schema.receipt_items,
  all("receipt_items")
    .filter((r) => keptReceiptIds.has(String(r.receipt_id)))
    .map((r) => ({
      id: r.id,
      receipt_id: r.receipt_id,
      name: r.name,
      quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
      unit_price_minor: toMinor(r, "unit_price_minor", "unit_price"),
      total_price_minor: toMinor(r, "total_price_minor", "total_price") ?? 0,
      category_id: r.category_id ?? null,
      created_at: toDate(r.created_at),
    })),
);

// --- categorization_rules ---

await insertAll(
  "categorization_rules",
  schema.categorization_rules,
  all("categorization_rules").map((r) => ({ ...r, created_at: toDate(r.created_at) })),
);

if (process.env.STORAGE_DRIVER === "s3") {
  console.log(`[migrate] uploaded ${migratedImages} receipt images to S3`);
}
console.log("[migrate] done");
process.exit(0);
