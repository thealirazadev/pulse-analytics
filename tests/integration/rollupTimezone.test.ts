import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { site } from "@/lib/db/schema";
import { recomputeDay, recomputeHour } from "@/lib/rollup/sql";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

/**
 * The architecture guarantees "all times are UTC; a day is always a UTC day".
 * That must hold no matter what session TimeZone the operator's Postgres uses.
 * These tests run the real recompute SQL over a connection whose session zone
 * is Asia/Kolkata (+05:30) — a fractional offset that exposes both a bucket
 * split inside a single UTC hour and a shifted daily boundary if the SQL is
 * evaluated in the session zone instead of UTC.
 */
describe("rollup aggregation is timezone-independent", () => {
  let tz: postgres.Sql;

  beforeAll(async () => {
    await ensureMigrated();
    tz = postgres(process.env.DATABASE_URL as string, {
      connection: { TimeZone: "Asia/Kolkata" },
      onnotice: () => {},
    });
  });
  beforeEach(truncateAll);
  afterAll(async () => {
    await tz.end({ timeout: 5 });
    await closeDb();
  });

  async function seedSite(): Promise<number> {
    const rows = await getDb()
      .insert(site)
      .values({ publicId: "pk_tzcheck1", domain: "tz.example", name: "TZ" })
      .returning({ id: site.id });
    return rows[0]!.id;
  }

  it("keeps a single UTC hour in one bucket under a +05:30 session", async () => {
    const s = await seedSite();
    // Both inside UTC hour 14:00–15:00 (19:30–20:30 local Kolkata, which
    // straddles the local hour boundary at 20:00).
    await tz`INSERT INTO event_raw (site_id, ts, path, device, visitor_hash)
             VALUES (${s}, '2026-03-11T14:10:00Z', '/', 'desktop', ${"a".repeat(32)}),
                    (${s}, '2026-03-11T14:50:00Z', '/', 'desktop', ${"b".repeat(32)})`;

    await recomputeHour(tz, new Date("2026-03-11T14:00:00Z"));

    const rows =
      await tz`SELECT bucket, pageviews, visitors FROM rollup_hourly WHERE site_id = ${s}`;
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0]!.bucket).toISOString()).toBe(
      "2026-03-11T14:00:00.000Z",
    );
    expect(Number(rows[0]!.pageviews)).toBe(2);
    expect(Number(rows[0]!.visitors)).toBe(2);
  });

  it("attributes events to the UTC day, not the local day, under +05:30", async () => {
    const s = await seedSite();
    // 20:00Z on 2026-03-11 is 01:30 local on 2026-03-12: same UTC day, next
    // local day. It must still count toward the 2026-03-11 daily rollup.
    await tz`INSERT INTO event_raw (site_id, ts, path, device, visitor_hash)
             VALUES (${s}, '2026-03-11T09:00:00Z', '/', 'desktop', ${"a".repeat(32)}),
                    (${s}, '2026-03-11T20:00:00Z', '/', 'desktop', ${"b".repeat(32)})`;

    await recomputeDay(tz, "2026-03-11");

    const rows =
      await tz`SELECT pageviews, visitors FROM rollup_daily WHERE site_id = ${s} AND day = '2026-03-11'`;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.pageviews)).toBe(2);
    expect(Number(rows[0]!.visitors)).toBe(2);
  });
});
