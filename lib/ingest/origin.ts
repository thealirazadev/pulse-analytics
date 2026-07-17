/**
 * The write path is public but origin-checked: a beacon is only accepted when
 * the request's Origin (or, failing that, Referer) host matches the registered
 * site's domain. Missing/unparsable headers do not match.
 */
export function originMatchesDomain(
  origin: string | null,
  referer: string | null,
  siteDomain: string,
): boolean {
  const domain = siteDomain.toLowerCase();
  for (const candidate of [origin, referer]) {
    if (!candidate) continue;
    try {
      const host = new URL(candidate).hostname.toLowerCase();
      if (host === domain) return true;
    } catch {
      // ignore unparsable header, try the next
    }
  }
  return false;
}
