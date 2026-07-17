import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { POST } from "@/app/api/collect/route";
import { getDb } from "@/lib/db/client";
import { eventRaw, site } from "@/lib/db/schema";
import { resetRateLimits } from "@/lib/ingest/rateLimit";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

const DOMAIN = "example.com";
const SID = "pk_test0001";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const CLIENT_IP = "203.0.113.77";

async function seedSite(): Promise<number> {
  const rows = await getDb()
    .insert(site)
    .values({ publicId: SID, domain: DOMAIN, name: "Example" })
    .returning({ id: site.id });
  return rows[0]!.id;
}

function collectRequest(
  bodyObj: unknown,
  headers: Record<string, string> = {},
  rawBody?: string,
): NextRequest {
  return new NextRequest("http://localhost:3000/api/collect", {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      origin: `https://${DOMAIN}`,
      "user-agent": DESKTOP_UA,
      "x-forwarded-for": CLIENT_IP,
      ...headers,
    },
    body: rawBody ?? JSON.stringify(bodyObj),
  });
}

async function eventCount(): Promise<number> {
  const rows = await getDb().select().from(eventRaw);
  return rows.length;
}

describe("POST /api/collect", () => {
  beforeAll(ensureMigrated);
  beforeEach(async () => {
    await truncateAll();
    resetRateLimits();
  });
  afterAll(closeDb);

  it("accepts a valid beacon and stores exactly one row", async () => {
    const siteId = await seedSite();
    const res = await POST(collectRequest({ sid: SID, p: "/pricing?x=1#h" }));
    expect(res.status).toBe(202);
    expect(res.headers.get("set-cookie")).toBeNull();

    const rows = await getDb()
      .select()
      .from(eventRaw)
      .where(eq(eventRaw.siteId, siteId));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.path).toBe("/pricing");
    expect(row.device).toBe("desktop");
    expect(row.country).toBeNull();
    expect(row.visitorHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("gives the same visitor hash for identical inputs on the same day", async () => {
    await seedSite();
    await POST(collectRequest({ sid: SID, p: "/" }));
    await POST(collectRequest({ sid: SID, p: "/" }));
    const rows = await getDb().select().from(eventRaw);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.visitorHash).toBe(rows[1]!.visitorHash);
  });

  it("rejects a mismatched origin with 403 and stores nothing", async () => {
    await seedSite();
    const res = await POST(
      collectRequest({ sid: SID, p: "/" }, { origin: "https://evil.com" }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "origin_mismatch" },
    });
    expect(await eventCount()).toBe(0);
  });

  it("rejects an unknown site with 403", async () => {
    const res = await POST(collectRequest({ sid: "pk_missing0", p: "/" }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "unknown_site" },
    });
  });

  it("rejects malformed json and missing fields with 400", async () => {
    await seedSite();
    const bad = await POST(collectRequest(undefined, {}, "{not json"));
    expect(bad.status).toBe(400);
    const missing = await POST(collectRequest({ p: "/" }));
    expect(missing.status).toBe(400);
    expect(await eventCount()).toBe(0);
  });

  it("rejects an oversized body with 413", async () => {
    await seedSite();
    const big = "/" + "a".repeat(2000);
    const res = await POST(collectRequest({ sid: SID, p: big }));
    expect(res.status).toBe(413);
    expect(await eventCount()).toBe(0);
  });

  it("drops DNT and GPC requests with 202 and stores nothing", async () => {
    await seedSite();
    const dnt = await POST(collectRequest({ sid: SID, p: "/" }, { dnt: "1" }));
    expect(dnt.status).toBe(202);
    const gpc = await POST(
      collectRequest({ sid: SID, p: "/" }, { "sec-gpc": "1" }),
    );
    expect(gpc.status).toBe(202);
    expect(await eventCount()).toBe(0);
  });

  it("drops bot user agents with 202 and stores nothing", async () => {
    await seedSite();
    const res = await POST(
      collectRequest({ sid: SID, p: "/" }, { "user-agent": "Googlebot/2.1" }),
    );
    expect(res.status).toBe(202);
    expect(await eventCount()).toBe(0);
  });

  it("rate limits sustained traffic with 429", async () => {
    await seedSite();
    let sawLimit = false;
    for (let i = 0; i < 60; i++) {
      const res = await POST(collectRequest({ sid: SID, p: "/" }));
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });

  it("never writes the ip or raw user agent to logs", async () => {
    await seedSite();
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((l) => {
      lines.push(String(l));
    });
    const err = vi.spyOn(console, "error").mockImplementation((l) => {
      lines.push(String(l));
    });

    await POST(collectRequest({ sid: SID, p: "/secret" }));

    log.mockRestore();
    err.mockRestore();
    const joined = lines.join("\n");
    expect(joined).not.toContain(CLIENT_IP);
    expect(joined).not.toContain(DESKTOP_UA);
    expect(joined).not.toContain("Mozilla");
  });
});
