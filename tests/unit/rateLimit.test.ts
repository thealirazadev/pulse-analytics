import { beforeEach, describe, expect, it } from "vitest";
import {
  allowRequest,
  clientBucketCount,
  resetRateLimits,
} from "@/lib/ingest/rateLimit";

describe("allowRequest token bucket", () => {
  beforeEach(resetRateLimits);

  it("allows a burst of 50 then blocks", () => {
    const t = 1_000_000;
    let allowed = 0;
    for (let i = 0; i < 60; i++) {
      if (allowRequest("pk_aaaaaaaa", null, t)) allowed++;
    }
    expect(allowed).toBe(50);
    expect(allowRequest("pk_aaaaaaaa", null, t)).toBe(false);
  });

  it("refills at 10 per second and recovers over time", () => {
    const t = 2_000_000;
    for (let i = 0; i < 50; i++) allowRequest("pk_bbbbbbbb", null, t);
    expect(allowRequest("pk_bbbbbbbb", null, t)).toBe(false);

    // one second later, ~10 tokens are back
    let allowed = 0;
    for (let i = 0; i < 15; i++) {
      if (allowRequest("pk_bbbbbbbb", null, t + 1000)) allowed++;
    }
    expect(allowed).toBe(10);
  });

  it("keeps separate buckets per site", () => {
    const t = 3_000_000;
    for (let i = 0; i < 50; i++) allowRequest("pk_cccccccc", null, t);
    expect(allowRequest("pk_cccccccc", null, t)).toBe(false);
    expect(allowRequest("pk_dddddddd", null, t)).toBe(true);
  });

  it("caps a single client at a burst of 20", () => {
    const t = 4_000_000;
    let allowed = 0;
    for (let i = 0; i < 30; i++) {
      if (allowRequest("pk_eeeeeeee", "203.0.113.1", t)) allowed++;
    }
    expect(allowed).toBe(20);
    expect(allowRequest("pk_eeeeeeee", "203.0.113.2", t)).toBe(true);
  });

  it("does not let one client drain the site bucket", () => {
    const t = 5_000_000;
    for (let i = 0; i < 500; i++) allowRequest("pk_ffffffff", "203.0.113.9", t);
    let allowed = 0;
    for (let i = 0; i < 30; i++) {
      if (allowRequest("pk_ffffffff", `198.51.100.${i}`, t)) allowed++;
    }
    expect(allowed).toBe(30);
  });

  it("still enforces the site bucket across many clients", () => {
    const t = 6_000_000;
    let allowed = 0;
    for (let i = 0; i < 60; i++) {
      if (allowRequest("pk_gggggggg", `198.51.100.${i}`, t)) allowed++;
    }
    expect(allowed).toBe(50);
  });

  it("refills a client at 2 per second", () => {
    const t = 7_000_000;
    for (let i = 0; i < 20; i++) allowRequest("pk_hhhhhhhh", "203.0.113.3", t);
    expect(allowRequest("pk_hhhhhhhh", "203.0.113.3", t)).toBe(false);
    let allowed = 0;
    for (let i = 0; i < 5; i++) {
      if (allowRequest("pk_hhhhhhhh", "203.0.113.3", t + 1000)) allowed++;
    }
    expect(allowed).toBe(2);
  });

  it("sweeps idle client buckets", () => {
    const t = 8_000_000;
    allowRequest("pk_iiiiiiii", "203.0.113.4", t);
    allowRequest("pk_iiiiiiii", "203.0.113.5", t);
    expect(clientBucketCount()).toBe(2);
    allowRequest("pk_iiiiiiii", "203.0.113.6", t + 61_000);
    expect(clientBucketCount()).toBe(1);
  });
});
