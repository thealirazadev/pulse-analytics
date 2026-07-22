import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import type { Database } from "@/lib/db/client";
import { customEventRaw, eventRaw, site } from "@/lib/db/schema";
import { apiError } from "@/lib/errors";
import { classifyDevice, isBot } from "@/lib/ingest/device";
import { lookupCountry } from "@/lib/ingest/geo";
import { originMatchesDomain } from "@/lib/ingest/origin";
import { allowRequest } from "@/lib/ingest/rateLimit";
import { reduceReferrer } from "@/lib/ingest/referrer";
import { MAX_BEACON_BYTES, validateBeacon } from "@/lib/ingest/validate";
import { logger } from "@/lib/logger";
import { getTodaySalt } from "@/lib/privacy/salt";
import { computeVisitorHash } from "@/lib/privacy/visitorHash";

export const dynamic = "force-dynamic";

/** 202 with no body and, crucially, no Set-Cookie. */
function accepted(): NextResponse {
  return new NextResponse(null, { status: 202 });
}

/** First accepted event verifies the site; idempotent (only when still null). */
async function markVerified(
  db: Database,
  siteId: number,
  verifiedAt: Date | null,
): Promise<void> {
  if (verifiedAt !== null) return;
  await db
    .update(site)
    .set({ verifiedAt: new Date() })
    .where(and(eq(site.id, siteId), isNull(site.verifiedAt)));
}

/** Best-effort client IP from proxy headers; only used in-memory, never stored. */
function extractClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() ?? "";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  try {
    // 1. Size cap before doing any work.
    const declared = req.headers.get("content-length");
    if (declared && Number(declared) > MAX_BEACON_BYTES) {
      logger.info("ingest_rejected", { code: "payload_too_large", status: 413 });
      return apiError("payload_too_large");
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BEACON_BYTES) {
      logger.info("ingest_rejected", { code: "payload_too_large", status: 413 });
      return apiError("payload_too_large");
    }

    // 2. Shape and path validation.
    const validation = validateBeacon(rawBody);
    if (!validation.ok) {
      logger.info("ingest_rejected", { code: "invalid_payload", status: 400 });
      return apiError("invalid_payload");
    }
    const beacon = validation.value;

    // 3. Resolve the site by public id.
    const db = getDb();
    const found = await db
      .select({
        id: site.id,
        domain: site.domain,
        verifiedAt: site.verifiedAt,
      })
      .from(site)
      .where(eq(site.publicId, beacon.sid))
      .limit(1);
    const matched = found[0];
    if (!matched) {
      logger.info("ingest_rejected", { code: "unknown_site", status: 403 });
      return apiError("unknown_site");
    }

    // 4. Origin/Referer host must match the registered domain.
    if (
      !originMatchesDomain(
        req.headers.get("origin"),
        req.headers.get("referer"),
        matched.domain,
      )
    ) {
      logger.info("ingest_rejected", {
        code: "origin_mismatch",
        status: 403,
        siteId: matched.id,
      });
      return apiError("origin_mismatch");
    }

    // 5. Honor Do Not Track / Global Privacy Control: accept, store nothing.
    if (
      req.headers.get("dnt") === "1" ||
      req.headers.get("sec-gpc") === "1"
    ) {
      logger.info("ingest_accepted", {
        siteId: matched.id,
        status: 202,
        stored: false,
        reason: "dnt",
        durationMs: Date.now() - start,
      });
      return accepted();
    }

    // 6. Per-site rate limit.
    if (!allowRequest(beacon.sid)) {
      logger.info("ingest_rejected", {
        code: "rate_limited",
        status: 429,
        siteId: matched.id,
      });
      return apiError("rate_limited");
    }

    // 7. Drop bots: accept, store nothing.
    const userAgent = req.headers.get("user-agent") ?? "";
    if (isBot(userAgent)) {
      logger.info("ingest_accepted", {
        siteId: matched.id,
        status: 202,
        stored: false,
        reason: "bot",
        durationMs: Date.now() - start,
      });
      return accepted();
    }

    // 8a. Custom event: counts only. No device, no geo, no IP, no visitor hash.
    if (beacon.kind === "event") {
      await db
        .insert(customEventRaw)
        .values({ siteId: matched.id, name: beacon.name });
      await markVerified(db, matched.id, matched.verifiedAt);

      logger.info("ingest_accepted", {
        siteId: matched.id,
        eventName: beacon.name,
        kind: "event",
        status: 202,
        stored: true,
        durationMs: Date.now() - start,
      });
      return accepted();
    }

    // 8b. Pageview: derive device, country, and visitor hash; the IP never
    // leaves this scope.
    const device = classifyDevice(userAgent);
    const referrerHost = reduceReferrer(beacon.referrer, matched.domain);
    const ip = extractClientIp(req);
    const country = await lookupCountry(ip);
    const salt = await getTodaySalt();
    const visitorHash = computeVisitorHash(salt, matched.id, ip, userAgent);

    await db.insert(eventRaw).values({
      siteId: matched.id,
      path: beacon.path,
      referrerHost,
      country,
      device,
      visitorHash,
    });

    await markVerified(db, matched.id, matched.verifiedAt);

    logger.info("ingest_accepted", {
      siteId: matched.id,
      path: beacon.path,
      device,
      country,
      status: 202,
      stored: true,
      durationMs: Date.now() - start,
    });
    return accepted();
  } catch (err) {
    logger.error("ingest_error", {
      message: err instanceof Error ? err.message : "unknown",
      durationMs: Date.now() - start,
    });
    return apiError("internal");
  }
}
