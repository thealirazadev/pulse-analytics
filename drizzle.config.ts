import { defineConfig } from "drizzle-kit";

// drizzle-kit runs this file directly. Load .env only when DATABASE_URL is not
// already set, so an explicit `DATABASE_URL=... drizzle-kit` (e.g. the test
// database) overrides the .env value instead of being clobbered by it.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // rely on ambient env when no .env file exists
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required to run drizzle-kit");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
