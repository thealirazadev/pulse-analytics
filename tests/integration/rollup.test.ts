import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { eventRaw, site } from "@/lib/db/schema";
import { ROLLUP_LOCK_KEY, runRollup, type RollupSummary } from "@/lib/rollup/job";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

const NOW = new Date("2026-05-15T12:30:00Z");

async function seedSite(): Promise<number> {
  const rows = await getDb()
    .insert(site)
    .values({ publicId: "pk_test0001", domain: "example.com", name: "Ex" })
    .returning({ id: site.id });
  return rows[0]!.id;
}

interface RawOpts {
  path?: string;
  referrerHost?: string | null;
  country?: string | null;
  device?: string;
}

async function insertRaw(
  siteId: number,
  iso: string,
  hash: string,
  opts: RawOpts = {},
): Promise<void> {
  await getDb()
    .insert(eventRaw)
    .values({
      siteId,
      ts: new Date(iso),
      path: opts.path ?? "/",
      referrerHost: opts.referrerHost ?? null,
      country: opts.country ?? null,
      device: opts.device ?? "desktop",
      visitorHash: hash,
    });
}

async function snapshot(): Promise<string> {
  const sql = getSql();
  const hourly =
    await sql`SELECT site_id, bucket, pageviews, visitors FROM rollup_hourly ORDER BY site_id, bucket`;
  const daily =
    await sql`SELECT site_id, day, pageviews, visitors FROM rollup_daily ORDER BY site_id, day`;
  const page =
    await sql`SELECT site_id, day, path, pageviews, visitors FROM rollup_page_daily ORDER BY site_id, day, path`;
  const referrer =
    await sql`SELECT site_id, day, referrer_host, pageviews, visitors FROM rollup_referrer_daily ORDER BY site_id, day, referrer_host`;
  const country =
    await sql`SELECT site_id, day, country, pageviews, visitors FROM rollup_country_daily ORDER BY site_id, day, country`;
  const device =
    await sql`SELECT site_id, day, device, pageviews, visitors FROM rollup_device_daily ORDER BY site_id, day, device`;
  return JSON.stringify({
    hourly,
    daily,
    page,
    referrer,
    country,
    device,
  });
}

function summary(r: RollupSummary | { locked: true }): RollupSummary {
  if ("locked" in r) throw new Error("unexpected lock");
  return r;
}

