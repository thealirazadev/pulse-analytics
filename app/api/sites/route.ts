import { desc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { readRequestSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { site, type Site } from "@/lib/db/schema";
import { apiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  generatePublicId,
  validateDomain,
  validateName,
} from "@/lib/sites/validate";

export const dynamic = "force-dynamic";

export interface SiteDTO {
  id: string;
  domain: string;
  name: string;
  createdAt: string;
  verifiedAt: string | null;
}

export function serializeSite(row: Site): SiteDTO {
  return {
    id: row.publicId,
    domain: row.domain,
    name: row.name,
    createdAt: new Date(row.createdAt).toISOString(),
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt).toISOString() : null,
  };
}

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

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!readRequestSession(req)) return apiError("unauthorized");
  try {
    const rows = await getDb()
      .select()
      .from(site)
      .orderBy(desc(site.createdAt));
    return NextResponse.json({ sites: rows.map(serializeSite) });
  } catch (err) {
    logger.error("sites_list_error", {
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
  const domain = validateDomain(record.domain);
  const name = validateName(record.name);
  if (!domain || !name) return apiError("invalid_payload");

  const db = getDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rows = await db
        .insert(site)
        .values({ publicId: generatePublicId(), domain, name })
        .returning();
      logger.info("site_created", { siteId: rows[0]!.id });
      return NextResponse.json(serializeSite(rows[0]!), { status: 201 });
    } catch (err) {
      const { code, constraint } = pgError(err);
      if (code === "23505") {
        if (constraint === "site_domain_unique") return apiError("conflict");
        if (constraint === "site_public_id_unique") continue; // regenerate
      }
      logger.error("site_create_error", {
        message: err instanceof Error ? err.message : "unknown",
      });
      return apiError("internal");
    }
  }
  return apiError("internal");
}
