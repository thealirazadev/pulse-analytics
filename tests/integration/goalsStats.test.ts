import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as goalsStats } from "@/app/api/stats/goals/route";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { eventRaw, goal, site } from "@/lib/db/schema";
import { runRollup, type RollupSummary } from "@/lib/rollup/job";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

const SID = "pk_goal0001";
const COOKIE = `${SESSION_COOKIE}=${createSession("admin@example.com")}`;

function summary(r: RollupSummary | { locked: true }): RollupSummary {
  if ("locked" in r) throw new Error("unexpected lock");
  return r;
}

async function seed(): Promise<void> {
  const rows = await getDb()
    .insert(site)
    .values({ publicId: SID, domain: "example.com", name: "Ex" })
    .returning({ id: site.id });
  const siteId = rows[0]!.id;
  await getDb().insert(goal).values([
    { siteId, kind: "path", name: "Thank you", matchValue: "/thank-you" },
    { siteId, kind: "path", name: "Never", matchValue: "/never" },
  ]);

  // Two distinct visitors on the current UTC day. Visitor A completes the goal
  // twice (repeatable), visitor B once, plus one non-goal pageview. So daily
  // visitors = 2, /thank-you completions = 3.
  const pageviews: [string, string][] = [
    ["/thank-you", "a".repeat(32)],
    ["/thank-you", "a".repeat(32)],
    ["/thank-you", "b".repeat(32)],
    ["/", "b".repeat(32)],
  ];
  for (const [path, visitorHash] of pageviews) {
    await getDb()
      .insert(eventRaw)
      .values({ siteId, path, device: "desktop", visitorHash });
  }
}

async function fetchGoals(cookie?: string): Promise<NextRequest> {
  return new NextRequest(
    `http://localhost:3000/api/stats/goals?site=${SID}&range=today`,
    { headers: cookie ? { cookie } : {} },
  );
}

describe("goals stats endpoint", () => {
  beforeAll(ensureMigrated);
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("returns completions and conversion rate over the range", async () => {
    await seed();
    summary(await runRollup(new Date()));

    const res = await goalsStats(await fetchGoals(COOKIE));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.visitors).toBe(2);
    // Ordered by completions desc; the zero-completion goal still appears.
    expect(body.rows).toEqual([
      {
        id: expect.any(Number),
        name: "Thank you",
        kind: "path",
        match: "/thank-you",
        completions: 3,
        conversionRate: 1.5,
      },
      {
        id: expect.any(Number),
        name: "Never",
        kind: "path",
        match: "/never",
        completions: 0,
        conversionRate: 0,
      },
    ]);
  });

  it("requires a session cookie", async () => {
    await seed();
    const res = await goalsStats(await fetchGoals());
    expect(res.status).toBe(401);
  });

  it("404s for an unknown site", async () => {
    const res = await goalsStats(
      new NextRequest(
        "http://localhost:3000/api/stats/goals?site=pk_zzzzzzzz&range=today",
        { headers: { cookie: COOKIE } },
      ),
    );
    expect(res.status).toBe(404);
  });
});
