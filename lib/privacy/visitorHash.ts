import { createHash } from "node:crypto";

/**
 * visitor_hash = sha256(daily_salt || site_id || ip || ua), truncated to
 * 128 bits (32 hex chars). Null-byte separators keep field boundaries
 * unambiguous so distinct inputs cannot collide by concatenation.
 *
 * The salt rotates per UTC day and old salts are destroyed, so the same
 * visitor produces a different hash on a different day and cannot be linked
 * across days by anyone, operator included.
 */
export function computeVisitorHash(
  salt: string,
  siteId: number,
  ip: string,
  userAgent: string,
): string {
  return createHash("sha256")
    .update(`${salt}\0${siteId}\0${ip}\0${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}
