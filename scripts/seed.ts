#!/usr/bin/env -S npx tsx
// scripts/seed.ts — CLI entrypoint that delegates to `[[src/server/seed.ts]]`.
//
// Usage: npx tsx scripts/seed.ts <userId>
//
// Seeds the database selected by the environment (DATABASE_URL → Postgres,
// otherwise the local PGlite instance at ./data/pg).


import { seed, seedDefaultRules } from "../src/server/seed.ts";

export { seed, seedDefaultRules };

if (import.meta.main || process.argv[1]?.endsWith("seed.ts")) {
  const userId = process.argv[2];
  if (!userId) {
    console.error("[seed] Usage: npx tsx scripts/seed.ts <userId>");
    process.exit(1);
  }
  console.log(`[seed] Seeding for user ${userId}…`);
  const totalCats = await seed(userId);
  console.log(`[seed] Added ${totalCats} categories`);
  const insertedRules = await seedDefaultRules(userId);
  console.log(`[seed] Added ${insertedRules} categorization rules`);
  process.exit(0);
}
