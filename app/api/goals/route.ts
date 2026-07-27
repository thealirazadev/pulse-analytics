import { asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { readRequestSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { goal, site } from "@/lib/db/schema";
import { apiError } from "@/lib/errors";
import { serializeGoal } from "@/lib/goals/serialize";
import { validateGoal } from "@/lib/goals/validate";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface PgErrorFields {
  code?: string;
  constraint?: string;
}

/** Extract Postgres error code/constraint, unwrapping a drizzle wrapper. */
function pgError(err: unknown): PgErrorFields {
  if (!err || typeof err !== "object") return {};
  const outer = err as Record<string, unknown>;
  const source = (
    outer.cause && typeof outer.cause === "object" ? outer.cause : outer
  ) as Record<string, unknown>;
  return {
    code: typeof source.code === "string" ? source.code : undefined,
    constraint:
      typeof source.constraint_name === "string"
        ? source.constraint_name
        : undefined,
  };
}

/** Resolve a public site id to its internal id, or null if unknown. */
async function resolveSiteId(publicId: string): Promise<number | null> {
  const rows = await getDb()
    .select({ id: site.id })
    .from(site)
    .where(eq(site.publicId, publicId))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!readRequestSession(req)) return apiError("unauthorized");

  const publicId = req.nextUrl.searchParams.get("site");
  if (!publicId) return apiError("not_found");

  try {
    const siteId = await resolveSiteId(publicId);
    if (siteId === null) return apiError("not_found");
    const rows = await getDb()
      .select()
      .from(goal)
      .where(eq(goal.siteId, siteId))
      .orderBy(asc(goal.createdAt));
    return NextResponse.json({ goals: rows.map(serializeGoal) });
  } catch (err) {
    logger.error("goals_list_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!readRequestSession(req)) return apiError("unauthorized");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_payload");
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const publicId = typeof record.site === "string" ? record.site : null;
  if (!publicId) return apiError("invalid_payload");

  const valid = validateGoal(record);
  if (!valid.ok) return apiError("invalid_payload");

  try {
    const siteId = await resolveSiteId(publicId);
    if (siteId === null) return apiError("not_found");

    const rows = await getDb()
      .insert(goal)
      .values({
        siteId,
        kind: valid.value.kind,
        name: valid.value.name,
        matchValue: valid.value.matchValue,
      })
      .returning();
    logger.info("goal_created", { siteId, goalId: rows[0]!.id });
    return NextResponse.json(serializeGoal(rows[0]!), { status: 201 });
  } catch (err) {
    const { code, constraint } = pgError(err);
    if (code === "23505" && constraint === "goal_site_kind_match_uq") {
      return apiError("conflict");
    }
    logger.error("goal_create_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}
