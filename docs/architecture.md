# Architecture: pulse-analytics

## App flow

The system is three decoupled paths. The write path is dumb and cheap, the read path is dumb and cheap, and the aggregation job in between carries all the logic. Dashboards never query raw events.

### Write path (ingestion)

1. The tracked site loads `public/p.js` (the snippet) with a `data-site` attribute carrying the site's public ID.
2. On page load and on SPA route changes, the snippet sends `POST /api/collect` via `navigator.sendBeacon` (fallback `fetch` with `keepalive`). The body is JSON in a `text/plain` request so the browser sends it without a CORS preflight. If DNT or GPC is enabled, the snippet sends nothing.
3. The route handler, in order: rejects bodies over 1 KB (`413`); parses and validates the payload (`400`); resolves the site by public ID and checks the request `Origin`/`Referer` host against the registered domain (`403`); drops requests with `DNT: 1`/`Sec-GPC: 1` headers (`202`, nothing stored); applies the per-site rate limit (`429`); classifies the UA into a device class and drops bots (`202`, nothing stored).
4. It then reads the client IP from the connection/forwarded header, looks up the country in a local GeoIP database, computes `visitor_hash = sha256(daily_salt || site_id || ip || ua)` using today's UTC salt, and lets the IP go out of scope. The IP is never stored and never logged.
5. One row is inserted into `event_raw` (ts, path, referrer host, country, device, visitor hash). Response `202`, no body, no `Set-Cookie`.

### Aggregation job (the bridge)

6. A scheduler (system cron, a container cron sidecar, or a platform cron) calls `POST /api/jobs/rollup` every 5 minutes with `Authorization: Bearer $CRON_SECRET`.
7. The job recomputes every hourly bucket from `rollup_watermark.finalized_through` up to and including the current partial hour, straight from `event_raw`, and upserts the results (overwrite, never increment). It then recomputes the daily tables for every UTC day touched by those hours. Recompute-and-overwrite is the idempotency mechanism: running the job twice, or re-covering an hour after a crash, always converges to the same rows.
8. The watermark advances past an hour only once the hour has been over for a 5-minute grace period. Because the job always processes "watermark to now" rather than "the last hour", missed runs self-heal: the next run backfills the whole gap. The catch-up horizon equals raw retention (72 hours); gaps older than that are permanently lost, which is acceptable (losing events is tolerable, corrupting rollups is not).
9. Housekeeping in the same run: delete `event_raw` rows older than 72 hours whose day is finalized, and delete `daily_salt` rows for days before the current UTC day (salt destruction — see data model).

### Read path (dashboard)

10. The admin logs in at `/login`; `POST /api/auth/login` verifies the env-configured credentials and sets a signed, HttpOnly session cookie. `middleware.ts` guards `/dashboard`, `/sites`, `/api/stats/*`, and `/api/sites*`.
11. Dashboard pages are a server-rendered shell; the chart, tiles, and breakdown panels are client components that fetch `GET /api/stats/summary|timeseries|breakdown` when the site or range picker changes. Those routes read only the rollup tables via `lib/stats/queries.ts`.

```
Tracked site (browser)
  |  p.js: pageview + SPA route changes, DNT/GPC-aware
  v
POST /api/collect  -- validate size/shape, origin vs site, rate limit,
  |                   UA -> device (drop bots), IP -> country -> hash -> discard IP
  v
event_raw  (72 h retention)                          WRITE PATH
  |
  |  POST /api/jobs/rollup (cron, Bearer CRON_SECRET, every 5 min)
  |  recompute hours since watermark -> upsert-overwrite -> daily recompute
  |  prune old raw, destroy old salts, advance watermark
  v
rollup_hourly / rollup_daily / rollup_{page,referrer,country,device}_daily
  |
  |  GET /api/stats/* (session cookie)                READ PATH
  v
Dashboard (tiles, time-series chart, breakdowns)
```

## Proposed folder / file tree

