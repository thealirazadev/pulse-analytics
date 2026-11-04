import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./constants";

/**
 * The session cookie is a self-contained, HMAC-signed token: base64url(payload)
 * "." hex(signature). There is no session table; the signature, the embedded
 * expiry, and one in-memory cutoff are the whole session. Tampered, expired, or
 * revoked tokens verify to null.
 *
 * Revocation: a token issued before the cutoff is rejected. Logout moves the
 * cutoff to now, which ends every session (there is one admin). The cutoff
 * starts at process start, so a restart also ends every session; that is the
 * price of not keeping server-side state, and it means rotating
 * ADMIN_PASSWORD_HASH or SESSION_SECRET (both need a restart) always logs
 * everyone out. Single-instance only, like the rate limiters.
 */

export interface SessionPayload {
  sub: string;
  iat: number; // epoch milliseconds
  exp: number; // epoch milliseconds
}

interface RevocationState {
  validFrom: number;
}

// Kept on globalThis so every route bundle in the process sees the same cutoff.
const REVOCATION_KEY = Symbol.for("pulse.sessionRevocation");

const revocation: RevocationState = (() => {
  const store = globalThis as typeof globalThis & {
    [REVOCATION_KEY]?: RevocationState;
  };
  store[REVOCATION_KEY] ??= { validFrom: Date.now() };
  return store[REVOCATION_KEY];
})();

function sign(body: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(body).digest("hex");
}

function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function createSession(
  sub: string,
  now: number = Date.now(),
): string {
  const payload: SessionPayload = {
    sub,
    // Never before the cutoff, so a login in the same millisecond as a logout
    // still yields a working session.
    iat: Math.max(now, revocation.validFrom),
    exp: now + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySession(
  token: string | undefined | null,
  now: number = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!body || !signature) return null;
  if (!safeHexEqual(signature, sign(body))) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof payload.sub !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (now >= payload.exp) return null;
  if (payload.iat < revocation.validFrom) return null;
  return payload;
}

/** Invalidate every session issued up to and including `now` (used by logout). */
export function revokeSessions(now: number = Date.now()): void {
  revocation.validFrom = Math.max(revocation.validFrom, now) + 1;
}

/** Read and verify the session from a route handler's request. */
export function readRequestSession(req: NextRequest): SessionPayload | null {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Read and verify the session in a server component. */
export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
