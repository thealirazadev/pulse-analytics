import { NextResponse, type NextRequest } from "next/server";
import { readRequestSession } from "@/lib/auth/session";
import { apiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getGoals, getSiteIdByPublicId, getSummary } from "@/lib/stats/queries";
import { conversionRate, parseRange } from "@/lib/stats/ranges";

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

    // Completions and the visitor denominator both come from rollups. The rate
    // shares the summary's visitor figure so the panel and tiles agree.
    const [goals, summary] = await Promise.all([
      getGoals(siteId, range),
      getSummary(siteId, range),
    ]);
    const rows = goals.map((g) => ({
      ...g,
      conversionRate: conversionRate(g.completions, summary.visitors),
    }));
    return NextResponse.json({ rows, visitors: summary.visitors });
  } catch (err) {
    logger.error("stats_goals_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}