```
pulse-analytics/
  app/
    layout.tsx                    Root layout: html/body, theme
    globals.css                   Tailwind directives + tokens
    page.tsx                      Redirects to /dashboard (or /login)
    not-found.tsx                 Global 404
    error.tsx                     Route-level error boundary (client)
    login/
      page.tsx                    Login form (client)
    dashboard/
      layout.tsx                  Authed shell: header, site picker, range picker slots
      page.tsx                    Redirects to first site or shows "no sites" empty state
      [siteId]/
        page.tsx                  Dashboard for one site (server shell + client panels)
    sites/
      page.tsx                    Site list + register form
      [id]/
        page.tsx                  Snippet block + verification status (polls)
    api/
      collect/route.ts            Ingestion endpoint (public, origin-checked)
      jobs/rollup/route.ts        Aggregation job trigger (Bearer CRON_SECRET)
      auth/login/route.ts         POST login
      auth/logout/route.ts        POST logout
      sites/route.ts              GET list, POST create
      sites/[id]/route.ts         GET one (verify polling), DELETE
      stats/summary/route.ts      Totals for a range
      stats/timeseries/route.ts   Hourly/daily points for a range
      stats/breakdown/route.ts    Top-N per dimension
  middleware.ts                   Session check for dashboard pages and APIs
  components/
    layout/
      Header.tsx                  App name, nav, logout, theme toggle
      ThemeToggle.tsx             Client
    dashboard/
      SitePicker.tsx              Client; switches [siteId]
      RangePicker.tsx             Client; today / 7d / 30d / 90d
      StatTile.tsx                Value + label (+ optional delta later)
      TimeseriesChart.tsx         Client; uPlot wrapper, crosshair tooltip
      BreakdownList.tsx           Top-N rows with proportional bars
    sites/
      SiteForm.tsx                Register form with inline validation
      SnippetBlock.tsx            Copy-ready script tag
      VerifyStatus.tsx            Polls until verified
    ui/
      Button.tsx  Input.tsx  Card.tsx  Skeleton.tsx  EmptyState.tsx  ErrorState.tsx
      ConfirmDialog.tsx           For site deletion
  lib/
    db/
      client.ts                   postgres.js connection (server-only), fails fast on bad env
      schema.ts                   Drizzle table definitions (source for migrations)
    ingest/
      validate.ts                 Payload shape/limits, path normalization (strip query/fragment)
      origin.ts                   Origin/Referer host vs registered domain
      rateLimit.ts                In-memory token bucket per site
      device.ts                   UA -> desktop|mobile|tablet|unknown; bot detection
      geo.ts                      Optional local mmdb lookup; null country when absent
      referrer.ts                 Referrer URL -> external hostname or null
    privacy/
      salt.ts                     Get-or-create today's UTC salt (race-safe); destroyExpiredSalts
      visitorHash.ts              sha256(salt || siteId || ip || ua) -> 32 hex chars
    rollup/
      job.ts                      Orchestrates recompute, watermark, prune, salt destruction
      sql.ts                      The recompute/upsert statements (hand-written SQL)
    stats/
      queries.ts                  Rollup reads only — must not import event_raw
      ranges.ts                   Range preset -> [from, to, interval], UTC
    auth/
      password.ts                 scrypt hash/verify (node:crypto)
      session.ts                  HMAC-signed cookie create/verify (node:crypto)
      loginLimit.ts               In-memory login attempt limiter
    env.ts                        Validated env access (server-only vs public)
    logger.ts                     Structured JSON logger; forbids ip/ua fields
    errors.ts                     apiError(code, message) -> the single error body
  drizzle/                        Generated SQL migrations (committed, never edited after apply)
  public/
    p.js                          The tracking snippet (hand-written, size-budgeted)
  tests/
    unit/                         Vitest: salt, hash, device, validate, ranges, rateLimit, snippet size
    integration/                  Vitest vs real Postgres: ingest -> rollup -> stats, idempotency
    components/                   Vitest + Testing Library
    e2e/                          Playwright smoke
  docs/
  .env.example
  drizzle.config.ts
  next.config.ts  tailwind.config.ts  postcss.config.mjs  tsconfig.json
  vitest.config.ts  playwright.config.ts
  eslint.config.mjs  .prettierrc
  package.json  package-lock.json
```

A `docker-compose.yml` with a local Postgres 16 service is proposed for dev convenience; it is optional and not required by the app.

## Tech stack with rationale

Major versions below; exact versions are pinned at install time and `package-lock.json` is committed (see `docs/rules.md`).

