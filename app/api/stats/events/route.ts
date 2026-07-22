import { NextResponse, type NextRequest } from "next/server";
import { readRequestSession } from "@/lib/auth/session";
import { apiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseLimit, parseRange } from "@/lib/stats/ranges";
import { getCustomEvents, getSiteIdByPublicId } from "@/lib/stats/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!readRequestSession(req)) return apiError("unauthorized");

  const params = req.nextUrl.searchParams;
  const range = parseRange(params.get("range"));
  if (!range) return apiError("invalid_range");

  const limit = parseLimit(params.get("limit"));
  if (limit === null) return apiError("invalid_range");

  const publicId = params.get("site");
  if (!publicId) return apiError("not_found");

  try {
    const siteId = await getSiteIdByPublicId(publicId);
    if (siteId === null) return apiError("not_found");

    const rows = await getCustomEvents(siteId, range, limit);
    return NextResponse.json({ rows });
  } catch (err) {
    logger.error("stats_events_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}
