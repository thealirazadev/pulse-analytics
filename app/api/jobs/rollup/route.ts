import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { runRollup } from "@/lib/rollup/job";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bearerMatches(header: string | null, secret: string): boolean {
  if (!header || !header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!bearerMatches(req.headers.get("authorization"), getEnv().CRON_SECRET)) {
    return apiError("unauthorized");
  }

  try {
    const result = await runRollup();
    if ("locked" in result) {
      return apiError("conflict", "A rollup run is already in progress.");
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    logger.error("rollup_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}