- **Next.js 15 (App Router) + TypeScript 5** — matches the conventions of the other Next.js projects in this portfolio (`woo-headless`). One deployable holds the ingest route, job route, APIs, and dashboard; server components keep DB access and secrets server-side.
- **PostgreSQL 16** — chosen over SQLite deliberately. Ingestion is write-heavy and concurrent: beacon bursts insert while the rollup job runs multi-statement read/recompute/upsert transactions over the same table. Postgres MVCC handles concurrent writers and the aggregation transaction without a global write lock; SQLite serializes writers (even in WAL mode) and would make the job and ingestion contend. Postgres also gives `timestamptz`, `date_trunc`, and robust `INSERT ... ON CONFLICT DO UPDATE` for the upsert-overwrite pattern. Trade-off: one more service to run; mitigated by the optional docker-compose file. SQLite would be simpler operationally but is the wrong shape for this write pattern.
- **Drizzle ORM + drizzle-kit (0.4x / 0.3x)** — neither reference project has a database, so this is a fresh choice, made for one reason: the heart of this app is hand-written aggregation SQL (`GROUP BY` over time buckets, `COUNT(DISTINCT visitor_hash)`, `ON CONFLICT DO UPDATE`). Drizzle is SQL-first — the schema is plain TypeScript, migrations are generated SQL files reviewed like code, and raw SQL composes naturally. Prisma's engine layer and generated client add weight and distance from SQL for no benefit here. Proposed dependency, needs approval.
- **postgres (postgres.js) driver 3.x** — the lightweight driver Drizzle recommends; a single connection pool in `lib/db/client.ts`. Proposed dependency, needs approval.
- **Tailwind CSS 3.4** — same as the reference projects; tokens from `docs/design.md` live in `tailwind.config.ts`.
- **uPlot 1.6** — the one chart on the dashboard is a time series, uPlot's exact specialty: canvas-based, ~45 KB, zero dependencies, fast with thousands of points. Breakdown panels use plain HTML/CSS proportional bars and need no library. Recharts/Chart.js were rejected as heavier general-purpose kits for a single chart type. Proposed dependency, needs approval.
- **maxmind 5.x + a local GeoLite2-Country database** — country resolution must be offline; sending visitor IPs to a geo API would break the privacy design. The `maxmind` package reads a local `.mmdb` file given by `GEOIP_DB_PATH`. The database file is not committed; if the path is unset or missing, country is null and everything else works. Proposed dependency, needs approval.
- **node:crypto for auth and hashing — no auth library.** scrypt for the admin password hash, HMAC-SHA-256 for the signed session cookie, SHA-256 for visitor hashes, `randomBytes` for salts. One admin with env credentials does not justify NextAuth or a session-store dependency.
- **Hand-rolled validation** — the beacon payload has three short fields and the stats API has three enum-ish params. A schema library (zod) is not warranted; `lib/ingest/validate.ts` and `lib/stats/ranges.ts` validate by hand with unit tests.
- **Cron hitting a protected route** (vs a standalone Node script) — chosen because it keeps one deployable and one env/DB/logger setup, and works with any scheduler that can run `curl` (system cron, container cron, platform cron). A standalone script would duplicate env validation and DB bootstrapping. Trade-off documented: the job runs inside the web process; the recompute is bounded (72 h of raw data max) so this is acceptable at self-hosted scale. Route timeout risk on huge backfills is handled by the job capping work per invocation (process at most 78 hourly buckets per call; the next call continues).
- **Vitest + Testing Library + Playwright, ESLint + Prettier** — same tooling as the reference projects. Integration tests for the SQL run against a real disposable Postgres (see `docs/testing.md`).

## Data model

Schema defined in `lib/db/schema.ts`; every change ships as a generated migration in `drizzle/`. All times are UTC (`timestamptz`); "day" always means UTC day.

### site

```
site (
  id          serial PRIMARY KEY,
  public_id   text NOT NULL UNIQUE,      -- e.g. "pk_x8f2ab31"; used in the snippet and APIs
  domain      text NOT NULL UNIQUE,      -- lowercased hostname, no scheme, no port
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz                -- set by ingestion on the first accepted event
)
```

`public_id` (not the numeric id) is what the snippet and all HTTP APIs use, so internal ids never leak and domains can change without breaking snippets.

### daily_salt

```
daily_salt (
  day        date PRIMARY KEY,           -- UTC day
  salt       text NOT NULL,              -- 32 random bytes, hex
  created_at timestamptz NOT NULL DEFAULT now()
)
```

Created lazily by the first event of the day: `INSERT ... ON CONFLICT (day) DO NOTHING` then select — race-safe under concurrent beacons. **Destruction is the privacy guarantee:** the housekeeping step deletes every row with `day < current UTC day`. Recomputing past rollups never needs the salt (hashes are already materialized on raw rows), so once a day ends its salt has no legitimate use and is destroyed. After destruction, no party — operator included — can recompute or verify a past day's hash, which is what makes cross-day linkage impossible.

### event_raw (write path; 72-hour retention)

```
event_raw (
  id            bigserial PRIMARY KEY,
  site_id       integer NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  ts            timestamptz NOT NULL DEFAULT now(),
  path          text NOT NULL,           -- "/" + normalized path, <= 512 chars, no query/fragment
  referrer_host text,                    -- external hostname only; NULL = direct or internal
  country       char(2),                 -- ISO 3166-1 alpha-2; NULL = unknown / no geo db
  device        text NOT NULL,           -- 'desktop' | 'mobile' | 'tablet' | 'unknown' (bots never stored)
  visitor_hash  text NOT NULL            -- 32 hex chars (sha256 truncated to 128 bits)
)
CREATE INDEX event_raw_site_ts_idx ON event_raw (site_id, ts);
```

Deliberately contains no IP, no raw UA, no full referrer URL, and no cross-day identifier. Pruned by the job after 72 hours (constant in code, not config).

### Rollup tables (read path — dashboards read only these)

