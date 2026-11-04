import { createHmac, randomBytes } from "node:crypto";

/**
 * In-memory token buckets for ingest: one per site and one per client. Correct
 * for this single-instance, self-hosted deployment; a restart resets the
 * buckets (harmless) and a multi-instance deployment would need a shared store
 * (out of scope).
 *
 * A site sustains 10 req/s with a burst of 50. A single client sustains 2 req/s
 * with a burst of 20, so one noisy client is cut off before it can drain the
 * site bucket that legitimate visitors share. Constants live here, not in
 * config.
 */

interface BucketSpec {
  refillPerSecond: number;
  capacity: number;
}

const SITE_BUCKET: BucketSpec = { refillPerSecond: 10, capacity: 50 };
const CLIENT_BUCKET: BucketSpec = { refillPerSecond: 2, capacity: 20 };

/** How often idle client buckets are swept so the map cannot grow unbounded. */
const SWEEP_INTERVAL_MS = 60_000;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const siteBuckets = new Map<string, Bucket>();
const clientBuckets = new Map<string, Bucket>();
let lastSweep = 0;

// Client buckets are keyed by a keyed hash of the IP, never the IP itself, and
// the key exists only in this process's memory.
const clientKeySecret = randomBytes(32);

function clientKey(ip: string): string {
  return createHmac("sha256", clientKeySecret).update(ip).digest("base64url");
}

function refill(bucket: Bucket, spec: BucketSpec, now: number): void {
  const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
  bucket.tokens = Math.min(
    spec.capacity,
    bucket.tokens + elapsedSeconds * spec.refillPerSecond,
  );
  bucket.updatedAt = now;
}

function getBucket(
  map: Map<string, Bucket>,
  key: string,
  spec: BucketSpec,
  now: number,
): Bucket {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { tokens: spec.capacity, updatedAt: now };
    map.set(key, bucket);
  }
  refill(bucket, spec, now);
  return bucket;
}

/** Drop client buckets that have been idle long enough to be full again. */
function sweepClients(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  const idleMs =
    (CLIENT_BUCKET.capacity / CLIENT_BUCKET.refillPerSecond) * 1000;
  for (const [key, bucket] of clientBuckets) {
    if (now - bucket.updatedAt >= idleMs) clientBuckets.delete(key);
  }
}

/**
 * Consume one token for the site `siteKey` and, when the client address is
 * known, one for that client. A request the client bucket rejects does not
 * spend a site token. Returns false when either bucket is empty; both refill
 * over time and recover on their own once traffic drops.
 *
 * `clientIp` is used only in memory to derive the bucket key; it is never
 * stored as-is or logged.
 */
export function allowRequest(
  siteKey: string,
  clientIp: string | null = null,
  now: number = Date.now(),
): boolean {
  if (clientIp) sweepClients(now);
  const client = clientIp
    ? getBucket(clientBuckets, clientKey(clientIp), CLIENT_BUCKET, now)
    : null;
  if (client && client.tokens < 1) return false;

  const site = getBucket(siteBuckets, siteKey, SITE_BUCKET, now);
  if (site.tokens < 1) return false;

  if (client) client.tokens -= 1;
  site.tokens -= 1;
  return true;
}

/** Test-only: clear all buckets. */
export function resetRateLimits(): void {
  siteBuckets.clear();
  clientBuckets.clear();
  lastSweep = 0;
}

/** Test-only: number of client buckets currently held. */
export function clientBucketCount(): number {
  return clientBuckets.size;
}
