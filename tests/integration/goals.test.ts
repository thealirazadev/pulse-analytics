import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listGoals, POST as createGoal } from "@/app/api/goals/route";
import { DELETE as deleteGoal } from "@/app/api/goals/[id]/route";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { goal, rollupGoalDaily, site } from "@/lib/db/schema";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

const COOKIE = `${SESSION_COOKIE}=${createSession("admin@example.com")}`;
const SID = "pk_goal0001";

function authed(path: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      cookie: COOKIE,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function anon(path: string, method: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { method });
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedSite(): Promise<number> {
  const rows = await getDb()
    .insert(site)
    .values({ publicId: SID, domain: "example.com", name: "Ex" })
    .returning({ id: site.id });
  return rows[0]!.id;
}

describe("goals CRUD api", () => {
  beforeAll(ensureMigrated);
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("creates path and event goals and lists them for the site", async () => {
    await seedSite();
    const path = await createGoal(
      authed("/api/goals", "POST", {
        site: SID,
        kind: "path",
        name: "Thank you",
        match: "/thank-you",
      }),
    );
    expect(path.status).toBe(201);
    const created = await path.json();
    expect(created).toMatchObject({
      kind: "path",
      name: "Thank you",
      match: "/thank-you",
    });
    expect(typeof created.id).toBe("number");

    const event = await createGoal(
      authed("/api/goals", "POST", {
        site: SID,
        kind: "event",
        name: "Signups",
        match: "signup",
      }),
    );
    expect(event.status).toBe(201);

    const list = await (
      await listGoals(authed(`/api/goals?site=${SID}`, "GET"))
    ).json();
    expect(list.goals).toHaveLength(2);
    expect(list.goals.map((g: { kind: string }) => g.kind).sort()).toEqual([
      "event",
      "path",
    ]);
  });

  it("rejects a duplicate (kind, target) with 409", async () => {
    await seedSite();
    const body = { site: SID, kind: "path", name: "A", match: "/thank-you" };
    expect((await createGoal(authed("/api/goals", "POST", body))).status).toBe(
      201,
    );
    const dup = await createGoal(
      authed("/api/goals", "POST", { ...body, name: "B" }),
    );
    expect(dup.status).toBe(409);
    await expect(dup.json()).resolves.toMatchObject({
      error: { code: "conflict" },
    });
  });

  it("rejects a malformed goal with 400 and an unknown site with 404", async () => {
    await seedSite();
    const badMatch = await createGoal(
      authed("/api/goals", "POST", {
        site: SID,
        kind: "path",
        name: "X",
        match: "no-slash",
      }),
    );
    expect(badMatch.status).toBe(400);

    const unknownSite = await createGoal(
      authed("/api/goals", "POST", {
        site: "pk_zzzzzzzz",
        kind: "event",
        name: "X",
        match: "signup",
      }),
    );
    expect(unknownSite.status).toBe(404);
  });

  it("deletes a goal and cascades its rollups; 404 for an unknown id", async () => {
    const siteId = await seedSite();
    const rows = await getDb()
      .insert(goal)
      .values({ siteId, kind: "path", name: "TY", matchValue: "/thank-you" })
      .returning({ id: goal.id });
    const goalId = rows[0]!.id;
    await getDb().insert(rollupGoalDaily).values({
      goalId,
      siteId,
      day: "2026-05-15",
      completions: 3,
    });

    const res = await deleteGoal(
      authed(`/api/goals/${goalId}`, "DELETE"),
      idParams(String(goalId)),
    );
    expect(res.status).toBe(204);
    expect(await getDb().select().from(goal)).toHaveLength(0);
    expect(
      await getDb()
        .select()
        .from(rollupGoalDaily)
        .where(eq(rollupGoalDaily.goalId, goalId)),
    ).toHaveLength(0);

    const missing = await deleteGoal(
      authed("/api/goals/999999", "DELETE"),
      idParams("999999"),
    );
    expect(missing.status).toBe(404);
  });

  it("requires a session for every route", async () => {
    expect((await listGoals(anon("/api/goals?site=x", "GET"))).status).toBe(401);
    expect((await createGoal(anon("/api/goals", "POST"))).status).toBe(401);
    expect(
      (await deleteGoal(anon("/api/goals/1", "DELETE"), idParams("1"))).status,
    ).toBe(401);
  });
});
