import { beforeEach, describe, expect, it } from "vitest";
import { allowLogin, resetLoginLimits } from "@/lib/auth/loginLimit";

describe("allowLogin", () => {
  beforeEach(resetLoginLimits);

  it("allows 5 attempts per minute then blocks the sixth", () => {
    const t = 1_000_000;
    const results = Array.from({ length: 6 }, () => allowLogin("1.2.3.4", t));
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("recovers after the window passes", () => {
    const t = 2_000_000;
    for (let i = 0; i < 5; i++) allowLogin("5.6.7.8", t);
    expect(allowLogin("5.6.7.8", t)).toBe(false);
    expect(allowLogin("5.6.7.8", t + 61_000)).toBe(true);
  });

  it("tracks sources independently", () => {
    const t = 3_000_000;
    for (let i = 0; i < 5; i++) allowLogin("a", t);
    expect(allowLogin("a", t)).toBe(false);
    expect(allowLogin("b", t)).toBe(true);
  });
});
