import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listSites, POST as createSite } from "@/app/api/sites/route";
import {
  DELETE as deleteSite,
  GET as getSite,
} from "@/app/api/sites/[id]/route";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { eventRaw, rollupDaily, site } from "@/lib/db/schema";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

const COOKIE = `${SESSION_COOKIE}=${createSession("admin@example.com")}`;

function authed(
  path: string,
  method: string,
  body?: unknown,
): NextRequest {
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

describe("sites CRUD api", () => {
  beforeAll(ensureMigrated);
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("creates a site and lists it", async () => {
    const res = await createSite(
      authed("/api/sites", "POST", { domain: "example.com", name: "Example" }),
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.id).toMatch(/^pk_[a-z0-9]{8}$/);
    expect(created.domain).toBe("example.com");
    expect(created.verifiedAt).toBeNull();

    const list = await (await listSites(authed("/api/sites", "GET"))).json();
    expect(list.sites).toHaveLength(1);
    expect(list.sites[0].id).toBe(created.id);
  });

  it("rejects a duplicate domain with 409", async () => {
    await createSite(
      authed("/api/sites", "POST", { domain: "dupe.com", name: "One" }),
    );
    const res = await createSite(
      authed("/api/sites", "POST", { domain: "dupe.com", name: "Two" }),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "conflict" },
    });
  });

  it("rejects a malformed domain or name with 400", async () => {
    const badDomain = await createSite(
      authed("/api/sites", "POST", { domain: "https://x.com/a", name: "X" }),
    );
    expect(badDomain.status).toBe(400);
    const badName = await createSite(
      authed("/api/sites", "POST", { domain: "ok.com", name: "" }),
    );
    expect(badName.status).toBe(400);
  });

  it("gets one site and 404s for an unknown id", async () => {
    const created = await (
      await createSite(
        authed("/api/sites", "POST", { domain: "one.com", name: "One" }),
      )
    ).json();

    const ok = await getSite(
      authed(`/api/sites/${created.id}`, "GET"),
      idParams(created.id),
    );
    expect(ok.status).toBe(200);

    const missing = await getSite(
      authed("/api/sites/pk_zzzzzzzz", "GET"),
      idParams("pk_zzzzzzzz"),
    );
    expect(missing.status).toBe(404);
  });

  it("deletes a site and cascades its events and rollups", async () => {
    const keep = await getDb()
      .insert(site)
      .values({ publicId: "pk_keep0001", domain: "keep.com", name: "Keep" })
      .returning({ id: site.id });
    const drop = await getDb()
      .insert(site)
      .values({ publicId: "pk_drop0001", domain: "drop.com", name: "Drop" })
      .returning({ id: site.id });
    const keepId = keep[0]!.id;
    const dropId = drop[0]!.id;

    for (const siteId of [keepId, dropId]) {
      await getDb().insert(eventRaw).values({
        siteId,
        path: "/",
        device: "desktop",
        visitorHash: "a".repeat(32),
      });
      await getDb()
        .insert(rollupDaily)
        .values({ siteId, day: "2026-05-15", pageviews: 1, visitors: 1 });
    }

    const res = await deleteSite(
      authed("/api/sites/pk_drop0001", "DELETE"),
      idParams("pk_drop0001"),
    );
    expect(res.status).toBe(204);

    const events = await getDb()
      .select()
      .from(eventRaw)
      .where(eq(eventRaw.siteId, dropId));
    const rollups = await getDb()
      .select()
      .from(rollupDaily)
      .where(eq(rollupDaily.siteId, dropId));
    expect(events).toHaveLength(0);
    expect(rollups).toHaveLength(0);

    const keptEvents = await getDb()
      .select()
      .from(eventRaw)
      .where(eq(eventRaw.siteId, keepId));
    expect(keptEvents).toHaveLength(1);
  });

  it("requires a session for every route", async () => {
    expect((await listSites(anon("/api/sites", "GET"))).status).toBe(401);
    expect(
      (await createSite(anon("/api/sites", "POST"))).status,
    ).toBe(401);
    expect(
      (await getSite(anon("/api/sites/pk_x", "GET"), idParams("pk_x"))).status,
    ).toBe(401);
    expect(
      (await deleteSite(anon("/api/sites/pk_x", "DELETE"), idParams("pk_x")))
        .status,
    ).toBe(401);
  });
});