All rollups are written with `INSERT ... ON CONFLICT (pk) DO UPDATE SET` using freshly recomputed values — overwrite, never increment.

```
rollup_hourly (
  site_id   integer NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  bucket    timestamptz NOT NULL,        -- UTC hour start
  pageviews integer NOT NULL,
  visitors  integer NOT NULL,            -- COUNT(DISTINCT visitor_hash) within the hour
  PRIMARY KEY (site_id, bucket)
)

rollup_daily (
  site_id   integer NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  day       date NOT NULL,
  pageviews integer NOT NULL,
  visitors  integer NOT NULL,            -- COUNT(DISTINCT visitor_hash) across the UTC day
  PRIMARY KEY (site_id, day)
)

rollup_page_daily (
  site_id, day, path text NOT NULL, pageviews, visitors,
  PRIMARY KEY (site_id, day, path)
)

rollup_referrer_daily (
  site_id, day, referrer_host text NOT NULL,   -- '' (empty string) = direct
  pageviews, visitors,
  PRIMARY KEY (site_id, day, referrer_host)
)

rollup_country_daily (
  site_id, day, country char(2) NOT NULL,      -- 'ZZ' = unknown
  pageviews, visitors,
  PRIMARY KEY (site_id, day, country)
)

rollup_device_daily (
  site_id, day, device text NOT NULL, pageviews, visitors,
  PRIMARY KEY (site_id, day, device)
)
```

NULL dimensions are mapped to sentinels (`''` direct, `'ZZ'` unknown) because primary-key columns cannot be NULL; `lib/stats/queries.ts` maps them back to display labels.

Semantics worth stating precisely:

- `rollup_daily.visitors` is exact for the day because the hash is stable within a day. Hourly `visitors` is exact per hour. Summing hourly visitors over a day overcounts; the day figure always comes from `rollup_daily`.
- Multi-day totals sum daily uniques and therefore overcount repeat visitors across days. This is the designed consequence of salt rotation and is labeled honestly in the UI ("unique visitors per day, summed"). It is not fixable without breaking the privacy guarantee.

### rollup_watermark

```
rollup_watermark (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single row
  finalized_through timestamptz NOT NULL   -- every hour bucket ending <= this is final
)
```

Job algorithm per run: recompute all hourly buckets in `(finalized_through, now]`; recompute daily tables for every UTC day those buckets touch; advance `finalized_through` to the end of the newest hour that has been over for >= 5 minutes (grace for in-flight inserts; events get server-side timestamps, so there are no genuinely late events beyond that). Then prune raw and destroy salts. Constants: retention 72 h, grace 5 min, max 78 buckets per invocation.

## Where state lives

- **Postgres** — everything durable: sites, salts (today's only), raw events (72 h), rollups, watermark.
- **Server memory (per process)** — the ingest rate-limit buckets and login-attempt counters. Accepted trade-off for a single-instance self-hosted app: a restart resets limiters (harmless), and multi-instance deployments would need a shared store (out of scope, noted here deliberately).
- **Client (browser of the admin)** — the session cookie (signed, HttpOnly, no server-side session table; the cookie itself is the session) and the theme preference in `localStorage`. Dashboard panel state (selected site, range) lives in the URL (`/dashboard/[siteId]?range=7d`) so views are bookmarkable.
- **Visitor browsers** — nothing. No cookie, no storage. This line is the product.

## External dependencies

- PostgreSQL 16 reachable via `DATABASE_URL`.
- A scheduler that can `curl` the rollup route every 5 minutes (system cron, container cron, or platform cron).
- Optional: a MaxMind GeoLite2-Country `.mmdb` file on disk (free license from MaxMind; the operator downloads it — never committed). Without it, countries are "Unknown".
- Proposed npm dependencies (all need approval before install): `drizzle-orm`, `drizzle-kit`, `postgres`, `uplot`, `maxmind`. Everything else uses Node built-ins or the standard Next/Tailwind/test toolchain.

### Required environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Server-only | Postgres connection string |
| `SESSION_SECRET` | Server-only | HMAC key for the session cookie (32+ random bytes, hex) |
| `ADMIN_EMAIL` | Server-only | The single admin login |
| `ADMIN_PASSWORD_HASH` | Server-only | scrypt hash of the admin password (`salt:hash`, hex); a helper script prints one |
| `CRON_SECRET` | Server-only | Bearer token required by `POST /api/jobs/rollup` |
| `GEOIP_DB_PATH` | Server-only | Absolute path to GeoLite2-Country.mmdb; empty disables geo lookup |
| `APP_URL` | Server-only | Public base URL of this deployment; used to render the snippet src and to enforce Secure cookies in production |

No `NEXT_PUBLIC_` variables are needed. All env access goes through `lib/env.ts`, which validates at startup and fails fast with a clear message. See `.env.example`.
