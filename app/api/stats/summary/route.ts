import { NextResponse, type NextRequest } from "next/server";
import { readRequestSession } from "@/lib/auth/session";
import { apiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseRange } from "@/lib/stats/ranges";
import { getSiteIdByPublicId, getSummary } from "@/lib/stats/queries";

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

    const summary = await getSummary(siteId, range);
    return NextResponse.json({
      range: { from: range.from, to: range.to, interval: range.interval },
      pageviews: summary.pageviews,
      visitors: summary.visitors,
    });
  } catch (err) {
    logger.error("stats_summary_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}
