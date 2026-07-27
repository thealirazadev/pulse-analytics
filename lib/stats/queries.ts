import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  goal,
  rollupCountryDaily,
  rollupCustomEventDaily,
  rollupDaily,
  rollupDeviceDaily,
  rollupGoalDaily,
  rollupHourly,
  rollupPageDaily,
  rollupReferrerDaily,
  site,
} from "@/lib/db/schema";
import type { Dimension, ResolvedRange, TimeseriesPoint } from "./ranges";

/**
 * Read path. This module reads ONLY the rollup tables (and `site` for id
 * resolution) — never the raw events table. A test statically asserts that
 * invariant by scanning this file.
 */

export interface Summary {
  pageviews: number;
  visitors: number;
}

export interface BreakdownRow {
  key: string;
  pageviews: number;
  visitors: number;
}

export interface CustomEventRow {
  name: string;
  count: number;
}

export interface GoalRow {
  id: number;
  name: string;
  kind: string;
  match: string;
  completions: number;
}

/** Resolve a public site id to its internal id, or null if unknown. */
export async function getSiteIdByPublicId(
  publicId: string,
): Promise<number | null> {
  const rows = await getDb()
    .select({ id: site.id })
    .from(site)
    .where(eq(site.publicId, publicId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Totals over the range. Multi-day visitors is the sum of daily uniques. */
export async function getSummary(
  siteId: number,
  range: ResolvedRange,
): Promise<Summary> {
  const rows = await getDb()
    .select({
      pageviews: sql<number>`coalesce(sum(${rollupDaily.pageviews}), 0)::int`,
      visitors: sql<number>`coalesce(sum(${rollupDaily.visitors}), 0)::int`,
    })
    .from(rollupDaily)
    .where(
      and(
        eq(rollupDaily.siteId, siteId),
        gte(rollupDaily.day, range.from),
        lte(rollupDaily.day, range.to),
      ),
    );
  return rows[0] ?? { pageviews: 0, visitors: 0 };
}

/** Sparse rollup points for the range (zero-filling happens in the route). */
export async function getTimeseries(
  siteId: number,
  range: ResolvedRange,
): Promise<TimeseriesPoint[]> {
  const db = getDb();

  if (range.interval === "hour") {
    const dayStart = `${range.from}T00:00:00.000Z`;
    const dayEnd = `${range.to}T00:00:00.000Z`;
    const rows = await db
      .select({
        bucket: rollupHourly.bucket,
        pageviews: rollupHourly.pageviews,
        visitors: rollupHourly.visitors,
      })
      .from(rollupHourly)
      .where(
        and(
          eq(rollupHourly.siteId, siteId),
          sql`${rollupHourly.bucket} >= ${dayStart}::timestamptz`,
          sql`${rollupHourly.bucket} < ${dayEnd}::timestamptz + interval '1 day'`,
        ),
      )
      .orderBy(rollupHourly.bucket);
    return rows.map((r) => ({
      bucket: new Date(r.bucket).toISOString(),
      pageviews: r.pageviews,
      visitors: r.visitors,
    }));
  }

  const rows = await db
    .select({
      bucket: rollupDaily.day,
      pageviews: rollupDaily.pageviews,
      visitors: rollupDaily.visitors,
    })
    .from(rollupDaily)
    .where(
      and(
        eq(rollupDaily.siteId, siteId),
        gte(rollupDaily.day, range.from),
        lte(rollupDaily.day, range.to),
      ),
    )
    .orderBy(rollupDaily.day);
  return rows;
}

function mapSentinel(dimension: Dimension, key: string): string {
  if (dimension === "referrer" && key === "") return "(direct)";
  if (dimension === "country" && key.trim() === "ZZ") return "Unknown";
  return dimension === "country" ? key.trim() : key;
}

/** Top-N breakdown for a dimension over the range, ordered by pageviews desc. */
export async function getBreakdown(
  siteId: number,
  range: ResolvedRange,
  dimension: Dimension,
  limit: number,
): Promise<BreakdownRow[]> {
  const db = getDb();
  const pageviews = sql<number>`sum(pageviews)::int`;
  const visitors = sql<number>`sum(visitors)::int`;

  const table =
    dimension === "page"
      ? rollupPageDaily
      : dimension === "referrer"
        ? rollupReferrerDaily
        : dimension === "country"
          ? rollupCountryDaily
          : rollupDeviceDaily;

  const keyColumn =
    table === rollupPageDaily
      ? rollupPageDaily.path
      : table === rollupReferrerDaily
        ? rollupReferrerDaily.referrerHost
        : table === rollupCountryDaily
          ? rollupCountryDaily.country
          : rollupDeviceDaily.device;

  const rows = await db
    .select({ key: keyColumn, pageviews, visitors })
    .from(table)
    .where(
      and(
        eq(table.siteId, siteId),
        gte(table.day, range.from),
        lte(table.day, range.to),
      ),
    )
    .groupBy(keyColumn)
    .orderBy(desc(pageviews))
    .limit(limit);

  return rows.map((r) => ({
    key: mapSentinel(dimension, String(r.key)),
    pageviews: r.pageviews,
    visitors: r.visitors,
  }));
}

/**
 * A site's goals with their summed completions over the range, ordered by
 * completions desc. Reads `goal` and `rollup_goal_daily` only, never a raw
 * table. The left join keeps goals with zero completions in the result so a
 * newly registered goal still appears. Conversion rate is computed in the route
 * from these completions and the range's visitor total.
 */
export async function getGoals(
  siteId: number,
  range: ResolvedRange,
): Promise<GoalRow[]> {
  const completions = sql<number>`coalesce(sum(${rollupGoalDaily.completions}), 0)::int`;
  const rows = await getDb()
    .select({
      id: goal.id,
      name: goal.name,
      kind: goal.kind,
      match: goal.matchValue,
      completions,
    })
    .from(goal)
    .leftJoin(
      rollupGoalDaily,
      and(
        eq(rollupGoalDaily.goalId, goal.id),
        gte(rollupGoalDaily.day, range.from),
        lte(rollupGoalDaily.day, range.to),
      ),
    )
    .where(eq(goal.siteId, siteId))
    .groupBy(goal.id)
    .orderBy(desc(completions), asc(goal.id));
  return rows;
}

/** Top named custom events by summed count over the range (rollup table only). */
export async function getCustomEvents(
  siteId: number,
  range: ResolvedRange,
  limit: number,
): Promise<CustomEventRow[]> {
  const count = sql<number>`sum(${rollupCustomEventDaily.count})::int`;
  const rows = await getDb()
    .select({ name: rollupCustomEventDaily.name, count })
    .from(rollupCustomEventDaily)
    .where(
      and(
        eq(rollupCustomEventDaily.siteId, siteId),
        gte(rollupCustomEventDaily.day, range.from),
        lte(rollupCustomEventDaily.day, range.to),
      ),
    )
    .groupBy(rollupCustomEventDaily.name)
    .orderBy(desc(count))
    .limit(limit);
  return rows;
}
