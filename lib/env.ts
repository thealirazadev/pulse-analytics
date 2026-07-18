/**
 * Validated, server-only environment access. Reads once, caches, and fails
 * fast with a single clear message listing every missing required variable.
 * Never expose any of these to the client; there are no NEXT_PUBLIC_ vars.
 */

export interface Env {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD_HASH: string;
  CRON_SECRET: string;
  /** Empty string disables geo lookup; everything else must be an absolute path. */
  GEOIP_DB_PATH: string;
  APP_URL: string;
}

const REQUIRED: Array<keyof Env> = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
  "CRON_SECRET",
  "APP_URL",
];

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;

  const missing: string[] = [];
  for (const key of REQUIRED) {
    const value = process.env[key];
    if (value === undefined || value.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill in real values.`,
    );
  }

  cached = {
    DATABASE_URL: process.env.DATABASE_URL as string,
    SESSION_SECRET: process.env.SESSION_SECRET as string,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL as string,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH as string,
    CRON_SECRET: process.env.CRON_SECRET as string,
    GEOIP_DB_PATH: process.env.GEOIP_DB_PATH ?? "",
    APP_URL: process.env.APP_URL as string,
  };

  return cached;
}

/** True when APP_URL is https, used to decide the Secure cookie flag. */
export function isProductionUrl(): boolean {
  return getEnv().APP_URL.startsWith("https://");
}

/** Test-only: clear the cache so a changed process.env is re-read. */
export function resetEnvCache(): void {
  cached = undefined;
}
