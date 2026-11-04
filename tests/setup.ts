import "@testing-library/jest-dom/vitest";

// Load local env vars for tests that need them. Missing file is fine; CI
// provides env directly.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file present; rely on process env
}

// Integration tests must never touch the dev database: they truncate every
// table. Point the app's DB client at the disposable test database for the
// whole test process, falling back to the documented default rather than to
// DATABASE_URL.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgres://pulse:pulse@localhost:5432/pulse_test";
