import { beforeEach, describe, expect, it } from "vitest";
import { allowRequest, resetRateLimits } from "@/lib/ingest/rateLimit";

describe("allowRequest token bucket", () => {
  beforeEach(resetRateLimits);

  it("allows a burst of 50 then blocks", () => {
    const t = 1_000_000;
    let allowed = 0;
    for (let i = 0; i < 60; i++) {
      if (allowRequest("pk_aaaaaaaa", t)) allowed++;
    }
    expect(allowed).toBe(50);
    expect(allowRequest("pk_aaaaaaaa", t)).toBe(false);
  });

  it("refills at 10 per second and recovers over time", () => {
    const t = 2_000_000;
    for (let i = 0; i < 50; i++) allowRequest("pk_bbbbbbbb", t);
    expect(allowRequest("pk_bbbbbbbb", t)).toBe(false);

    // one second later, ~10 tokens are back
    let allowed = 0;
    for (let i = 0; i < 15; i++) {
      if (allowRequest("pk_bbbbbbbb", t + 1000)) allowed++;
    }
    expect(allowed).toBe(10);
  });

  it("keeps separate buckets per site", () => {
    const t = 3_000_000;
    for (let i = 0; i < 50; i++) allowRequest("pk_cccccccc", t);
    expect(allowRequest("pk_cccccccc", t)).toBe(false);
    expect(allowRequest("pk_dddddddd", t)).toBe(true);
  });
});
