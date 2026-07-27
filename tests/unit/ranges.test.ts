import { describe, expect, it } from "vitest";
import {
  buildBuckets,
  conversionRate,
  parseDimension,
  parseLimit,
  parseRange,
  zeroFill,
} from "@/lib/stats/ranges";

const NOW = new Date("2026-07-18T09:30:00Z");

describe("conversionRate", () => {
  it("is 0 when there are no visitors (no division by zero)", () => {
    expect(conversionRate(5, 0)).toBe(0);
    expect(conversionRate(0, 0)).toBe(0);
  });

  it("is the exact completions-over-visitors fraction", () => {
    expect(conversionRate(25, 100)).toBe(0.25);
    expect(conversionRate(0, 100)).toBe(0);
  });

  it("can exceed 1 for a repeatable goal completed more than once per visitor", () => {
    expect(conversionRate(3, 2)).toBe(1.5);
  });
});

describe("parseRange", () => {
  it("resolves today to the current UTC day at hourly interval", () => {
    expect(parseRange("today", NOW)).toEqual({
      key: "today",
      from: "2026-07-18",
      to: "2026-07-18",
      interval: "hour",
    });
  });

  it("resolves 7d to the last 7 UTC days at daily interval", () => {
    expect(parseRange("7d", NOW)).toEqual({
      key: "7d",
      from: "2026-07-12",
      to: "2026-07-18",
      interval: "day",
    });
  });

  it("spans exactly N days for 30d and 90d", () => {
    for (const [key, n] of [
      ["30d", 30],
      ["90d", 90],
    ] as const) {
      const r = parseRange(key, NOW)!;
      const span =
        (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) /
          86_400_000 +
        1;
      expect(span).toBe(n);
      expect(r.interval).toBe("day");
    }
  });

  it("rejects unknown ranges", () => {
    expect(parseRange("all", NOW)).toBeNull();
    expect(parseRange(null, NOW)).toBeNull();
  });
});

describe("parseDimension and parseLimit", () => {
  it("accepts the four dimensions", () => {
    expect(parseDimension("page")).toBe("page");
    expect(parseDimension("referrer")).toBe("referrer");
    expect(parseDimension("bogus")).toBeNull();
  });

  it("defaults limit to 10 and enforces 1-50", () => {
    expect(parseLimit(null)).toBe(10);
    expect(parseLimit("25")).toBe(25);
    expect(parseLimit("0")).toBeNull();
    expect(parseLimit("51")).toBeNull();
    expect(parseLimit("abc")).toBeNull();
  });
});

describe("buildBuckets and zeroFill", () => {
  it("builds hourly buckets from midnight through the current hour", () => {
    const buckets = buildBuckets(parseRange("today", NOW)!, NOW);
    expect(buckets).toHaveLength(10);
    expect(buckets[0]).toBe("2026-07-18T00:00:00.000Z");
    expect(buckets[9]).toBe("2026-07-18T09:00:00.000Z");
  });

  it("builds one bucket per day for multi-day ranges", () => {
    const buckets = buildBuckets(parseRange("7d", NOW)!, NOW);
    expect(buckets).toEqual([
      "2026-07-12",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
    ]);
  });

  it("fills missing buckets with zeros", () => {
    const filled = zeroFill(
      ["2026-07-17", "2026-07-18"],
      [{ bucket: "2026-07-18", pageviews: 5, visitors: 3 }],
    );
    expect(filled).toEqual([
      { bucket: "2026-07-17", pageviews: 0, visitors: 0 },
      { bucket: "2026-07-18", pageviews: 5, visitors: 3 },
    ]);
  });
});
