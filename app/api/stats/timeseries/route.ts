import { NextResponse, type NextRequest } from "next/server";
import { readRequestSession } from "@/lib/auth/session";
import { apiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { buildBuckets, parseRange, zeroFill } from "@/lib/stats/ranges";
import { getSiteIdByPublicId, getTimeseries } from "@/lib/stats/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!readRequestSession(req)) return apiError("unauthorized");

  const params = req.nextUrl.searchParams;
  const range = parseRange(params.get("range"));
  if (!range) return apiError("invalid_range");

  const publicId = params.get("site");
  if (!publicId) return apiError("not_found");

  try {
    const siteId = await getSiteIdByPublicId(publicId);
    if (siteId === null) return apiError("not_found");

    const rows = await getTimeseries(siteId, range);
    const points = zeroFill(buildBuckets(range), rows);
    return NextResponse.json({ interval: range.interval, points });
  } catch (err) {
    logger.error("stats_timeseries_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}
