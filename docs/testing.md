# Testing: pulse-analytics

Build and tests must pass before any feature is marked done. The riskiest code is the pipeline - salt lifecycle, hash derivation, ingest validation, and the rollup SQL - so that is where test depth goes. After creating or editing files, run build and tests and fix all errors BEFORE reporting done.

## Strategy

### Unit tests - Vitest
Pure logic, no network, no database:

- **Privacy:** `visitorHash` determinism, cross-salt divergence, output format; logger rejection of `ip`/`userAgent` fields; log-capture assertion that a mocked full ingest emits no IP/UA anywhere.
- **Ingest:** payload validation (missing fields, bad `sid` pattern, non-`/` path, oversized values), path normalization (query/fragment stripping, 512-char cap), referrer reduction (external host kept, own domain dropped, garbage -> null), device classification against a UA fixture list (desktop/mobile/tablet/unknown/bots), rate limiter (burst, sustained, recovery).
- **Stats:** range parsing (`today`/`7d`/`30d`/`90d`, UTC boundaries, invalid input), sentinel-to-label mapping, zero-filling of missing buckets.
- **Auth:** scrypt verify round-trip, session cookie sign/verify/expiry/tamper, login limiter.
- **Snippet budget:** read `public/p.js`, assert `<= 1536` bytes.

### Integration tests - Vitest against a real Postgres
The rollup SQL and salt lifecycle cannot be meaningfully tested against mocks. These tests run migrations into a disposable database (`TEST_DATABASE_URL`, default `postgres://localhost:5432/pulse_test`), seed raw events with hand-built timestamps, and assert:

- Salt get-or-create is race-safe (two concurrent calls, one row) and destruction leaves only today.
- Job idempotency: run twice, rollup rows byte-identical.
- Catch-up: seed a 6-hour gap since the watermark, one run backfills all buckets to the same values as uninterrupted runs.
- Daily uniques are exact `COUNT(DISTINCT)` across the day, not a sum of hourly figures.
- Pruning removes only raw rows past retention on finalized days and never changes rollups.
- The full pipeline: HTTP ingest (route handler invoked directly) -> raw row -> job -> stats queries return the expected numbers.
- Stats layer reads rollups only (static assertion that `lib/stats/queries.ts` has no `event_raw` reference).

CI and local runs both require a reachable Postgres: CI uses a `postgres:16` service container, and locally the `docker run` command in the README provides one. Integration tests truncate their tables between cases and never touch the dev database.

### Component tests - Vitest + Testing Library
Behavior and accessibility, not styling: `StatTile` (value, em-dash empty state, caption), `BreakdownList` (ordering, truncation, empty state), `RangePicker`/`SitePicker` (keyboard operation, selection announced), `SiteForm` (inline validation, error from a mocked `409`), `ConfirmDialog` (focus trap, `Esc`, focus return), `SnippetBlock` (copy announcement). Mock `fetch` for panels; never a live server in component tests.

### End-to-end - Playwright (one smoke test, local only)
Runs against `next build && next start` with a fresh test database and test env vars. Flow: log in -> register a site -> POST beacons via the request API (with a matching `Origin` header) -> POST the rollup route with the test `CRON_SECRET` -> open the dashboard and assert non-zero tile, chart, and breakdown content -> log out. Unhappy-path assertions: bad login shows the generic message; unauthenticated `/dashboard` redirects to `/login`.

### Manual QA
Some checks stay manual because automation cannot cover them well: real-browser DNT behavior, devtools cookie/header inspection, killing Postgres mid-session, theme/contrast eyeballing, and keyboard walkthroughs.

## Exact commands

```
# Install (exact pinned versions; commit package-lock.json)
npm install

# Type check and lint
npm run typecheck
npm run lint

# Unit + component + integration tests (integration needs TEST_DATABASE_URL reachable)
npm run test

# Same suite with the coverage gate CI enforces (85% of lines and statements in lib/ and app/api/)
npm run test:coverage

# Watch mode (local dev)
npm run test:watch

# End-to-end smoke (local only; needs a fresh DB and E2E_ADMIN_PASSWORD)
npm run test:e2e

# Production build (must succeed before a feature is done)
npm run build

# Database migrations
npm run db:generate   # generate migration from schema changes
npm run db:migrate    # apply migrations
```

## CI

`.github/workflows/ci.yml` runs one job on `ubuntu-latest` for every push and pull request to
`main`, against a `postgres:16` service container (health-checked with `pg_isready`). It sets dummy
values for the env vars `lib/env.ts` requires, points both `DATABASE_URL` and `TEST_DATABASE_URL`
at the disposable service database, and runs, on Node 24:

1. `npm ci`
2. `npm run db:migrate`
3. `npm run typecheck`
4. `npm run lint`
5. `npm run test:coverage` (Vitest unit, component and integration tests, failing below 85 percent
   line and statement coverage of `lib/` and `app/api/`)
6. `npm run build`

The Playwright smoke test is not part of CI: it needs a browser download and a running production
server, so it is run locally with `npm run test:e2e`.

## Definition of "tests pass" for a feature

All of the following succeed locally before the feature's commit:

- `npm run lint` - no errors.
- `npm run build` - succeeds.
- `npm run test` - all unit, component, and integration tests pass.
- `npm run typecheck` - no errors.
- `npm run test:e2e` - the smoke test passes locally when the change touches the login, sites or dashboard flow.

Never commit a feature leaving any of these red.
