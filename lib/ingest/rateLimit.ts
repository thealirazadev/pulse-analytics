/**
 * Per-site in-memory token bucket. Correct for this single-instance,
 * self-hosted deployment; a restart resets the buckets (harmless) and a
 * multi-instance deployment would need a shared store (out of scope).
 *
 * Sustained 10 req/s with a burst of 50. Constants live here, not in config.
 */

const REFILL_PER_SECOND = 10;
const BURST_CAPACITY = 50;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Consume one token for `key`. Returns true if allowed, false if the bucket is
 * empty. The limiter refills over time and recovers on its own once traffic
 * drops.
 */
export function allowRequest(key: string, now: number = Date.now()): boolean {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: BURST_CAPACITY, updatedAt: now };
    buckets.set(key, bucket);
  }

  const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
  bucket.tokens = Math.min(
    BURST_CAPACITY,
    bucket.tokens + elapsedSeconds * REFILL_PER_SECOND,
  );
  bucket.updatedAt = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/** Test-only: clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
