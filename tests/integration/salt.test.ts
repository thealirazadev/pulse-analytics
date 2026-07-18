import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { dailySalt } from "@/lib/db/schema";
import { destroyExpiredSalts, getTodaySalt } from "@/lib/privacy/salt";
import { closeDb, ensureMigrated, truncateAll } from "../helpers/db";

describe("daily salt lifecycle", () => {
  beforeAll(ensureMigrated);
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("creates one row and is race-safe under concurrent calls", async () => {
    const day = "2026-03-01";
    const [a, b] = await Promise.all([getTodaySalt(day), getTodaySalt(day)]);
    expect(a).toBe(b);

    const rows = await getDb()
      .select()
      .from(dailySalt)
      .where(eq(dailySalt.day, day));
    expect(rows).toHaveLength(1);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the same salt on repeat calls for a day", async () => {
    const first = await getTodaySalt("2026-03-02");
    const second = await getTodaySalt("2026-03-02");
    expect(second).toBe(first);
  });

  it("destroys every salt before today, leaving only today", async () => {
    await getTodaySalt("2026-03-01");
    await getTodaySalt("2026-03-02");
    await getTodaySalt("2026-03-03");

    const destroyed = await destroyExpiredSalts("2026-03-03");
    expect(destroyed).toBe(2);

    const remaining = await getDb().select().from(dailySalt);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.day).toBe("2026-03-03");
  });
});
