import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as summary } from "@/app/api/stats/summary/route";
import { GET as timeseries } from "@/app/api/stats/timeseries/route";
import { GET as breakdown } from "@/app/api/stats/breakdown/route";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  rollupCountryDaily,
  rollupDaily,
  rollupDeviceDaily,
  rollupHourly,
  rollupPageDaily,
  rollupReferrerDaily,
  site,
} from "@/lib/db/schema";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

const COOKIE = `${SESSION_COOKIE}=${createSession("admin@example.com")}`;
const SID = "pk_stats001";

const todayStr = new Date().toISOString().slice(0, 10);
const yesterdayStr = new Date(Date.now() - 86_400_000)
  .toISOString()
  .slice(0, 10);

function req(path: string, withCookie = true): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: withCookie ? { cookie: COOKIE } : {},
  });
}

async function seed(): Promise<void> {
  const db = getDb();
  const rows = await db
    .insert(site)
    .values({ publicId: SID, domain: "example.com", name: "Ex" })
    .returning({ id: site.id });
  const siteId = rows[0]!.id;

  await db.insert(rollupDaily).values([
    { siteId, day: todayStr, pageviews: 100, visitors: 40 },
    { siteId, day: yesterdayStr, pageviews: 50, visitors: 20 },
  ]);
  await db.insert(rollupHourly).values({
    siteId,
    bucket: new Date(`${todayStr}T00:00:00Z`),
    pageviews: 10,
    visitors: 5,
  });
  await db.insert(rollupPageDaily).values([
    { siteId, day: todayStr, path: "/pricing", pageviews: 60, visitors: 30 },
    { siteId, day: todayStr, path: "/", pageviews: 40, visitors: 25 },
  ]);
  await db.insert(rollupReferrerDaily).values([
    { siteId, day: todayStr, referrerHost: "", pageviews: 70, visitors: 35 },
    {
      siteId,
      day: todayStr,
      referrerHost: "google.com",
      pageviews: 30,
      visitors: 15,
    },
  ]);
  await db.insert(rollupCountryDaily).values([
    { siteId, day: todayStr, country: "ZZ", pageviews: 60, visitors: 30 },
    { siteId, day: todayStr, country: "US", pageviews: 40, visitors: 20 },
  ]);
  await db.insert(rollupDeviceDaily).values([
    { siteId, day: todayStr, device: "desktop", pageviews: 80, visitors: 40 },
    { siteId, day: todayStr, device: "mobile", pageviews: 20, visitors: 10 },
  ]);
}

describe("stats api", () => {
  beforeAll(ensureMigrated);
  beforeEach(async () => {
    await truncateAll();
    await seed();
  });
  afterAll(closeDb);

  it("summarizes today from the daily rollup", async () => {
    const res = await summary(req(`/api/stats/summary?site=${SID}&range=today`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ pageviews: 100, visitors: 40 });
    expect(body.range.interval).toBe("hour");
  });

  it("sums daily uniques across a multi-day range", async () => {
    const res = await summary(req(`/api/stats/summary?site=${SID}&range=7d`));
    const body = await res.json();
    expect(body.pageviews).toBe(150);
    expect(body.visitors).toBe(60);
  });

  it("returns zero-filled hourly points for today", async () => {
    const res = await timeseries(
      req(`/api/stats/timeseries?site=${SID}&range=today`),
    );
    const body = await res.json();
    expect(body.interval).toBe("hour");
    const first = body.points[0];
    expect(first.bucket).toBe(`${todayStr}T00:00:00.000Z`);
    expect(first.pageviews).toBe(10);
    // every bucket present, most zero
    expect(body.points.every((p: { bucket: string }) => p.bucket)).toBe(true);
  });

  it("returns 7 daily points for a week range", async () => {
    const res = await timeseries(
      req(`/api/stats/timeseries?site=${SID}&range=7d`),
    );
    const body = await res.json();
    expect(body.points).toHaveLength(7);
    const today = body.points.find(
      (p: { bucket: string }) => p.bucket === todayStr,
    );
    expect(today.pageviews).toBe(100);
  });

  it("breaks down pages ordered by pageviews", async () => {
    const res = await breakdown(
      req(`/api/stats/breakdown?site=${SID}&range=today&dimension=page`),
    );
    const body = await res.json();
    expect(body.rows).toEqual([
      { key: "/pricing", pageviews: 60, visitors: 30 },
      { key: "/", pageviews: 40, visitors: 25 },
    ]);
  });

  it("maps referrer and country sentinels", async () => {
    const ref = await (
      await breakdown(
        req(`/api/stats/breakdown?site=${SID}&range=today&dimension=referrer`),
      )
    ).json();
    expect(ref.rows[0].key).toBe("(direct)");

    const country = await (
      await breakdown(
        req(`/api/stats/breakdown?site=${SID}&range=today&dimension=country`),
      )
    ).json();
    expect(country.rows[0].key).toBe("Unknown");
    expect(country.rows[1].key).toBe("US");
  });

  it("honors the limit parameter", async () => {
    const res = await breakdown(
      req(
        `/api/stats/breakdown?site=${SID}&range=today&dimension=device&limit=1`,
      ),
    );
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].key).toBe("desktop");
  });

  it("returns zeros for a site that has no rollups yet", async () => {
    await getDb()
      .insert(site)
      .values({ publicId: "pk_empty001", domain: "empty.com", name: "Empty" });

    const sum = await (
      await summary(req(`/api/stats/summary?site=pk_empty001&range=today`))
    ).json();
    expect(sum).toMatchObject({ pageviews: 0, visitors: 0 });

    const ts = await (
      await timeseries(req(`/api/stats/timeseries?site=pk_empty001&range=today`))
    ).json();
    expect(ts.points.length).toBeGreaterThan(0);
    expect(
      ts.points.every(
        (p: { pageviews: number; visitors: number }) =>
          p.pageviews === 0 && p.visitors === 0,
      ),
    ).toBe(true);
  });

  it("zero-fills days with no rollup inside a multi-day range", async () => {
    const res = await timeseries(
      req(`/api/stats/timeseries?site=${SID}&range=7d`),
    );
    const body = await res.json();
    expect(body.points).toHaveLength(7);
    // Only today and yesterday were seeded; the six-days-ago boundary is a gap.
    const oldest = body.points[0];
    expect(oldest).toMatchObject({ pageviews: 0, visitors: 0 });
    expect(oldest.bucket).not.toBe(todayStr);
    expect(oldest.bucket).not.toBe(yesterdayStr);
  });

  it("rejects an out-of-range limit with 400", async () => {
    for (const limit of ["0", "51", "-1", "abc"]) {
      const res = await breakdown(
        req(
          `/api/stats/breakdown?site=${SID}&range=today&dimension=page&limit=${limit}`,
        ),
      );
      expect(res.status).toBe(400);
    }
  });

  it("validates params and auth", async () => {
    expect(
      (await summary(req(`/api/stats/summary?site=${SID}&range=bad`))).status,
    ).toBe(400);
    expect(
      (
        await breakdown(
          req(`/api/stats/breakdown?site=${SID}&range=today&dimension=bad`),
        )
      ).status,
    ).toBe(400);
    expect(
      (await summary(req(`/api/stats/summary?site=pk_unknown9&range=today`)))
        .status,
    ).toBe(404);
    expect(
      (await summary(req(`/api/stats/summary?site=${SID}&range=today`, false)))
        .status,
    ).toBe(401);
  });
});
