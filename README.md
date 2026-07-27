# pulse-analytics

[![CI](https://github.com/thealirazadev/pulse-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/thealirazadev/pulse-analytics/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A self-hosted, privacy-first web analytics app. A site owner adds a tiny script
snippet to their site; pulse collects pageviews without cookies or persistent
identifiers, aggregates them into hourly and daily rollups, and shows a dashboard
with pageviews, unique visitors, top pages, referrers, countries, and device
classes over selectable time ranges. Unique visitors are counted with a
daily-rotating salted hash, so nobody - including the operator - can link a
visitor across days.

The system is three decoupled paths: a cheap write path (`/api/collect` inserts
raw events), a scheduled idempotent aggregation job (`/api/jobs/rollup`), and a
read path (the dashboard, which queries only the rollup tables - never raw
events).

## Screenshots

The dashboard over the last 7 days - pageviews and unique-visitor time-series,
summary tiles, and the top pages / referrers / countries / devices breakdowns -
in light and dark themes:

![Pulse dashboard, light theme: 7-day pageviews and unique-visitor time-series with summary tiles and top pages, referrers, countries and device breakdown panels for the demo site Northwind Store](docs/images/dashboard-light.png)

![Pulse dashboard, dark theme: the same 7-day view with the time-series chart and the four breakdown panels](docs/images/dashboard-dark.png)

The "Today" range plots the hourly curve; the site-management screen lists
registered sites with their verification status; and each site has a copy-paste
install snippet:

![Dashboard on the Today range, showing the hourly pageviews and visitors curve building through the day](docs/images/dashboard-today.png)

![Site management screen listing the registered demo sites with verified badges and the add-site form](docs/images/sites.png)

![Per-site install screen showing the copy-paste tracking snippet for the site](docs/images/snippet.png)

These are genuine captures of the running app reading a seeded demo database
(all data synthetic, `example.com`-style domains). Reproduce them with
`scripts/demo/seed.mjs` (seed and aggregate) and `scripts/demo/capture.mjs`
(ingest live beacons, run the rollup job, then screenshot).

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL 16 with Drizzle ORM (migrations via drizzle-kit) and the postgres.js driver
- Tailwind CSS 3.4
- uPlot for the time-series chart
- node:crypto for auth (scrypt password, HMAC session cookie) and the visitor hash
- Vitest (unit/component/integration), Playwright (e2e smoke)

## Prerequisites

- Node.js 20+ (developed on Node 24)
- A PostgreSQL 16 database. For local development, run one with Docker:

```bash
docker run -d --name pulse-pg \
  -e POSTGRES_USER=pulse -e POSTGRES_PASSWORD=pulse -e POSTGRES_DB=pulse \
  -p 5432:5432 postgres:16
```

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` - e.g. `postgres://pulse:pulse@localhost:5432/pulse`
- `SESSION_SECRET` - `openssl rand -hex 32`
- `ADMIN_EMAIL` - your login email
- `ADMIN_PASSWORD_HASH` - `npm run hash-password -- 'your-password'`
- `CRON_SECRET` - `openssl rand -hex 24`
- `APP_URL` - the public base URL (`http://localhost:3000` in dev)
- `GEOIP_DB_PATH` - optional absolute path to a MaxMind GeoLite2-Country.mmdb;
  leave empty to disable country resolution (countries show as "Unknown")

Apply the database schema:

```bash
npm run db:migrate
```

## Run

```bash
npm run dev            # http://localhost:3000
# or a production build
npm run build && npm run start
```

Log in at `/login`, register a site under `/sites`, copy its snippet into your
site's `<head>`, and the site flips to verified on the first pageview.

### Tracking custom events

The snippet exposes a tiny global for named events - counts only, no properties:

```html
<script>
  pulse("event", "signup");
</script>
```

Call `pulse('event', '<name>')` on any interaction you want to count (a signup,
a purchase, a demo request). Names must match `^[A-Za-z0-9._-]{1,64}$`. The call
reuses the same beacon transport as pageviews, sends nothing under DNT/GPC or
before the `data-site` snippet has loaded, and never throws into your page.
Counts appear in the dashboard's "Custom events" panel after the next rollup run.

### Goals and conversions

A goal is a conversion target for a site: either a `path` (matched against
pageview paths) or an `event` (matched against a named custom event you already
track). The rollup job counts completions per goal per UTC day, and the
dashboard's "Goals" panel shows each goal with its completions and a conversion
rate over the selected range.

Register, list, and delete goals through the session-guarded `/api/goals` API:

```bash
# A path goal: a completion is any pageview of /thank-you
curl -X POST "$APP_URL/api/goals" -H "content-type: application/json" \
  -b pulse_session=... \
  -d '{"site":"pk_x8f2ab31","kind":"path","name":"Thank you","match":"/thank-you"}'

# An event goal: a completion is each `signup` custom event
curl -X POST "$APP_URL/api/goals" -H "content-type: application/json" \
  -b pulse_session=... \
  -d '{"site":"pk_x8f2ab31","kind":"event","name":"Signups","match":"signup"}'
```

Goals reuse the two existing raw streams, so there is no new beacon or snippet
change. The conversion rate is `completions / visitors`, where `visitors` is the
range's summed daily unique visitors (the same figure the summary tiles show).
Because completions are total occurrences and visitors is unique-per-day summed,
the rate is "completions per visitor" and can exceed 100% for a repeatable goal.
Completions appear after the next rollup run; the catch-up horizon is the same
72 hours as raw retention, so a goal only counts completions still in that window.

### Scheduling the aggregation job

The dashboard is only as fresh as the last rollup run. Schedule a call every
5 minutes with any cron that can run curl:

```
*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/jobs/rollup
```

The job is idempotent and catch-up safe: it recomputes from the watermark to now,
so missed runs self-heal. It also prunes raw events past 72 hours and destroys
expired daily salts.

## Test

Unit, component, and integration tests run with Vitest. Integration tests need a
reachable Postgres - create a disposable test database and point
`TEST_DATABASE_URL` at it (default `postgres://localhost:5432/pulse_test`):

```bash
docker exec pulse-pg psql -U pulse -d pulse -c "CREATE DATABASE pulse_test;"
npm run test
```

Other commands:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e   # Playwright smoke; needs a fresh DB and E2E_ADMIN_PASSWORD set
```

GitHub Actions runs `typecheck`, `lint`, `test`, and `build` against a
`postgres:16` service container on every push and pull request to `main`. The
Playwright e2e smoke test is not part of CI - it needs a browser download and a
running production server, so run it locally with `npm run test:e2e`.

## Design decisions

The trade-offs that shaped this codebase, and the alternatives that were
considered and rejected.

**Dashboards read rollups only, never raw events.** The system is three
decoupled paths: the write path is dumb and cheap, the read path is dumb and
cheap, and the aggregation job in between carries all the logic. No dashboard
or stats query ever touches `event_raw`, so read latency is independent of
traffic volume and a busy site cannot slow its own dashboard. The cost is that
the dashboard is only as fresh as the last rollup run (5 minutes). This
boundary is enforced, not just documented: a test statically asserts that
`lib/stats/queries.ts` contains no reference to the raw table.

**Aggregation recomputes and overwrites; it never increments.** Every rollup
write is `INSERT ... ON CONFLICT DO UPDATE` with freshly recomputed values.
That single choice buys idempotency, replay safety, and catch-up after missed
cron runs at once: running the job twice, or re-covering an hour after a crash,
always converges to the same rows. The job processes "watermark to now" rather
than "the last hour", so a missed run self-heals on the next tick. An
incrementing counter would have been cheaper per run but would drift
permanently on any double-delivery or partial failure - and losing events is
tolerable here, while corrupting rollups is not.

**Cookieless visitor counting with a daily-rotating salt.** A visitor is
identified as `sha256(daily_salt || site_id || ip || ua)`, truncated to 128
bits. The IP exists only in memory for the geo lookup and the hash, and is
never stored or logged. Nothing at all is written to the visitor's browser - no
cookie, no localStorage, no fingerprint. Because the snippet and the endpoint
store nothing on the visitor's device, there is no device storage access for a
consent banner to gate, which is the point of the design. The salt's
_destruction_ is the real guarantee: the housekeeping step deletes every salt
for a day before today, and recomputing past rollups never needs it (hashes are
already materialized on the raw rows). Once a day ends, no party - the operator
included - can recompute or verify that day's hashes, so cross-day linkage is
impossible rather than merely disallowed.

**Multi-day "visitors" is the sum of daily uniques.** Daily figures are an
exact `COUNT(DISTINCT visitor_hash)` because the hash is stable within a UTC
day. Across days the salt has rotated, so a 7-day total sums seven daily
uniques and overcounts anyone who returns. This is the designed consequence of
salt rotation, not a bug, and the UI labels it honestly ("per day, summed"). It
is not fixable without keeping a stable cross-day identifier, which would
destroy the privacy guarantee above.

**PostgreSQL over SQLite.** Ingestion is write-heavy and concurrent: beacon
bursts insert while the rollup job runs multi-statement read/recompute/upsert
transactions over the same table. Postgres MVCC handles concurrent writers and
the aggregation transaction without a global write lock, and provides
`timestamptz`, `date_trunc`, and a robust `INSERT ... ON CONFLICT DO UPDATE`.
SQLite serializes writers even in WAL mode, which would make the job and
ingestion contend. The trade-off is one more service to run; SQLite would be
simpler operationally but is the wrong shape for this write pattern.

**Drizzle over Prisma.** The heart of this app is hand-written aggregation SQL:
`GROUP BY` over time buckets, `COUNT(DISTINCT visitor_hash)`, and
`ON CONFLICT DO UPDATE`. Drizzle is SQL-first - the schema is plain TypeScript,
migrations are generated SQL files reviewed like code, and raw SQL composes
naturally. Prisma's engine layer and generated client add weight and distance
from SQL for no benefit here.

**Hand-rolled auth instead of an auth library.** One admin with env-configured
credentials does not justify NextAuth or a session store. `node:crypto`
supplies scrypt for the password hash, HMAC-SHA-256 for a stateless signed
session cookie, SHA-256 for visitor hashes, and `randomBytes` for salts. The
cookie _is_ the session - there is no server-side session table. One
consequence worth naming: `middleware.ts` runs on the Edge runtime, which has
no `node:crypto`, so it performs a presence-only cookie gate; authoritative
signature and expiry verification happens in every guarded route handler and
server component, so a forged cookie passes the gate but fails at the data
layer. Validation is likewise hand-rolled: the beacon payload has three short
fields and the stats API three enum-ish params, which does not warrant a schema
library.

**Cron hitting a protected route, not a standalone script.** Keeping the job in
the app means one deployable and one env/DB/logger bootstrap, and it works with
any scheduler that can run `curl`. The trade-off is that the job runs inside the
web process, so the recompute is bounded (at most 78 hourly buckets per
invocation; the next call continues) to avoid a route timeout on a large
backfill.

## Benchmarks

Real measurements from this repository's scripts, not estimates. Reproduce with
`scripts/bench/` (see below).

**Conditions.** Single machine, everything local: 12th Gen Intel Core i5-1235U
(10 cores / 12 threads), 31 GiB RAM, Ubuntu (kernel 6.8), Node 24.18,
PostgreSQL 16.14 in Docker, Next.js 15.5 production build (`next start`). The
load generator, the app server, and Postgres all share this one machine, and
other containers were running, so these are conservative lower bounds rather
than tuned peak figures. `GEOIP_DB_PATH` was empty, so no geo lookup was
performed.

**Ingest throughput** - `POST /api/collect` over HTTP, 20,000 requests at
concurrency 64, spread over 500 registered sites so the per-site rate limiter
(10/s sustained, burst 50) never engages. Every request returned `202` and was
stored; there were no throttled or failed requests in any trial.

| Trial | Requests | Concurrency | Result         | Throughput |
| ----- | -------- | ----------- | -------------- | ---------- |
| 1     | 20,000   | 64          | 20,000 × `202` | 679 req/s  |
| 2     | 20,000   | 64          | 20,000 × `202` | 707 req/s  |

Each accepted request performs payload validation, a site lookup, the origin
check, device classification, the salted visitor hash, and one `event_raw`
insert.

**Rollup aggregation** - one full `POST /api/jobs/rollup` over a synthetically
seeded volume spanning a 24-hour window, with the watermark rewound so a single
invocation recomputes all 25 hourly buckets plus the 2 UTC days they touch
(6 statements per day). Events are seeded in ascending `ts` order to match what
append-only ingestion actually produces on disk.

| Raw events in window | Hourly buckets | Days recomputed | Aggregation time |
| -------------------- | -------------- | --------------- | ---------------- |
| 100,000              | 25             | 2               | 1.07 s           |
| 500,000              | 25             | 2               | 5.64 s           |
| 1,000,000            | 25             | 2               | 12.68 s          |

At 1,000,000 events the job finishes in well under the 5-minute cron interval,
with room to spare. For reference, before `event_raw` was indexed on `ts` the
same 1,000,000-event run took 22.49 s, because each hourly bucket sequentially
scanned the whole raw table; the index turns each bucket's plan from a parallel
sequential scan (120 ms) into an index scan (64 ms).

Reproduce against a disposable database:

```bash
export DATABASE_URL=postgres://pulse:pulse@localhost:5432/pulse_test
npm run build && npm run start -- -p 3999   # or: next start -p 3999

# ingest throughput
node scripts/bench/seed.mjs --sites 500
node scripts/bench/ingest.mjs --url http://localhost:3999 \
  --requests 20000 --concurrency 64 --sites 500

# rollup aggregation
node scripts/bench/seed.mjs --events 1000000 --hours 24
node --env-file=.env scripts/bench/rollup.mjs --url http://localhost:3999 --hours 24
```

## Privacy

No cookies, no localStorage, no fingerprinting. The visitor IP exists only in
memory for the geo lookup and the daily salted hash, and is never stored or
logged. Salts rotate per UTC day and old salts are destroyed, so a visitor cannot
be linked across days by anyone, operator included. Do Not Track and Global
Privacy Control are honored by both the snippet and the ingest endpoint.

## License

MIT
