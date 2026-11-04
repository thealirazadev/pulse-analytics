import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSession,
  revokeSessions,
  verifySession,
} from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

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

  it("rejects tokens issued before a revocation and accepts newer ones", () => {
    const now = Date.now();
    const before = createSession("admin@example.com", now);
    revokeSessions(now);
    expect(verifySession(before, now)).toBeNull();

    const sameMs = createSession("admin@example.com", now);
    expect(verifySession(sameMs, now)?.sub).toBe("admin@example.com");
  });

  it("rejects a correctly signed token that has no issue time", () => {
    const body = Buffer.from(
      JSON.stringify({ sub: "admin@example.com", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    const sig = createHmac("sha256", getEnv().SESSION_SECRET)
      .update(body)
      .digest("hex");
    expect(verifySession(`${body}.${sig}`)).toBeNull();
  });
});
