import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { customEventRaw, eventRaw, goal, site } from "@/lib/db/schema";
import { runRollup, type RollupSummary } from "@/lib/rollup/job";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

const NOW = new Date("2026-05-15T12:30:00Z");
const SID = "pk_goal0001";

async function seedSite(): Promise<number> {
  const rows = await getDb()
    .insert(site)
    .values({ publicId: SID, domain: "example.com", name: "Ex" })
    .returning({ id: site.id });
  return rows[0]!.id;
}

async function addGoal(
  siteId: number,
  kind: "path" | "event",
  name: string,
  matchValue: string,
): Promise<number> {
  const rows = await getDb()
    .insert(goal)
    .values({ siteId, kind, name, matchValue })
    .returning({ id: goal.id });
  return rows[0]!.id;
}

async function addPageview(
  siteId: number,
  iso: string,
  path: string,
): Promise<void> {
  await getDb().insert(eventRaw).values({
    siteId,
    ts: new Date(iso),
    path,
    device: "desktop",
    visitorHash: "a".repeat(32),
  });
}

async function addEvent(
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

/** Map goal name -> completions summed across rollup_goal_daily. */
async function completions(): Promise<Record<string, number>> {
  const rows = await getSql()`
    SELECT g.name AS name, coalesce(sum(r.completions), 0)::int AS completions
    FROM goal g
    LEFT JOIN rollup_goal_daily r ON r.goal_id = g.id
    GROUP BY g.name
  `;
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.name)] = Number(r.completions);
  return out;
}

describe("goal rollup", () => {
  beforeAll(ensureMigrated);
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("counts a path goal by event_raw.path and an event goal by custom_event_raw.name", async () => {
    const s = await seedSite();
    await addGoal(s, "path", "Thank you", "/thank-you");
    await addGoal(s, "event", "Signups", "signup");
    await addGoal(s, "path", "Never", "/never");

    // Matching pageviews plus non-matching noise.
    await addPageview(s, "2026-05-15T07:10:00Z", "/thank-you");
    await addPageview(s, "2026-05-15T08:20:00Z", "/thank-you");
    await addPageview(s, "2026-05-15T09:30:00Z", "/thank-you");
    await addPageview(s, "2026-05-15T09:31:00Z", "/");
    await addPageview(s, "2026-05-15T09:32:00Z", "/pricing");

    // Matching events plus a non-matching one.
    await addEvent(s, "2026-05-15T07:15:00Z", "signup");
    await addEvent(s, "2026-05-15T08:25:00Z", "signup");
    await addEvent(s, "2026-05-15T09:35:00Z", "purchase");

    summary(await runRollup(NOW));

    // "Never" has no matching pageviews -> no rollup row -> 0 via the left join.
    expect(await completions()).toEqual({
      "Thank you": 3,
      Signups: 2,
      Never: 0,
    });
  });

  it("bounds completions to each event's own UTC day and to the goal's site", async () => {
    const s = await seedSite();
    const other = await getDb()
      .insert(site)
      .values({ publicId: "pk_other001", domain: "other.com", name: "Other" })
      .returning({ id: site.id });
    const otherId = other[0]!.id;
    const gid = await addGoal(s, "path", "Thank you", "/thank-you");

    await addPageview(s, "2026-05-15T10:00:00Z", "/thank-you"); // UTC day 15
    await addPageview(s, "2026-05-14T23:59:00Z", "/thank-you"); // UTC day 14
    await addPageview(otherId, "2026-05-15T10:00:00Z", "/thank-you"); // other site, no goal

    summary(await runRollup(NOW));

    // One completion in each day's own bucket (the 05-14 event does not bleed
    // into 05-15's count), and nothing attributed across sites.
    const rows = await getSql()`
      SELECT day::text AS day, completions
      FROM rollup_goal_daily WHERE goal_id = ${gid} ORDER BY day
    `;
    expect(
      rows.map((r) => ({ day: r.day, completions: Number(r.completions) })),
    ).toEqual([
      { day: "2026-05-14", completions: 1 },
      { day: "2026-05-15", completions: 1 },
    ]);
    const all = await getSql()`SELECT count(*)::int AS n FROM rollup_goal_daily`;
    expect(Number(all[0]!.n)).toBe(2);
  });

  it("is idempotent: running twice yields identical completions", async () => {
    const s = await seedSite();
    await addGoal(s, "path", "Thank you", "/thank-you");
    await addPageview(s, "2026-05-15T07:10:00Z", "/thank-you");
    await addPageview(s, "2026-05-15T08:20:00Z", "/thank-you");

    summary(await runRollup(NOW));
    const first = await completions();

    await getSql()`UPDATE rollup_watermark SET finalized_through = ${new Date(
      "2026-05-15T06:00:00Z",
    ).toISOString()}::timestamptz`;
    summary(await runRollup(NOW));
    const second = await completions();

    expect(second).toEqual(first);
    expect(second).toEqual({ "Thank you": 2 });
  });

  it("counts completions for a goal registered after the events (still in window)", async () => {
    const s = await seedSite();
    await addPageview(s, "2026-05-15T07:10:00Z", "/thank-you");
    await addPageview(s, "2026-05-15T08:20:00Z", "/thank-you");
    // Goal defined only after the pageviews were collected.
    await addGoal(s, "path", "Thank you", "/thank-you");

    summary(await runRollup(NOW));
    expect(await completions()).toEqual({ "Thank you": 2 });
  });
});
