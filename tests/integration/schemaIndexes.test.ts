import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "@/lib/db/client";
import { closeDb, ensureMigrated } from "../helpers/db";

/**
 * The rollup recomputes and the retention prune both filter event_raw on `ts`
 * alone (every site at once), so a ts-leading index is required. The
 * site-leading index cannot serve those predicates, and without a ts index
 * every hourly bucket sequentially scans the entire raw table.
 */
describe("event_raw indexes", () => {
  beforeAll(ensureMigrated);
  afterAll(closeDb);

  it("has an index whose leading column is ts", async () => {
    const rows = await getSql()<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'event_raw'
    `;
    const defs = rows.map((r) => r.indexdef);
    // Leading column must be ts, e.g. "... USING btree (ts)".
    const tsLeading = defs.filter((d) => /USING btree \(ts\b/.test(d));
    expect(tsLeading.length).toBeGreaterThan(0);
  });
});
