import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as collect } from "@/app/api/collect/route";
import { GET as breakdown } from "@/app/api/stats/breakdown/route";
import { GET as summary } from "@/app/api/stats/summary/route";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { site } from "@/lib/db/schema";
import { resetRateLimits } from "@/lib/ingest/rateLimit";
import { runRollup } from "@/lib/rollup/job";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

const SID = "pk_pipe0001";
const DOMAIN = "example.com";
const COOKIE = `${SESSION_COOKIE}=${createSession("admin@example.com")}`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

async function beacon(path: string, ip: string): Promise<void> {
  const res = await collect(
    new NextRequest("http://localhost:3000/api/collect", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: `https://${DOMAIN}`,
        "user-agent": UA,
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ sid: SID, p: path }),
    }),
  );
  expect(res.status).toBe(202);
}

function statsReq(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie: COOKIE },
  });
}

describe("full pipeline: ingest -> rollup -> stats", () => {
  beforeAll(ensureMigrated);
  beforeEach(async () => {
    await truncateAll();
    resetRateLimits();
    await getDb()
      .insert(site)
      .values({ publicId: SID, domain: DOMAIN, name: "Ex" });
  });
  afterAll(closeDb);

  it("aggregates ingested beacons into the stats the dashboard reads", async () => {
    // visitor A (ip .10) hits "/" three times; visitor B (ip .20) hits "/pricing" twice
    await beacon("/", "203.0.113.10");
    await beacon("/", "203.0.113.10");
    await beacon("/", "203.0.113.10");
    await beacon("/pricing", "203.0.113.20");
    await beacon("/pricing", "203.0.113.20");

    const result = await runRollup(new Date());
    expect("locked" in result).toBe(false);

    const total = await (
      await summary(statsReq(`/api/stats/summary?site=${SID}&range=today`))
    ).json();
    expect(total.pageviews).toBe(5);
    expect(total.visitors).toBe(2);

    const pages = await (
      await breakdown(
        statsReq(`/api/stats/breakdown?site=${SID}&range=today&dimension=page`),
      )
    ).json();
    expect(pages.rows).toEqual([
      { key: "/", pageviews: 3, visitors: 1 },
      { key: "/pricing", pageviews: 2, visitors: 1 },
    ]);
  });
});