describe("rollup job", () => {
  beforeAll(ensureMigrated);
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("is idempotent: recompute-and-overwrite converges to identical rows", async () => {
    const s = await seedSite();
    await insertRaw(s, "2026-05-15T07:10:00Z", "a".repeat(32));
    await insertRaw(s, "2026-05-15T07:40:00Z", "b".repeat(32));
    await insertRaw(s, "2026-05-15T08:05:00Z", "a".repeat(32));

    summary(await runRollup(NOW));
    const first = await snapshot();

    // Force a full reprocess of the same raw and confirm nothing changes.
    await getSql()`UPDATE rollup_watermark SET finalized_through = ${new Date(
      "2026-05-15T06:00:00Z",
    ).toISOString()}::timestamptz`;
    summary(await runRollup(NOW));
    const second = await snapshot();

    expect(second).toBe(first);
  });

  it("backfills a multi-hour gap in a single run", async () => {
    const s = await seedSite();
    await getSql()`INSERT INTO rollup_watermark (id, finalized_through) VALUES (1, ${new Date(
      "2026-05-15T06:00:00Z",
    ).toISOString()}::timestamptz)`;
    for (const h of [7, 8, 9, 10, 11]) {
      const hh = String(h).padStart(2, "0");
      await insertRaw(s, `2026-05-15T${hh}:15:00Z`, `${h}`.repeat(32).slice(0, 32));
    }

    const res = summary(await runRollup(NOW));
    expect(res.hoursProcessed).toBeGreaterThanOrEqual(5);

    const hourly =
      await getSql()`SELECT bucket, pageviews, visitors FROM rollup_hourly ORDER BY bucket`;
    const withData = hourly.filter((r) => Number(r.pageviews) > 0);
    expect(withData).toHaveLength(5);
    for (const row of withData) {
      expect(Number(row.pageviews)).toBe(1);
      expect(Number(row.visitors)).toBe(1);
    }
  });

  it("computes daily visitors as an exact distinct count, not a sum of hours", async () => {
    const s = await seedSite();
    const A = "a".repeat(32);
    const B = "b".repeat(32);
    const C = "c".repeat(32);
    await insertRaw(s, "2026-05-15T07:00:00Z", A);
    await insertRaw(s, "2026-05-15T07:30:00Z", B);
    await insertRaw(s, "2026-05-15T08:00:00Z", A);
    await insertRaw(s, "2026-05-15T08:30:00Z", C);

    summary(await runRollup(NOW));

    const hourly =
      await getSql()`SELECT visitors FROM rollup_hourly WHERE pageviews > 0 ORDER BY bucket`;
    expect(hourly.map((r) => Number(r.visitors))).toEqual([2, 2]);

    const daily =
      await getSql()`SELECT pageviews, visitors FROM rollup_daily`;
    expect(Number(daily[0]!.pageviews)).toBe(4);
    expect(Number(daily[0]!.visitors)).toBe(3); // distinct A,B,C — not 2+2
  });

  it("maps null dimensions to their sentinels", async () => {
    const s = await seedSite();
    await insertRaw(s, "2026-05-15T09:00:00Z", "a".repeat(32), {
      referrerHost: null,
      country: null,
    });
    await insertRaw(s, "2026-05-15T09:10:00Z", "b".repeat(32), {
      referrerHost: "google.com",
      country: "US",
    });

    summary(await runRollup(NOW));

    const refs = (
      await getSql()`SELECT referrer_host FROM rollup_referrer_daily ORDER BY referrer_host`
    ).map((r) => r.referrer_host);
    expect(refs).toContain("");
    expect(refs).toContain("google.com");

    const countries = (
      await getSql()`SELECT country FROM rollup_country_daily ORDER BY country`
    ).map((r) => String(r.country).trim());
    expect(countries).toContain("ZZ");
    expect(countries).toContain("US");
  });

  it("prunes raw past retention without changing rollups", async () => {
    const s = await seedSite();
    await insertRaw(s, "2026-05-15T11:00:00Z", "a".repeat(32));
    summary(await runRollup(NOW));
    const before = await snapshot();

    // an event older than 72h; it was never in any processing window
    await insertRaw(s, "2026-05-11T08:00:00Z", "z".repeat(32));
    const res = summary(await runRollup(NOW));
    expect(res.rawPruned).toBe(1);

    const after = await snapshot();
    expect(after).toBe(before);

    const remaining = await getDb().select().from(eventRaw);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.ts.getTime()).toBe(
      new Date("2026-05-15T11:00:00Z").getTime(),
    );
  });

  it("duplicate (replayed) raw inflates pageviews but not distinct visitors", async () => {
    const s = await seedSite();
    const A = "a".repeat(32);
    await insertRaw(s, "2026-05-15T07:00:00Z", A);
    summary(await runRollup(NOW));
    let daily = await getSql()`SELECT pageviews, visitors FROM rollup_daily`;
    expect(Number(daily[0]!.pageviews)).toBe(1);
    expect(Number(daily[0]!.visitors)).toBe(1);

    // byte-identical replay: same hash, same hour
    await insertRaw(s, "2026-05-15T07:00:00Z", A);
    await getSql()`UPDATE rollup_watermark SET finalized_through = ${new Date(
      "2026-05-15T06:00:00Z",
    ).toISOString()}::timestamptz`;
    summary(await runRollup(NOW));
    daily = await getSql()`SELECT pageviews, visitors FROM rollup_daily`;
    expect(Number(daily[0]!.pageviews)).toBe(2);
    expect(Number(daily[0]!.visitors)).toBe(1);
  });

  it("returns a locked result when a run is already in progress", async () => {
    await seedSite();
    const conn = await getSql().reserve();
    await conn`SELECT pg_advisory_lock(${ROLLUP_LOCK_KEY})`;
    try {
      const res = await runRollup(NOW);
      expect("locked" in res && res.locked).toBe(true);
    } finally {
      await conn`SELECT pg_advisory_unlock(${ROLLUP_LOCK_KEY})`;
      conn.release();
    }
  });
});
