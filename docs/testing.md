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

CI and local runs both require a reachable Postgres; the proposed docker-compose file provides it. Integration tests truncate their tables between cases and never touch the dev database.

### Component tests - Vitest + Testing Library
Behavior and accessibility, not styling: `StatTile` (value, em-dash empty state, caption), `BreakdownList` (ordering, truncation, empty state), `RangePicker`/`SitePicker` (keyboard operation, selection announced), `SiteForm` (inline validation, error from a mocked `409`), `ConfirmDialog` (focus trap, `Esc`, focus return), `SnippetBlock` (copy announcement). Mock `fetch` for panels; never a live server in component tests.

### End-to-end - Playwright (one smoke test, Phase 6)
Runs against `next build && next start` with a fresh test database and test env vars. Flow: log in -> register a site -> POST beacons via the request API (with a matching `Origin` header) -> POST the rollup route with the test `CRON_SECRET` -> open the dashboard and assert non-zero tile, chart, and breakdown content -> log out. Unhappy-path assertions: bad login shows the generic message; unauthenticated `/dashboard` redirects to `/login`.

### Manual QA
The per-phase checklists in `docs/phases.md` cover what automation cannot: real-browser DNT behavior, devtools cookie/header inspection, killing Postgres mid-session, theme/contrast eyeballing, and keyboard walkthroughs.

## Exact commands

```
# Install (exact pinned versions; commit package-lock.json)
npm install

# Lint
npm run lint

# Unit + component + integration tests (integration needs TEST_DATABASE_URL reachable)
npm run test

# Watch mode (local dev)
npm run test:watch

# End-to-end smoke (Phase 6 on)
npm run test:e2e

# Production build (must succeed before a feature is done)
npm run build

# Database migrations
npm run db:generate   # generate migration from schema changes
npm run db:migrate    # apply migrations
```

Expected `package.json` scripts:

```
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "hash-password": "node scripts/hash-password.mjs"
}
```

## Definition of "tests pass" for a feature

All of the following succeed locally before the feature's commit:

- `npm run lint` - no errors.
- `npm run build` - succeeds.
- `npm run test` - all unit, component, and integration tests pass.
- From Phase 6 on, `npm run test:e2e` - the smoke test passes.

Never commit a feature leaving any of these red. If a fix fails twice, stop and report per `docs/rules.md`.
