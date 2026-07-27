import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hard architectural boundary: the stats/dashboard read path must never touch
 * raw events. This guards it statically against a regression.
 */
describe("read-path isolation", () => {
  it("lib/stats/queries.ts never references event_raw", () => {
    const source = readFileSync(resolve("lib/stats/queries.ts"), "utf8");
    expect(source).not.toMatch(/event_raw|eventRaw/);
  });

  it("lib/stats/queries.ts never references the custom event raw table", () => {
    const source = readFileSync(resolve("lib/stats/queries.ts"), "utf8");
    expect(source).not.toMatch(/custom_event_raw|customEventRaw/);
  });

  it("the goals read path (getGoals) reads rollups only, no raw table", () => {
    const source = readFileSync(resolve("lib/stats/queries.ts"), "utf8");
    expect(source).toMatch(/getGoals/);
    expect(source).not.toMatch(
      /event_raw|eventRaw|custom_event_raw|customEventRaw/,
    );
  });
});
