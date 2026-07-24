# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This changelog starts here. `main` has not been tagged or released yet, so the
current state of the codebase is tracked under Unreleased; the first entry with a
version number and date will be added when the first release is cut.

## [Unreleased]

### Added

- Cookieless, privacy-first pageview tracking. A tiny `public/p.js` snippet
  sends a beacon on load and on SPA navigation, honors Do Not Track and Global
  Privacy Control, sets no cookies or storage, and never throws into the host
  page.
- Resilient ingest endpoint `POST /api/collect`: body-size cap, hand-rolled
  payload validation and path normalization, per-site origin check, per-site
  token-bucket rate limiting, bot filtering, in-house device classification, and
  optional offline MaxMind GeoIP country lookup.
- Cookieless unique-visitor counting via a daily-rotating salted hash; the
  visitor IP is used only in memory and never stored or logged, and expired
  salts are destroyed so visitors cannot be linked across UTC days.
- Idempotent, catch-up-safe aggregation job `POST /api/jobs/rollup`: recomputes
  hourly and daily rollups from a watermark, upserts-overwrite (never
  increments), prunes raw events past 72 hours, and destroys expired salts. All
  buckets are UTC-pinned.
- Single-admin authentication built on `node:crypto`: scrypt password hashing, an
  HMAC-signed stateless session cookie, an in-memory login attempt limiter, and
  middleware that guards the dashboard and stats APIs.
- Site management UI and CRUD API: register a site, copy its install snippet, and
  watch it flip to verified on the first accepted pageview; delete cascades a
  site's events and rollups.
- Dashboard read path over rollups only (never raw events): site and range
  pickers, pageviews/unique-visitors tiles, a uPlot time-series chart with an
  accessible data-table alternative, and top pages / referrers / countries /
  devices breakdown panels, each with loading, empty, and retryable error states.
- Named custom events with counts only (no properties): a `pulse('event', name)`
  snippet API, validation and storage on a dedicated raw table, a UTC-pinned
  daily rollup, a `GET /api/stats/events` endpoint, and a dashboard panel.
- Light/dark theming with no flash, an accessibility pass (landmarks, labels,
  focus states, keyboard-operable pickers and dialog, skip link, reduced-motion
  handling), and styled 404 and error pages.

### Documentation

- README with setup, run, and test instructions, design-decision rationale, and
  reproducible ingest and rollup benchmarks.
- `SECURITY.md` (privacy invariants, scope, deployment assumptions),
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and pull-request templates.

### Infrastructure

- GitHub Actions CI running typecheck, lint, test, and build against a
  `postgres:16` service container; grouped monthly Dependabot updates.
