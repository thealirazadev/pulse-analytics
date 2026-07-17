# Memory: pulse-analytics

Running log of what is done, what is in flight, and decisions worth remembering. Update after every meaningful chunk of work; log every non-obvious decision WITH its reason. Keep entries short and dated.

## Completed

- 2026-07-18 — Planning documentation created (README, PRD, architecture, api-contracts, rules, phases, design, testing, launch-checklist, memory, .env.example). No code yet; docs under owner review.
- 2026-07-18 — Phase 1 done. Next 15 App Router + TS + Tailwind 3.4 scaffold boots and builds; ESLint/Prettier/Vitest configured. Approved deps installed at pinned exact versions (drizzle-orm 0.45.2, drizzle-kit 0.31.10, postgres 3.4.9, uplot 1.6.32, maxmind 5.0.6) + standard Next/test toolchain; package-lock.json committed. `lib/env.ts` (fail-fast validated env), `lib/logger.ts` (structured JSON, rejects ip/userAgent fields), `lib/errors.ts` (single error body). Drizzle schema for all 10 tables; migration 0000_init generated and applied cleanly (idempotent on re-run). Privacy primitives: salt get-or-create (race-safe) + destroyExpiredSalts, visitor hash. 17 tests pass (unit + one Postgres integration). Verification: `tsc --noEmit` clean, `next lint` clean, `next build` clean, `vitest run` green.

- 2026-07-18 — Phase 2 done. Full ingestion path: `POST /api/collect` enforces 1KB cap (413), hand-rolled validation + path normalization (400), site lookup + Origin/Referer check (403), DNT/Sec-GPC drop (202, no store), per-site token bucket 10/s burst 50 (429), bot drop (202, no store), then device class + optional offline geo + salted visitor hash + single event_raw insert (202, no Set-Cookie). IP only ever in-memory, never stored/logged (log-capture test proves it). Rollup job `POST /api/jobs/rollup` (bearer auth, advisory lock -> 409 on concurrent): recomputes hourly buckets watermark->now, recomputes touched days incl. exact COUNT(DISTINCT) daily uniques, upsert-overwrite only, advances watermark past the 5-min grace, prunes raw >72h, destroys expired salts, caps 78 buckets/run. 77 tests pass (unit + Postgres integration): idempotency, gap backfill, distinct daily, sentinel mapping, prune, replay, lock. Verification: tsc/lint/build/vitest all clean.

## In progress

- Phase 3 next: admin auth (scrypt password, signed session cookie, middleware guard).

## Decisions log

- 2026-07-18 — Postgres over SQLite: ingestion writes concurrently with the rollup job's recompute transactions; SQLite's single-writer model is the wrong shape. Trade-off (one extra service) accepted; docker-compose proposed for dev.
- 2026-07-18 — Drizzle over Prisma: the core of the app is hand-written aggregation SQL; Drizzle stays close to SQL and its migrations are reviewable SQL files. Neither reference project has a DB, so no convention existed to follow.
- 2026-07-18 — Rollups are recompute-and-overwrite (upsert from raw per bucket), never incremented. This single choice provides idempotency, replay safety, and catch-up after missed cron runs.
- 2026-07-18 — Daily salt destruction (delete all salts before today) is the cross-day unlinkability guarantee; past rollup recomputation uses materialized hashes and never needs old salts.
- 2026-07-18 — Aggregation is triggered by cron hitting a bearer-protected route rather than a standalone script: one deployable, one env/DB bootstrap, works with any scheduler.
- 2026-07-18 — No auth or validation libraries: node:crypto (scrypt + HMAC cookie) and hand-rolled validators cover the single-admin, three-field-payload reality. Proposed dependency list is only drizzle-orm, drizzle-kit, postgres, uplot, maxmind — all pending owner approval.
- 2026-07-18 — Multi-day "visitors" is the sum of daily uniques and is labeled as such in the UI; exact cross-day dedup is impossible by design and that is the point.
- 2026-07-18 — Dev Postgres runs via `docker run postgres:16` published on localhost:5432; `.env` (gitignored) points DATABASE_URL there. Separate `pulse_test` database for integration tests via TEST_DATABASE_URL; `tests/setup.ts` redirects the app DB client to it so tests never touch dev data.
- 2026-07-18 — Env-loading uses Node's built-in `process.loadEnvFile`/`--env-file` (no dotenv dependency). `drizzle.config.ts` loads .env only when DATABASE_URL is unset so an explicit env var can target the test DB.
- 2026-07-18 — Build environment cannot run the Next.js server: `next dev`/`next start` (next-server) is killed with signal 16 on startup in this sandbox, while a plain Node HTTP server and outbound Postgres both work. Verification therefore uses `next build` for compile/render coverage and direct route-handler invocation (as prescribed in docs/testing.md) for API/pipeline coverage; live-server HTTP smoke and Playwright e2e are logged as manual steps to run in a normal environment.
- 2026-07-18 — visitor hash concatenation uses null-byte separators between fields (salt/site/ip/ua) to keep boundaries unambiguous; still sha256 truncated to 128 bits (32 hex).
- 2026-07-18 — Rollup SQL binds all timestamps as ISO text with an explicit `::timestamptz` cast (never a raw JS Date) so the hand-written postgres.js queries survive cross-realm module loading in the test runner; drizzle inserts are unaffected. Vitest runs test files sequentially (`fileParallelism:false`) because integration tests share one Postgres database and truncate between cases.
- 2026-07-18 — Rollup route validates the bearer token with `timingSafeEqual`. Collect `DNT`/bot drops return 202 (accepted, nothing stored) so probes cannot distinguish a tracked vs untracked site.
