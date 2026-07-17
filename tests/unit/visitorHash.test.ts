import { describe, expect, it } from "vitest";
import { computeVisitorHash } from "@/lib/privacy/visitorHash";

const IP = "203.0.113.5";
const UA = "Mozilla/5.0 (X11; Linux x86_64)";

describe("computeVisitorHash", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeVisitorHash("salt-one", 7, IP, UA);
    const b = computeVisitorHash("salt-one", 7, IP, UA);
    expect(a).toBe(b);
  });

  it("differs across salts (cross-day unlinkability)", () => {
    const today = computeVisitorHash("salt-day-1", 7, IP, UA);
    const tomorrow = computeVisitorHash("salt-day-2", 7, IP, UA);
    expect(today).not.toBe(tomorrow);
  });

  it("differs across sites, ips, and user agents", () => {
    const base = computeVisitorHash("s", 7, IP, UA);
    expect(computeVisitorHash("s", 8, IP, UA)).not.toBe(base);
    expect(computeVisitorHash("s", 7, "198.51.100.9", UA)).not.toBe(base);
    expect(computeVisitorHash("s", 7, IP, "curl/8.0")).not.toBe(base);
  });

  it("returns 32 lowercase hex chars (128 bits)", () => {
    expect(computeVisitorHash("s", 7, IP, UA)).toMatch(/^[0-9a-f]{32}$/);
  });
});
