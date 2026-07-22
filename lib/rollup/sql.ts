import type postgres from "postgres";

/**
 * Hand-written aggregation SQL. Every rollup write is INSERT ... ON CONFLICT
 * DO UPDATE with freshly recomputed values (overwrite, never increment): this
 * is what makes the job idempotent, replay-safe, and catch-up safe. Within a
 * bucket/day's active window raw events only accumulate, so keys never vanish
 * and an upsert fully reconstructs the row.
 *
 * `Queryable` is the base interface shared by the pooled client and a
 * transaction handle from `begin`, so these run in either context.
 */
type Queryable = postgres.ISql;

/** Recompute one hourly bucket (all sites) from raw events. */
export async function recomputeHour(
  sql: Queryable,
  bucketStart: Date,
): Promise<void> {
  // Bind timestamps as ISO text with an explicit cast: robust across module
  // realms (test runners) where a cross-realm Date would fail serialization.
  const start = bucketStart.toISOString();
  // date_trunc's 3-argument form pins bucketing to UTC regardless of the
  // Postgres session TimeZone, so "a day/hour is always a UTC day/hour" holds
  // even when the operator's server runs in a non-UTC zone.
  await sql`
    INSERT INTO rollup_hourly (site_id, bucket, pageviews, visitors)
    SELECT site_id,
           date_trunc('hour', ts, 'UTC') AS bucket,
           count(*)::int,
           count(DISTINCT visitor_hash)::int
    FROM event_raw
    WHERE ts >= ${start}::timestamptz
      AND ts < ${start}::timestamptz + interval '1 hour'
    GROUP BY site_id, date_trunc('hour', ts, 'UTC')
    ON CONFLICT (site_id, bucket)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;
}

/**
 * Recompute every rollup for one UTC day (totals plus the four breakdowns).
 * Daily `visitors` is the exact COUNT(DISTINCT visitor_hash) across the day —
 * never a sum of hourly figures. NULL dimensions map to their sentinels
 * ('' = direct referrer, 'ZZ' = unknown country).
 */
export async function recomputeDay(sql: Queryable, day: string): Promise<void> {
  // Bound the day as an explicit UTC instant. `${day}::date` compared against a
  // timestamptz would be promoted using the session TimeZone, shifting the
  // 24-hour window off the UTC day on any non-UTC server; a timestamptz bound
  // is unambiguous. The stored `day` column value is a plain date literal.
  const dayStart = `${day}T00:00:00Z`;
  await sql`
    INSERT INTO rollup_daily (site_id, day, pageviews, visitors)
    SELECT site_id, ${day}::date, count(*)::int, count(DISTINCT visitor_hash)::int
    FROM event_raw
    WHERE ts >= ${dayStart}::timestamptz AND ts < ${dayStart}::timestamptz + interval '1 day'
    GROUP BY site_id
    ON CONFLICT (site_id, day)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;

  await sql`
    INSERT INTO rollup_page_daily (site_id, day, path, pageviews, visitors)
    SELECT site_id, ${day}::date, path, count(*)::int, count(DISTINCT visitor_hash)::int
    FROM event_raw
    WHERE ts >= ${dayStart}::timestamptz AND ts < ${dayStart}::timestamptz + interval '1 day'
    GROUP BY site_id, path
    ON CONFLICT (site_id, day, path)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;

  await sql`
    INSERT INTO rollup_referrer_daily (site_id, day, referrer_host, pageviews, visitors)
    SELECT site_id, ${day}::date, coalesce(referrer_host, ''),
           count(*)::int, count(DISTINCT visitor_hash)::int
    FROM event_raw
    WHERE ts >= ${dayStart}::timestamptz AND ts < ${dayStart}::timestamptz + interval '1 day'
    GROUP BY site_id, coalesce(referrer_host, '')
    ON CONFLICT (site_id, day, referrer_host)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;

  await sql`
    INSERT INTO rollup_country_daily (site_id, day, country, pageviews, visitors)
    SELECT site_id, ${day}::date, coalesce(country, 'ZZ'),
           count(*)::int, count(DISTINCT visitor_hash)::int
    FROM event_raw
    WHERE ts >= ${dayStart}::timestamptz AND ts < ${dayStart}::timestamptz + interval '1 day'
    GROUP BY site_id, coalesce(country, 'ZZ')
    ON CONFLICT (site_id, day, country)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;

  await sql`
    INSERT INTO rollup_device_daily (site_id, day, device, pageviews, visitors)
    SELECT site_id, ${day}::date, device, count(*)::int, count(DISTINCT visitor_hash)::int
    FROM event_raw
    WHERE ts >= ${dayStart}::timestamptz AND ts < ${dayStart}::timestamptz + interval '1 day'
    GROUP BY site_id, device
    ON CONFLICT (site_id, day, device)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;
}

/**
 * Recompute the custom-event daily counts for one UTC day. Counts only — one
 * row per (site, name) with its occurrence count, no distinct-visitor figure.
 * Same recompute-and-overwrite idempotency and explicit UTC timestamptz day
 * bounds as recomputeDay.
 */
export async function recomputeCustomEventDay(
  sql: Queryable,
  day: string,
): Promise<void> {
  const dayStart = `${day}T00:00:00Z`;
  await sql`
    INSERT INTO rollup_custom_event_daily (site_id, day, name, "count")
    SELECT site_id, ${day}::date, name, count(*)::int
    FROM custom_event_raw
    WHERE ts >= ${dayStart}::timestamptz AND ts < ${dayStart}::timestamptz + interval '1 day'
    GROUP BY site_id, name
    ON CONFLICT (site_id, day, name)
      DO UPDATE SET "count" = EXCLUDED."count"
  `;
}

/** Delete raw events older than the cutoff; returns the number pruned. */
export async function pruneRawOlderThan(
  sql: Queryable,
  cutoff: Date,
): Promise<number> {
  const iso = cutoff.toISOString();
  const result = await sql`DELETE FROM event_raw WHERE ts < ${iso}::timestamptz`;
  return result.count;
}

/** Delete custom events older than the cutoff; returns the number pruned. */
export async function pruneCustomEventRawOlderThan(
  sql: Queryable,
  cutoff: Date,
): Promise<number> {
  const iso = cutoff.toISOString();
  const result = await sql`DELETE FROM custom_event_raw WHERE ts < ${iso}::timestamptz`;
  return result.count;
}
