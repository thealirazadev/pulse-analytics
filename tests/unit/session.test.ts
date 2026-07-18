import { describe, expect, it } from "vitest";
import { createSession, verifySession } from "@/lib/auth/session";

// SESSION_SECRET is provided by tests/setup.ts via .env.

describe("session cookie", () => {
  it("signs and verifies a valid token", () => {
    const token = createSession("admin@example.com");
    const payload = verifySession(token);
    expect(payload?.sub).toBe("admin@example.com");
    expect(typeof payload?.exp).toBe("number");
  });

  it("rejects a tampered payload", () => {
    const token = createSession("admin@example.com");
    const [body, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "attacker", exp: Date.now() + 10_000 }),
    ).toString("base64url");
    expect(verifySession(`${forgedBody}.${sig}`)).toBeNull();
    // flip one signature char
    const flipped = (sig![0] === "a" ? "b" : "a") + sig!.slice(1);
    expect(verifySession(`${body}.${flipped}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const past = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const token = createSession("admin@example.com", past);
    expect(verifySession(token)).toBeNull();
  });

  it("rejects empty, malformed, and undefined tokens", () => {
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession("")).toBeNull();
    expect(verifySession("no-dot-here")).toBeNull();
    expect(verifySession(".")).toBeNull();
  });
});
