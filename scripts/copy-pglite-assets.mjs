// Postbuild step: nitro inlines @electric-sql/pglite into the server bundle,
// which strips the wasm/data assets PGlite loads relative to its own module
// path (new URL("./pglite.data", import.meta.url)). Copy them next to the
// bundled module so the production server can boot PGlite (TEST_MODE E2E
// runs and DATABASE_URL-less self-hosted deployments).
import fs from "node:fs";
import path from "node:path";

const ASSETS = ["pglite.data", "pglite.wasm", "initdb.wasm"];
const src = path.resolve("node_modules/@electric-sql/pglite/dist");
const dest = path.resolve(".output/server/_libs");

if (!fs.existsSync(dest)) {
  console.error(`[copy-pglite-assets] ${dest} not found — run after "vite build"`);
  process.exit(1);
}
for (const asset of ASSETS) {
  fs.copyFileSync(path.join(src, asset), path.join(dest, asset));
}
console.log(`[copy-pglite-assets] copied ${ASSETS.join(", ")} → .output/server/_libs/`);
