/**
 * In-memory login attempt limiter: at most 5 attempts per minute per source.
 * The key (a source identifier) is held only in memory and never stored.
 */

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

/** Record an attempt for `key`; return false once the window is saturated. */
export function allowLogin(key: string, now: number = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

/** Test-only: clear all counters. */
export function resetLoginLimits(): void {
  attempts.clear();
}
