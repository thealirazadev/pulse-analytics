import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { readRequestSession } from "@/lib/auth/session";
import { isProductionUrl } from "@/lib/env";
import { apiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!readRequestSession(req)) {
    return apiError("unauthorized");
  }

  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProductionUrl(),
    maxAge: 0,
  });
  return res;
}
