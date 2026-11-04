import { isIP } from "node:net";
import { logger } from "@/lib/logger";

/**
 * Resolve the client address from proxy headers, trusting exactly
 * `trustedHops` proxies. Each trusted proxy appends the address it received
 * the request from to X-Forwarded-For, so the right-most `trustedHops` entries
 * are trustworthy and anything to their left may be client-supplied. The
 * entry at that boundary is the client as seen by the outermost trusted proxy.
 *
 * With `trustedHops` 0 the headers are ignored entirely and null is returned:
 * without a proxy in front, every forwarded header is attacker-controlled.
 *
 * The result is for in-memory use only (geo lookup, visitor hash, rate
 * limiting) and must never be stored or logged.
 */
export function getClientIp(
  headers: Headers,
  trustedHops: number,
): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");

  if (trustedHops <= 0) {
    if (forwarded || realIp) warnIgnoredOnce();
    return null;
  }

  let candidate: string | undefined;
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    candidate = hops[Math.max(0, hops.length - trustedHops)];
  } else if (realIp) {
    candidate = realIp.trim();
  }

  return candidate && isIP(candidate) ? candidate : null;
}

let warned = false;

function warnIgnoredOnce(): void {
  if (warned) return;
  warned = true;
  logger.warn("proxy_headers_ignored", {
    reason:
      "TRUSTED_PROXY_HOPS is 0; set it to the number of reverse proxies in front of the app",
  });
}
