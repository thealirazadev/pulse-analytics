import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("round-trips a correct password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("s3cret");
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("produces a salt:hash hex format with a fresh salt each time", () => {
    const a = hashPassword("same");
    const b = hashPassword("same");
    expect(a).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(a).not.toBe(b);
  });

  it("returns false on a malformed stored value", () => {
    expect(verifyPassword("x", "not-a-valid-hash")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "abcd:")).toBe(false);
  });
});
