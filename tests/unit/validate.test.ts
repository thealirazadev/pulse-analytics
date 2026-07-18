import { describe, expect, it } from "vitest";
import { normalizePath, validateBeacon } from "@/lib/ingest/validate";

function body(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("normalizePath", () => {
  it("strips query strings and fragments", () => {
    expect(normalizePath("/pricing?utm=x&y=2")).toBe("/pricing");
    expect(normalizePath("/docs#section")).toBe("/docs");
    expect(normalizePath("/a?b=1#c")).toBe("/a");
  });

  it("keeps a bare root path", () => {
    expect(normalizePath("/")).toBe("/");
  });

  it("rejects paths that do not start with a slash", () => {
    expect(normalizePath("pricing")).toBeNull();
    expect(normalizePath("https://x.com/a")).toBeNull();
  });

  it("rejects non-strings and over-length paths", () => {
    expect(normalizePath(123)).toBeNull();
    expect(normalizePath(null)).toBeNull();
    expect(normalizePath("/" + "a".repeat(512))).toBeNull();
  });

  it("accepts a 512-char path", () => {
    const p = "/" + "a".repeat(511);
    expect(p.length).toBe(512);
    expect(normalizePath(p)).toBe(p);
  });
});

describe("validateBeacon", () => {
  it("accepts a valid beacon and normalizes the path", () => {
    const r = validateBeacon(body({ sid: "pk_x8f2ab31", p: "/pricing?x=1" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sid).toBe("pk_x8f2ab31");
      expect(r.value.path).toBe("/pricing");
      expect(r.value.referrer).toBeNull();
    }
  });

  it("keeps a referrer string when present", () => {
    const r = validateBeacon(
      body({ sid: "pk_x8f2ab31", p: "/", r: "https://news.ycombinator.com/x" }),
    );
    expect(r.ok && r.value.referrer).toBe("https://news.ycombinator.com/x");
  });

  it("rejects malformed json", () => {
    expect(validateBeacon("{not json").ok).toBe(false);
  });

  it("rejects a missing or malformed sid", () => {
    expect(validateBeacon(body({ p: "/" })).ok).toBe(false);
    expect(validateBeacon(body({ sid: "nope", p: "/" })).ok).toBe(false);
    expect(validateBeacon(body({ sid: "pk_UPPER123", p: "/" })).ok).toBe(false);
  });

  it("rejects a missing or non-slash path", () => {
    expect(validateBeacon(body({ sid: "pk_x8f2ab31" })).ok).toBe(false);
    expect(validateBeacon(body({ sid: "pk_x8f2ab31", p: "x" })).ok).toBe(false);
  });

  it("rejects a non-string referrer", () => {
    expect(validateBeacon(body({ sid: "pk_x8f2ab31", p: "/", r: 5 })).ok).toBe(
      false,
    );
  });

  it("rejects arrays and non-objects", () => {
    expect(validateBeacon(body([1, 2, 3])).ok).toBe(false);
    expect(validateBeacon(body("string")).ok).toBe(false);
  });
});
