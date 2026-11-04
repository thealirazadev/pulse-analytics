import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/clientIp";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("getClientIp", () => {
  it("ignores forwarded headers when no proxy is trusted", () => {
    const h = headers({
      "x-forwarded-for": "203.0.113.5",
      "x-real-ip": "203.0.113.6",
    });
    expect(getClientIp(h, 0)).toBeNull();
  });

  it("takes the right-most entry behind one proxy", () => {
    const h = headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.5" });
    expect(getClientIp(h, 1)).toBe("203.0.113.5");
  });

  it("cannot be spoofed by a client-supplied prefix", () => {
    const h = headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.5" });
    expect(getClientIp(h, 1)).toBe("203.0.113.5");
  });

  it("skips the trusted hops when there are several proxies", () => {
    const h = headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.5, 10.0.0.2" });
    expect(getClientIp(h, 2)).toBe("203.0.113.5");
  });

  it("uses the left-most entry when the chain is shorter than the hop count", () => {
    const h = headers({ "x-forwarded-for": "203.0.113.5" });
    expect(getClientIp(h, 3)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when there is no x-forwarded-for", () => {
    expect(getClientIp(headers({ "x-real-ip": " 2001:db8::1 " }), 1)).toBe(
      "2001:db8::1",
    );
  });

  it("returns null for a missing or malformed address", () => {
    expect(getClientIp(headers({}), 1)).toBeNull();
    expect(
      getClientIp(headers({ "x-forwarded-for": "not-an-ip" }), 1),
    ).toBeNull();
    expect(getClientIp(headers({ "x-forwarded-for": " , " }), 1)).toBeNull();
  });
});
