/**
 * Reduce a full referrer URL to just its external hostname. Returns null for
 * direct traffic, unparsable input, or a referrer from the site's own domain
 * (self-referrals are not external traffic).
 */
export function reduceReferrer(
  referrer: string | null,
  ownDomain: string,
): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  if (host === ownDomain.toLowerCase()) return null;
  return host;
}
