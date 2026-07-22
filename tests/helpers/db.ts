import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db/client";

/**
 * Integration-test database helpers. The app's DB client is pointed at
 * TEST_DATABASE_URL by tests/setup.ts, so getDb()/getSql() here operate on the
 * disposable test database and never the dev one.
 */

const TABLES = [
  "event_raw",
  "custom_event_raw",
  "daily_salt",
  "rollup_hourly",
  "rollup_daily",
  "rollup_page_daily",
  "rollup_referrer_daily",
  "rollup_country_daily",
  "rollup_device_daily",
  "rollup_custom_event_daily",
  "rollup_watermark",
  "site",
];

let migrated = false;

/** Apply all migrations to the test database once per process. */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  migrated = true;
}

/** Wipe every table and reset identity sequences between test cases. */
export async function truncateAll(): Promise<void> {
  await getSql().unsafe(
    `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

/** Close the pool so the test process can exit cleanly. */
export async function closeDb(): Promise<void> {
  await getSql().end({ timeout: 5 });
}

export { sql };
