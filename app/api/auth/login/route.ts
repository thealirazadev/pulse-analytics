import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import { allowLogin } from "@/lib/auth/loginLimit";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { getEnv, isProductionUrl } from "@/lib/env";
import { apiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function sourceKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function safeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!allowLogin(sourceKey(req))) {
    return apiError("rate_limited");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_credentials");
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email : "";
  const password = typeof record.password === "string" ? record.password : "";

  const env = getEnv();
  // Evaluate both factors regardless so the response cannot reveal which field
  // was wrong (and to keep timing uniform).
  const emailOk = safeStringEqual(email, env.ADMIN_EMAIL);
  const passwordOk = verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  if (!emailOk || !passwordOk) {
    logger.info("login_failed", {});
    return apiError("invalid_credentials");
  }

  const token = createSession(env.ADMIN_EMAIL);
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProductionUrl(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  logger.info("login_succeeded", {});
  return res;
}
