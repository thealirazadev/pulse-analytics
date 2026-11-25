# Design decisions

The engineering decisions behind pulse-analytics, the reason for each, and the bugs or edge
cases found along the way. The README's "Design decisions" section is the short version; the data
model and request flows are in `docs/architecture.md`, and the HTTP contracts in
`docs/api-contracts.md`.

## 1. Three decoupled paths, and the read path never touches raw events

The write path (`/api/collect`) only inserts raw rows, the aggregation job (`/api/jobs/rollup`)
carries all the logic, and the read path (the dashboard and every `/api/stats/*` endpoint) reads
only rollup tables. Read latency is therefore independent of traffic, and a busy site cannot slow
its own dashboard. The cost is freshness bounded by the job interval. The boundary is enforced by
`tests/unit/statsRollupOnly.test.ts`, which statically asserts that `lib/stats/queries.ts` never
references a raw table.

## 2. Rollups are recomputed and overwritten, never incremented

Every rollup write in `lib/rollup/sql.ts` is `INSERT ... ON CONFLICT DO UPDATE` with values
recomputed from raw rows. That one choice gives idempotency, replay safety and catch-up after
missed cron runs: running the job twice converges to the same rows. Daily unique visitors are an
exact `COUNT(DISTINCT visitor_hash)` over the whole UTC day, not a sum of hourly figures. An
incrementing counter would be cheaper per run but would drift permanently on any double delivery
or partial failure.

## 3. Watermark, grace period and a bounded run

The job processes hourly buckets from a stored watermark up to the current partial hour, so a
missed run self-heals on the next one. The watermark only advances to the end of an hour that is
both processed and over by at least five minutes, which keeps in-flight inserts from landing in
an hour already marked final. Each run handles at most 78 hourly buckets because the job runs
inside the web process and must not hit a route timeout on a large backfill; the next call
continues. A Postgres advisory lock (`pg_try_advisory_lock`) allows one run at a time, and a
concurrent caller gets a `409`. The pageview, custom event and goal rollups for a day share one
transaction, so a day's read-path state advances atomically.

## 4. Cookieless visitors with a daily-rotating salt that is destroyed

A visitor is `sha256(salt, site_id, ip, user_agent)` truncated to 128 bits, with null-byte
separators between the fields so boundaries are unambiguous. The salt is per UTC day; get-or-create
uses `INSERT ... ON CONFLICT DO NOTHING` followed by a read, which is race-safe under concurrent
beacons. The housekeeping step deletes every salt before today, and recomputing a past day never
needs its salt because hashes are already materialized on the raw rows. Once a day ends, nobody,
the operator included, can recompute that day's hashes, so cross-day linkage is impossible rather
than merely disallowed. Nothing is written to the visitor's browser.

## 5. Multi-day visitors are the sum of daily uniques

Because the salt rotates, a 7-day "visitors" figure sums seven daily uniques and overcounts
returning visitors. This is the designed consequence of the privacy model, not a bug, and the UI
labels it "per day, summed". Exact cross-day deduplication would require a stable identifier,
which would defeat decision 4.

## 6. The IP never leaves memory

The client IP is read from `X-Forwarded-For` or `X-Real-IP`, used only for the optional offline
GeoLite2 lookup and the hash, and never stored or logged: no table has an IP column, the
structured logger in `lib/logger.ts` rejects `ip` and `userAgent` fields, and a log-capture test
proves a full ingest writes neither. Edge case: a deployment without a proxy that sets those
headers collapses every visitor to the same empty-IP hash, which `SECURITY.md` documents as a
deployment assumption.

## 7. The ingest endpoint fails closed and gives probes nothing

`/api/collect` checks, in order: a 1 KB body cap (`413`), hand-rolled payload validation and path
normalization with query and fragment stripped (`400`), site lookup plus an Origin or Referer match
against the site's domain (`403`), Do Not Track and Global Privacy Control, a per-site token bucket
of 10/s with a burst of 50 (`429`), and bot user agents. DNT, GPC and bot drops return the same
`202` as a stored event, with no body and no `Set-Cookie`, so a probe cannot tell a tracked site
from an untracked one. An event is always attributed to the site its own site id names, and the
origin must match that site, so one site cannot poison another's numbers.

## 8. Rollups are pinned to UTC

