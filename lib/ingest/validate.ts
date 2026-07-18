/** Beacon payload limits and hand-rolled validation. */

export const MAX_BEACON_BYTES = 1024;
export const MAX_PATH_LENGTH = 512;
export const SID_PATTERN = /^pk_[a-z0-9]{8}$/;

export interface BeaconPayload {
  sid: string;
  /** Normalized: begins with '/', no query string, no fragment. */
  path: string;
  /** Raw referrer string as sent, reduced to a host later; null if absent. */
  referrer: string | null;
}

export type ValidationResult =
  | { ok: true; value: BeaconPayload }
  | { ok: false };

/**
 * Strip the query string and fragment from a path and require it to start
 * with '/'. Returns null when the input is not a usable path. Enforced
 * server-side regardless of what the client sent.
 */
export function normalizePath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let path = input;
  const hash = path.indexOf("#");
  if (hash !== -1) path = path.slice(0, hash);
  const query = path.indexOf("?");
  if (query !== -1) path = path.slice(0, query);
  if (!path.startsWith("/")) return null;
  if (path.length > MAX_PATH_LENGTH) return null;
  return path;
}

/** Parse and validate a raw beacon body. Never throws. */
export function validateBeacon(rawBody: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false };
  }

  const body = parsed as Record<string, unknown>;

  const sid = body.sid;
  if (typeof sid !== "string" || !SID_PATTERN.test(sid)) {
    return { ok: false };
  }

  const path = normalizePath(body.p);
  if (path === null) {
    return { ok: false };
  }

  let referrer: string | null = null;
  if (body.r !== undefined && body.r !== null) {
    if (typeof body.r !== "string") return { ok: false };
    referrer = body.r;
  }

  return { ok: true, value: { sid, path, referrer } };
}
