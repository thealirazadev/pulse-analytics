# Contributing to pulse-analytics

Thanks for your interest in improving pulse-analytics. This document covers the
local setup, the checks every change must pass, and the one architectural
invariant a contribution must never break.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- Node.js 20+ (developed on Node 24).
- Docker, for a local PostgreSQL 16.
- A security issue is **not** a contribution — report it privately per
  [SECURITY.md](SECURITY.md) instead of opening a PR or issue.

## Local setup

Start a Postgres 16 container and create a separate database for the integration
tests:

```bash
docker run -d --name pulse-pg \
  -e POSTGRES_USER=pulse -e POSTGRES_PASSWORD=pulse -e POSTGRES_DB=pulse \
  -p 5432:5432 postgres:16

docker exec pulse-pg psql -U pulse -d pulse -c "CREATE DATABASE pulse_test;"
```

Install dependencies and create your env file:

```bash
npm install
cp .env.example .env
```

Fill in `.env` following the comments there (`SESSION_SECRET` and `CRON_SECRET`
via `openssl rand -hex 32`, `ADMIN_PASSWORD_HASH` via
`npm run hash-password -- 'your-password'`). Point `TEST_DATABASE_URL` at the
`pulse_test` database so tests never touch your dev data:

```
DATABASE_URL=postgres://pulse:pulse@localhost:5432/pulse
TEST_DATABASE_URL=postgres://pulse:pulse@localhost:5432/pulse_test
```

Apply the schema and start the app:

```bash
npm run db:migrate
npm run dev            # http://localhost:3000
```

## Checks every change must pass

CI runs these four against a `postgres:16` service container on every push and
pull request to `main`. Run all four locally before opening a PR; a change is
not done until they are green:

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint via next lint
npm run test           # vitest: unit, component, integration (needs Postgres)
npm run build          # next build
```

The Playwright end-to-end smoke (`npm run test:e2e`) is intentionally not part
of CI — it needs a browser download and a running production server. Run it
locally when you touch the login → sites → dashboard flow.

## Database changes

Every schema change goes through a Drizzle migration; applied migrations are
never edited afterward.

1. Edit `lib/db/schema.ts`.
2. Generate the SQL: `npm run db:generate`.
3. Review the generated file under `drizzle/` — it is reviewed like code.
4. Apply it: `npm run db:migrate`.

Commit the schema change, the generated migration, and its `drizzle/meta`
snapshot together.

## The invariant you must preserve: the write/read split

pulse-analytics is three decoupled paths, and the boundary between them is the
core of the design:

- the **write path** (`/api/collect`) only inserts raw events;
- the scheduled **aggregation job** (`/api/jobs/rollup`) recomputes and
  overwrites the rollup tables — it never increments, so it is idempotent and
  catch-up safe;
- the **read path** (the dashboard and every `/api/stats/*` endpoint) queries
  **only** the rollup tables — never `event_raw` or `custom_event_raw`.

A dashboard or stats query that touches a raw table is a regression, not a
feature. This is enforced, not just documented: `tests/unit/statsRollupOnly.test.ts`
statically asserts that `lib/stats/queries.ts` contains no reference to a raw
table, and any new read query must keep that guard passing.

Two more properties are treated the same way and must not regress:

- **Privacy.** A visitor IP is used only in memory for the geo lookup and the
  daily salted hash; it is never stored or logged. The `lib/logger.ts` structured
  logger rejects `ip`/`userAgent` fields, and a log-capture test proves a full
  ingest writes neither. See the privacy invariants in [SECURITY.md](SECURITY.md).
- **UTC-pinned rollups.** Aggregation buckets are pinned to UTC
  (`date_trunc(..., 'UTC')` and explicit `timestamptz` day bounds) so results do
  not shift with the server's timezone. `tests/integration/rollupTimezone.test.ts`
  runs the recompute over a non-UTC connection to keep this honest.

## Pull requests

- Keep PRs small and focused on one change.
- Use Conventional Commit messages (`feat:`, `fix:`, `test:`, `docs:`,
  `chore:`), lower-case, imperative. One discrete change per commit.
- Add or extend tests for any behavior you change; a bug fix should come with a
  test that fails before it.
- Pin exact dependency versions and commit `package-lock.json`. Do not add a new
  runtime dependency without discussing it first in an issue — the project
  deliberately leans on `node:crypto` and hand-rolled validators instead of
  libraries.
- Fill in the pull request template; confirm typecheck, lint, test, and build
  all pass.
- No emoji in code, comments, or commit messages.

## Reporting bugs and proposing features

Open an issue using the bug report or feature request template. For anything
touching auth, the ingest endpoint, the rollup job, or a privacy invariant,
report it privately per [SECURITY.md](SECURITY.md) rather than in a public issue.
