# pulse-analytics

A self-hosted, privacy-first web analytics app. A site owner adds a tiny script
snippet to their site; pulse collects pageviews without cookies or persistent
identifiers, aggregates them into hourly and daily rollups, and shows a dashboard
with pageviews, unique visitors, top pages, referrers, countries, and device
classes over selectable time ranges. Unique visitors are counted with a
daily-rotating salted hash, so nobody — including the operator — can link a
visitor across days.

The system is three decoupled paths: a cheap write path (`/api/collect` inserts
raw events), a scheduled idempotent aggregation job (`/api/jobs/rollup`), and a
read path (the dashboard, which queries only the rollup tables — never raw
events).

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

- `DATABASE_URL` — e.g. `postgres://pulse:pulse@localhost:5432/pulse`
- `SESSION_SECRET` — `openssl rand -hex 32`
- `ADMIN_EMAIL` — your login email
- `ADMIN_PASSWORD_HASH` — `npm run hash-password -- 'your-password'`
- `CRON_SECRET` — `openssl rand -hex 24`
- `APP_URL` — the public base URL (`http://localhost:3000` in dev)
- `GEOIP_DB_PATH` — optional absolute path to a MaxMind GeoLite2-Country.mmdb;
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
reachable Postgres — create a disposable test database and point
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
Playwright e2e smoke test is not part of CI — it needs a browser download and a
running production server, so run it locally with `npm run test:e2e`.

## Privacy

No cookies, no localStorage, no fingerprinting. The visitor IP exists only in
memory for the geo lookup and the daily salted hash, and is never stored or
logged. Salts rotate per UTC day and old salts are destroyed, so a visitor cannot
be linked across days by anyone, operator included. Do Not Track and Global
Privacy Control are honored by both the snippet and the ingest endpoint.

## License

MIT
