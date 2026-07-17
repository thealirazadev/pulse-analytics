import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { dailySalt } from "@/lib/db/schema";

/** UTC calendar day as YYYY-MM-DD (matches the daily_salt.day date column). */
export function utcDayString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Get today's salt, creating it if absent. Race-safe under concurrent
 * beacons: INSERT ... ON CONFLICT DO NOTHING means at most one row is created
 * for a day; every caller then reads the single committed salt.
 */
export async function getTodaySalt(day: string = utcDayString()): Promise<string> {
  const db = getDb();
  const candidate = randomBytes(32).toString("hex");

  await db
    .insert(dailySalt)
    .values({ day, salt: candidate })
    .onConflictDoNothing();

  const rows = await db
    .select({ salt: dailySalt.salt })
    .from(dailySalt)
    .where(eq(dailySalt.day, day));

  const row = rows[0];
  if (!row) {
    // Should be unreachable: we just inserted-or-found the row.
    throw new Error(`daily_salt row missing for ${day} after get-or-create`);
  }
  return row.salt;
}

/**
 * Destroy every salt for a day before today. Past rollups are recomputed from
 * already-materialized hashes and never need old salts, so once a day ends its
 * salt has no legitimate use; deleting it makes cross-day linkage impossible
 * even with full database access.
 */
export async function destroyExpiredSalts(
  today: string = utcDayString(),
): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(dailySalt)
    .where(lt(dailySalt.day, today))
    .returning({ day: dailySalt.day });
  return deleted.length;
}
