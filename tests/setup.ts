import "@testing-library/jest-dom/vitest";

// Vitest runs under NODE_ENV=test by default, but our DB / test-only routes
// gate on TEST_MODE=1 instead so the production build (which has NODE_ENV
// replaced at compile time) can still flip into test mode at runtime.
process.env.TEST_MODE = "1";

// Unit tests always run against the in-memory PGlite instance — never a real
// Postgres (or a stale sqlite path) picked up from .env files.
delete process.env.DATABASE_URL;
