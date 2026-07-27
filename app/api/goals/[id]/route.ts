import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { readRequestSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { goal } from "@/lib/db/schema";
import { apiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(
  req: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  if (!readRequestSession(req)) return apiError("unauthorized");
  const { id } = await params;
  const goalId = Number(id);
  if (!Number.isInteger(goalId) || goalId < 1) return apiError("not_found");
  try {
    const deleted = await getDb()
      .delete(goal)
      .where(eq(goal.id, goalId))
      .returning({ id: goal.id });
    if (deleted.length === 0) return apiError("not_found");
    logger.info("goal_deleted", { goalId: deleted[0]!.id });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logger.error("goal_delete_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}
