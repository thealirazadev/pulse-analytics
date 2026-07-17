import { getSql } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { destroyExpiredSalts, utcDayString } from "@/lib/privacy/salt";
import { pruneRawOlderThan, recomputeDay, recomputeHour } from "./sql";

const HOUR_MS = 3_600_000;
const RAW_RETENTION_HOURS = 72;
const GRACE_MS = 5 * 60 * 1000;
const MAX_BUCKETS_PER_RUN = 78;
// Fixed key so only one rollup run proceeds at a time (advisory lock).
export const ROLLUP_LOCK_KEY = 428_913_570;

export interface RollupSummary {
  hoursProcessed: number;
  daysRecomputed: number;
  rawPruned: number;
  saltsDestroyed: number;
  finalizedThrough: string;
}

export interface RollupLocked {
  locked: true;
}

function floorHour(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/**
 * Recompute-and-overwrite aggregation. Idempotent and catch-up safe: it always
 * processes "watermark to now", so missed runs self-heal on the next tick. The
 * advisory lock guarantees a single concurrent run; a second caller gets a
 * "locked" result and the route maps it to 409.
 */
export async function runRollup(
  now: Date = new Date(),
): Promise<RollupSummary | RollupLocked> {
  const sql = getSql();
  const reserved = await sql.reserve();
  try {
    const lockRows = await reserved<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(${ROLLUP_LOCK_KEY}) AS locked`;
    if (!lockRows[0]?.locked) {
      return { locked: true };
    }

    try {
      return await execute(now);
    } finally {
      await reserved`SELECT pg_advisory_unlock(${ROLLUP_LOCK_KEY})`;
    }
  } finally {
    reserved.release();
  }
}

async function execute(now: Date): Promise<RollupSummary> {
  const sql = getSql();
  const nowMs = now.getTime();
  const currentHourMs = floorHour(nowMs);

  // Read or bootstrap the watermark. Bootstrap starts one retention window back
  // so the first run folds in all raw data still on hand.
  const wmRows = await sql<
    { finalized_through: string | Date }[]
  >`SELECT finalized_through FROM rollup_watermark WHERE id = 1`;

  let finalizedThroughMs: number;
  if (wmRows.length === 0) {
    finalizedThroughMs = currentHourMs - RAW_RETENTION_HOURS * HOUR_MS;
    await sql`
      INSERT INTO rollup_watermark (id, finalized_through)
      VALUES (1, ${new Date(finalizedThroughMs).toISOString()}::timestamptz)
      ON CONFLICT (id) DO NOTHING
    `;
  } else {
    finalizedThroughMs = floorHour(
      new Date(wmRows[0]!.finalized_through).getTime(),
    );
  }

  // Hour buckets from the watermark through the current partial hour, capped.
  const buckets: Date[] = [];
  for (
    let s = finalizedThroughMs;
    s <= currentHourMs && buckets.length < MAX_BUCKETS_PER_RUN;
    s += HOUR_MS
  ) {
    buckets.push(new Date(s));
  }

  const processed: Date[] = [];
  for (const bucket of buckets) {
    try {
      await sql.begin((tx) => recomputeHour(tx, bucket));
      processed.push(bucket);
    } catch (err) {
      logger.error("rollup_bucket_failed", {
        bucket: bucket.toISOString(),
        message: err instanceof Error ? err.message : "unknown",
      });
      break;
    }
  }

  const touchedDays = new Set(processed.map((b) => utcDayString(b)));
  for (const day of touchedDays) {
    try {
      await sql.begin((tx) => recomputeDay(tx, day));
    } catch (err) {
      logger.error("rollup_day_failed", {
        day,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // Advance the watermark to the end of the newest hour that is both processed
  // and over by at least the grace period (guards in-flight inserts).
  const graceBoundaryMs = floorHour(nowMs - GRACE_MS);
  const lastProcessedEndMs =
    processed.length > 0
      ? processed[processed.length - 1]!.getTime() + HOUR_MS
      : finalizedThroughMs;
  const newFinalizedMs = Math.max(
    finalizedThroughMs,
    Math.min(graceBoundaryMs, lastProcessedEndMs),
  );
  const newFinalized = new Date(newFinalizedMs);

  await sql`
    UPDATE rollup_watermark
    SET finalized_through = ${newFinalized.toISOString()}::timestamptz
    WHERE id = 1
  `;

  // Housekeeping: prune raw past retention (anything that old is finalized) and
  // destroy salts for days before today.
  const cutoff = new Date(nowMs - RAW_RETENTION_HOURS * HOUR_MS);
  const rawPruned = await pruneRawOlderThan(sql, cutoff);
  const saltsDestroyed = await destroyExpiredSalts(utcDayString(now));

  const summary: RollupSummary = {
    hoursProcessed: processed.length,
    daysRecomputed: touchedDays.size,
    rawPruned,
    saltsDestroyed,
    finalizedThrough: newFinalized.toISOString(),
  };
  logger.info("rollup_run", { ...summary });
  return summary;
}
