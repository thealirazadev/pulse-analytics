import { describe, expect, it } from "vitest";
import {
  generatePublicId,
  validateDomain,
  validateName,
} from "@/lib/sites/validate";

describe("validateDomain", () => {
  it("accepts and lowercases bare hostnames", () => {
    expect(validateDomain("example.com")).toBe("example.com");
    expect(validateDomain("EXAMPLE.COM")).toBe("example.com");
    expect(validateDomain("sub.example.co.uk")).toBe("sub.example.co.uk");
    expect(validateDomain("  my-site.io  ")).toBe("my-site.io");
  });

  it("rejects schemes, ports, paths, and non-domains", () => {
    expect(validateDomain("https://example.com")).toBeNull();
    expect(validateDomain("example.com/path")).toBeNull();
    expect(validateDomain("example.com:8080")).toBeNull();
    expect(validateDomain("localhost")).toBeNull();
    expect(validateDomain("no spaces .com")).toBeNull();
    expect(validateDomain("")).toBeNull();
    expect(validateDomain(42)).toBeNull();
  });
});

describe("validateName", () => {
  it("accepts a trimmed non-empty name", () => {
    expect(validateName("  My Site ")).toBe("My Site");
  });
  it("rejects empty and over-length names", () => {
    expect(validateName("")).toBeNull();
    expect(validateName("   ")).toBeNull();
    expect(validateName("a".repeat(81))).toBeNull();
    expect(validateName(null)).toBeNull();
  });
});

describe("generatePublicId", () => {
  it("matches the public id pattern and varies", () => {
    const a = generatePublicId();
    expect(a).toMatch(/^pk_[a-z0-9]{8}$/);
    expect(a).not.toBe(generatePublicId());
  });
});