Bug found during review: `date_trunc('hour', ts)` and `::date` day bounds are evaluated in the
Postgres session time zone, so on a non-UTC server the daily window shifted off the UTC day, and on
a fractional-offset zone such as +05:30 one UTC hour split across two hourly buckets. The SQL now
uses `date_trunc('hour', ts, 'UTC')` and explicit `timestamptz` day bounds, and the connection pool
sets `TimeZone: "UTC"` as defence in depth. `tests/integration/rollupTimezone.test.ts` runs the
real recompute functions over an Asia/Kolkata connection.

## 9. A `ts`-leading index on raw events

Bug found while benchmarking: the rollup recomputes and the retention prune filter on `ts` across
all sites, which `event_raw_site_ts_idx (site_id, ts)` cannot serve, so every hourly bucket
sequentially scanned the whole raw table. Migration `0001_event_raw_ts_idx` adds `event_raw_ts_idx
(ts)`. On one million time-ordered events the full rollup went from 22.49 s to 12.68 s.
`tests/integration/schemaIndexes.test.ts` asserts the index exists. The benchmark seeds events in
ascending `ts` order on purpose: a random-order seed destroys the physical correlation that
append-only ingestion produces and made the index look useless.

## 10. Custom events and goals reuse the pipeline without touching pageview rollups

Custom events live in a separate `custom_event_raw` table instead of a `name` column on
`event_raw`. Every pageview recompute counts rows of `event_raw` as pageviews, so mixing events in
would have forced a filter into all of those statements. Custom events are counts only: no visitor
hash, and the collect handler never reads the IP for them. Goals add no new collection path: a
`path` goal matches `event_raw.path` and an `event` goal matches `custom_event_raw.name`, joined in
the same day transaction. Completions are an occurrence count, because event goals have no visitor
hash, and the conversion rate is completions divided by summed daily visitors, so it can exceed
100% for a repeatable goal; the panel labels the denominator. Goals are addressed by numeric id
because, unlike sites, they have no public surface.

## 11. Hand-rolled auth with an Edge-safe gate

One admin with env-configured credentials uses `node:crypto` only: scrypt for the password hash
(16-byte salt, timing-safe compare), and an HMAC-SHA-256 signed, stateless `pulse_session` cookie
with a 7-day expiry, `HttpOnly`, `SameSite=Lax` and `Secure` in production. `middleware.ts` runs on
the Edge runtime, which has no `node:crypto`, so it performs a presence-only cookie gate; every
guarded route handler and server component verifies signature and expiry, so a forged cookie passes
the gate but fails at the data layer. Login is rate limited to 5 per minute and never reveals which
field was wrong. The rollup route compares its bearer token with `timingSafeEqual`. scrypt uses
Node's default cost; raising it would invalidate every existing `ADMIN_PASSWORD_HASH`, so it is a
deliberate, documented trade-off rather than a silent bump.

## 12. A small, defensive tracking snippet

`public/p.js` has a 1536-byte budget enforced by `tests/unit/snippet.test.ts`. It is async with no
dependencies, sends with `sendBeacon` and falls back to `fetch` with `keepalive`, tracks
`pushState`, `replaceState` and `popstate`, sends only `location.pathname`, and does nothing under
DNT or GPC. Because the script is async, `document.currentScript` can be null, so it falls back to
`querySelector("script[data-site]")` and derives the collect URL from its own `src`. The
`pulse("event", name)` global is always defined, so calling it before the snippet is configured, or
under DNT, is a safe no-op and never throws into the host page.

## 13. Frontend failure states are visible and honest

Bug found: `DeleteSiteButton` ignored the DELETE response and closed the dialog as if the delete had
succeeded on a 4xx, 5xx or network failure. It now checks `res.ok`, keeps the dialog open and shows
a friendly error. `ErrorState` carries `role="alert"` so a panel that fails to load is announced to
assistive technology instead of swapping silently. The chart has a toggleable accessible data table,
and the theme is applied by `public/theme.js` loaded `beforeInteractive` so there is no flash of the
wrong theme.

## 14. Tests run against a real Postgres, one file at a time

The rollup SQL and salt lifecycle cannot be meaningfully tested against mocks, so integration tests
run migrations into a disposable database (`TEST_DATABASE_URL`) and truncate between cases. Vitest
runs with `fileParallelism: false` because those files share one database. Rollup SQL binds
timestamps as ISO text with an explicit `::timestamptz` cast rather than a JS `Date`, which keeps the
hand-written postgres.js queries working across the test runner's module realms. Coverage of `lib/`
and `app/api/` is gated at 85 percent of lines and statements.
