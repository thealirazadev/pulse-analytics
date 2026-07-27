import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { apiError } from "@/lib/errors";

/**
 * First-gate guard for the dashboard, site management, and their APIs. It only
 * checks that a session cookie is present (Edge runtime — no node:crypto).
 * Authoritative signature/expiry verification happens in every guarded handler
 * and server component, so a forged cookie still fails there. The ingest and
 * cron routes are intentionally not matched.
 */
export function middleware(req: NextRequest): NextResponse {
  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasCookie) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api")) {
    return apiError("unauthorized");
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sites/:path*",
    "/api/stats/:path*",
    "/api/sites/:path*",
    "/api/goals/:path*",
    "/api/auth/logout",
  ],
};
