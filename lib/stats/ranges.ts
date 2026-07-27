/**
 * Stats query parameter parsing, hand-rolled with unit tests. All boundaries
 * are UTC. `today` is the current UTC day at hourly resolution; the others are
 * the last N UTC days (including today) at daily resolution.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type RangeKey = "today" | "7d" | "30d" | "90d";
export type Interval = "hour" | "day";
export type Dimension = "page" | "referrer" | "country" | "device";

export interface ResolvedRange {
  key: RangeKey;
  /** Inclusive UTC day (YYYY-MM-DD). */
  from: string;
  to: string;
  interval: Interval;
}

export interface TimeseriesPoint {
  bucket: string;
  pageviews: number;
  visitors: number;
}

const DAY_COUNTS: Record<Exclude<RangeKey, "today">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function floorHour(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/** Parse a range param into resolved UTC bounds, or null if invalid. */
export function parseRange(
  input: string | null,
  now: Date = new Date(),
): ResolvedRange | null {
  const nowMs = now.getTime();
  const today = utcDay(nowMs);

  if (input === "today") {
    return { key: "today", from: today, to: today, interval: "hour" };
  }
  if (input === "7d" || input === "30d" || input === "90d") {
    const n = DAY_COUNTS[input];
    const from = utcDay(nowMs - (n - 1) * DAY_MS);
    return { key: input, from, to: today, interval: "day" };
  }
  return null;
}

export function parseDimension(input: string | null): Dimension | null {
  if (
    input === "page" ||
    input === "referrer" ||
    input === "country" ||
    input === "device"
  ) {
    return input;
  }
  return null;
}

/** Limit is 1–50, default 10 when absent; anything else is invalid (null). */
export function parseLimit(input: string | null): number | null {
  if (input === null) return 10;
  if (!/^\d+$/.test(input)) return null;
  const n = Number(input);
  if (n < 1 || n > 50) return null;
  return n;
}

/**
 * The continuous list of bucket keys for a range: hourly from midnight through
 * the current hour for `today`, otherwise one per UTC day in [from, to].
 */
export function buildBuckets(
  range: ResolvedRange,
  now: Date = new Date(),
): string[] {
  const buckets: string[] = [];
  if (range.interval === "hour") {
    const start = Date.parse(`${range.from}T00:00:00Z`);
    const end = floorHour(now.getTime());
    for (let t = start; t <= end; t += HOUR_MS) {
      buckets.push(new Date(t).toISOString());
    }
    return buckets;
  }
  const start = Date.parse(`${range.from}T00:00:00Z`);
  const end = Date.parse(`${range.to}T00:00:00Z`);
  for (let t = start; t <= end; t += DAY_MS) {
    buckets.push(utcDay(t));
  }
  return buckets;
}

/**
 * Goal conversion rate as a fraction: completions per unique visitor over the
 * range. Zero visitors yields 0. May exceed 1 for repeatable goals (a visitor
 * can complete more than once); the panel renders it as a percentage and labels
 * the denominator ("visitors = unique per day, summed") honestly. `visitors` is
 * the same figure `/api/stats/summary` returns for the site and range.
 */
export function conversionRate(completions: number, visitors: number): number {
  if (visitors <= 0) return 0;
  return completions / visitors;
}

/** Merge rollup points onto the continuous bucket list, filling gaps with zeros. */
export function zeroFill(
  buckets: string[],
  rows: TimeseriesPoint[],
): TimeseriesPoint[] {
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  return buckets.map(
    (bucket) => byBucket.get(bucket) ?? { bucket, pageviews: 0, visitors: 0 },
  );
}
