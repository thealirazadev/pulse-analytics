import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { readRequestSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { site } from "@/lib/db/schema";
import { apiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { serializeSite } from "@/lib/sites/serialize";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  req: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  if (!readRequestSession(req)) return apiError("unauthorized");
  const { id } = await params;
  try {
    const rows = await getDb()
      .select()
      .from(site)
      .where(eq(site.publicId, id))
      .limit(1);
    if (!rows[0]) return apiError("not_found");
    return NextResponse.json(serializeSite(rows[0]));
  } catch (err) {
    logger.error("site_get_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  if (!readRequestSession(req)) return apiError("unauthorized");
  const { id } = await params;
  try {
    const deleted = await getDb()
      .delete(site)
      .where(eq(site.publicId, id))
      .returning({ id: site.id });
    if (deleted.length === 0) return apiError("not_found");
    logger.info("site_deleted", { siteId: deleted[0]!.id });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logger.error("site_delete_error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return apiError("internal");
  }
}
