import { describe, expect, it } from "vitest";
import { reduceReferrer } from "@/lib/ingest/referrer";

describe("reduceReferrer", () => {
  it("reduces a full url to its hostname", () => {
    expect(reduceReferrer("https://news.ycombinator.com/item?id=4", "x.com")).toBe(
      "news.ycombinator.com",
    );
  });

  it("drops referrers from the site's own domain", () => {
    expect(reduceReferrer("https://example.com/about", "example.com")).toBeNull();
    expect(reduceReferrer("https://EXAMPLE.com/a", "example.com")).toBeNull();
  });

  it("returns null for direct traffic and garbage", () => {
    expect(reduceReferrer(null, "example.com")).toBeNull();
    expect(reduceReferrer("", "example.com")).toBeNull();
    expect(reduceReferrer("not a url", "example.com")).toBeNull();
  });
});
