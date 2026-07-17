import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./constants";

/**
 * The session cookie is a self-contained, HMAC-signed token: base64url(payload)
 * "." hex(signature). No server-side store — the signature and the embedded
 * expiry are the whole session. Tampered or expired tokens verify to null.
 */

export interface SessionPayload {
  sub: string;
  exp: number; // epoch milliseconds
}

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
  if (typeof payload.sub !== "string" || typeof payload.exp !== "number") {
    return null;
  }
  if (now >= payload.exp) return null;
  return payload;
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
