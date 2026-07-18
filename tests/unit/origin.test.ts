import { describe, expect, it } from "vitest";
import { originMatchesDomain } from "@/lib/ingest/origin";

describe("originMatchesDomain", () => {
  it("matches on the Origin host", () => {
    expect(
      originMatchesDomain("https://example.com", null, "example.com"),
    ).toBe(true);
  });

  it("ignores port and is case-insensitive", () => {
    expect(
      originMatchesDomain("https://EXAMPLE.com:8443", null, "example.com"),
    ).toBe(true);
  });

  it("falls back to the Referer host", () => {
    expect(
      originMatchesDomain(null, "https://example.com/a/b", "example.com"),
    ).toBe(true);
  });

  it("rejects a mismatched host and missing headers", () => {
    expect(
      originMatchesDomain("https://evil.com", null, "example.com"),
    ).toBe(false);
    expect(originMatchesDomain(null, null, "example.com")).toBe(false);
    expect(originMatchesDomain("garbage", "garbage", "example.com")).toBe(false);
  });
});
