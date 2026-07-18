import { open, type CountryResponse, type Reader } from "maxmind";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Offline country resolution against a local MaxMind database. The reader is
 * opened once and reused. If GEOIP_DB_PATH is empty or the file is
 * missing/corrupt, geo is disabled: one warning is logged and every lookup
 * returns null. A visitor IP is never sent anywhere.
 */

// undefined = not initialized yet; null = disabled (no db / failed to open)
let reader: Reader<CountryResponse> | null | undefined;

async function getReader(): Promise<Reader<CountryResponse> | null> {
  if (reader !== undefined) return reader;

  const path = getEnv().GEOIP_DB_PATH;
  if (!path) {
    reader = null;
    return reader;
  }

  try {
    reader = await open<CountryResponse>(path);
  } catch (err) {
    logger.warn("geoip_disabled", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    reader = null;
  }
  return reader;
}

/** ISO 3166-1 alpha-2 country for an IP, or null when geo is disabled/unknown. */
export async function lookupCountry(ip: string): Promise<string | null> {
  const r = await getReader();
  if (!r) return null;
  try {
    const result = r.get(ip);
    return result?.country?.iso_code ?? null;
  } catch {
    return null;
  }
}

/** Test-only: force the reader to re-initialize on next lookup. */
export function resetGeoReader(): void {
  reader = undefined;
}
