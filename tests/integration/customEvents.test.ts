import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as collect } from "@/app/api/collect/route";
import { GET as events } from "@/app/api/stats/events/route";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { getDb, getSql } from "@/lib/db/client";
import { customEventRaw, site } from "@/lib/db/schema";
import { resetRateLimits } from "@/lib/ingest/rateLimit";
import { runRollup, type RollupSummary } from "@/lib/rollup/job";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

const NOW = new Date("2026-05-15T12:30:00Z");
const SID = "pk_test0001";
const DOMAIN = "example.com";
const COOKIE = `${SESSION_COOKIE}=${createSession("admin@example.com")}`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

async function seedSite(): Promise<number> {
  const rows = await getDb()
    .insert(site)
    .values({ publicId: SID, domain: DOMAIN, name: "Ex" })
    .returning({ id: site.id });
  return rows[0]!.id;
}

async function insertEvent(
  siteId: number,
  iso: string,
  name: string,
): Promise<void> {
  await getDb()
    .insert(customEventRaw)
    .values({ siteId, ts: new Date(iso), name });
}

function summary(r: RollupSummary | { locked: true }): RollupSummary {
  if ("locked" in r) throw new Error("unexpected lock");
  return r;
}

async function counts(): Promise<Record<string, number>> {
  const rows =
    await getSql()`SELECT name, "count" FROM rollup_custom_event_daily ORDER BY name`;
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.name)] = Number(r.count);
  return out;
}

function eventBeacon(
  bodyObj: unknown,
  headers: Record<string, string> = {},
  rawBody?: string,
): NextRequest {
  return new NextRequest("http://localhost:3000/api/collect", {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      origin: `https://${DOMAIN}`,
      "user-agent": UA,
      "x-forwarded-for": "203.0.113.7",
      ...headers,
    },
    body: rawBody ?? JSON.stringify(bodyObj),
  });
}

async function rawRowCount(): Promise<number> {
  const rows = await getDb().select().from(customEventRaw);
  return rows.length;
}

// One pool per file: migrate once up front, close once at the end. Per-describe
// close would end the shared pool and break the describes that follow.
beforeAll(ensureMigrated);
afterAll(closeDb);

describe("custom event ingest", () => {
  beforeEach(async () => {
    await truncateAll();
    resetRateLimits();
  });

  it("stores exactly one custom_event_raw row for a valid event", async () => {
    const siteId = await seedSite();
    const res = await collect(eventBeacon({ sid: SID, n: "signup" }));
    expect(res.status).toBe(202);
    expect(res.headers.get("set-cookie")).toBeNull();

    const rows = await getDb().select().from(customEventRaw);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.siteId).toBe(siteId);
    expect(rows[0]!.name).toBe("signup");
    // Counts-only: the raw table carries no visitor hash, IP, or UA columns.
    expect(Object.keys(rows[0]!)).toEqual(["id", "siteId", "ts", "name"]);
  });

  it("verifies the site on the first accepted event", async () => {
    await seedSite();
    await collect(eventBeacon({ sid: SID, n: "signup" }));
    const rows = await getDb().select().from(site);
    expect(rows[0]!.verifiedAt).not.toBeNull();
  });

  it("rejects a bad event name with 400 and stores nothing", async () => {
    await seedSite();
    for (const n of ["bad name", "x".repeat(65), "with!bang"]) {
      const res = await collect(eventBeacon({ sid: SID, n }));
      expect(res.status).toBe(400);
    }
    expect(await rawRowCount()).toBe(0);
  });

  it("drops DNT and GPC events with 202 and stores nothing", async () => {
    await seedSite();
    expect(
      (await collect(eventBeacon({ sid: SID, n: "signup" }, { dnt: "1" })))
        .status,
    ).toBe(202);
    expect(
      (
        await collect(
          eventBeacon({ sid: SID, n: "signup" }, { "sec-gpc": "1" }),
        )
      ).status,
    ).toBe(202);
    expect(await rawRowCount()).toBe(0);
  });

  it("drops bot events with 202 and stores nothing", async () => {
    await seedSite();
    const res = await collect(
      eventBeacon({ sid: SID, n: "signup" }, { "user-agent": "Googlebot/2.1" }),
    );
    expect(res.status).toBe(202);
    expect(await rawRowCount()).toBe(0);
  });

  it("rejects a mismatched origin with 403 and stores nothing", async () => {
    await seedSite();
    const res = await collect(
      eventBeacon({ sid: SID, n: "signup" }, { origin: "https://evil.com" }),
    );
    expect(res.status).toBe(403);
    expect(await rawRowCount()).toBe(0);
  });

  it("rate limits sustained events with 429", async () => {
    await seedSite();
    let sawLimit = false;
    for (let i = 0; i < 60; i++) {
      const res = await collect(eventBeacon({ sid: SID, n: "signup" }));
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });
});

describe("custom event rollup", () => {
  beforeEach(truncateAll);

  it("aggregates per-name counts for the day", async () => {
    const s = await seedSite();
    await insertEvent(s, "2026-05-15T07:10:00Z", "signup");
    await insertEvent(s, "2026-05-15T08:20:00Z", "signup");
    await insertEvent(s, "2026-05-15T09:30:00Z", "purchase");
    summary(await runRollup(NOW));
    expect(await counts()).toEqual({ signup: 2, purchase: 1 });
  });

  it("is idempotent: running twice yields identical counts", async () => {
    const s = await seedSite();
    await insertEvent(s, "2026-05-15T07:10:00Z", "signup");
    await insertEvent(s, "2026-05-15T08:20:00Z", "signup");
    summary(await runRollup(NOW));
    const first = await counts();

    await getSql()`UPDATE rollup_watermark SET finalized_through = ${new Date(
      "2026-05-15T06:00:00Z",
    ).toISOString()}::timestamptz`;
    summary(await runRollup(NOW));
    const second = await counts();

    expect(second).toEqual(first);
    expect(second).toEqual({ signup: 2 });
  });

  it("prunes old custom raw without changing rollups", async () => {
    const s = await seedSite();
    await insertEvent(s, "2026-05-15T11:00:00Z", "signup");
    summary(await runRollup(NOW));
    const before = await counts();

    // Older than the 72h retention window; never in any processing window.
    await insertEvent(s, "2026-05-11T08:00:00Z", "old");
    const res = summary(await runRollup(NOW));
    expect(res.rawPruned).toBe(1);
    expect(await counts()).toEqual(before);
    expect(await rawRowCount()).toBe(1);
  });
});

describe("custom event pipeline: ingest -> rollup -> stats", () => {
  beforeEach(async () => {
    await truncateAll();
    resetRateLimits();
    await seedSite();
  });

  it("serves top custom events the dashboard reads", async () => {
    await collect(eventBeacon({ sid: SID, n: "signup" }));
    await collect(eventBeacon({ sid: SID, n: "signup" }));
    await collect(eventBeacon({ sid: SID, n: "purchase" }));

    summary(await runRollup(new Date()));

    const res = await events(
      new NextRequest(
        `http://localhost:3000/api/stats/events?site=${SID}&range=today`,
        { headers: { cookie: COOKIE } },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toEqual([
      { name: "signup", count: 2 },
      { name: "purchase", count: 1 },
    ]);
  });

  it("requires a session cookie", async () => {
    const res = await events(
      new NextRequest(
        `http://localhost:3000/api/stats/events?site=${SID}&range=today`,
      ),
    );
    expect(res.status).toBe(401);
  });
});
