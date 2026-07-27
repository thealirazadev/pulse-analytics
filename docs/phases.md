# Phases: pulse-analytics

Phase N+1 does not start until the owner approves phase N. Each phase is the smallest useful chunk that ships and is testable on its own. One commit per feature/task, in the listed order, Conventional Commits. Build and tests must pass before a feature is done (see `docs/testing.md`).

The three senior differentiators — write/read path separation with a scheduled idempotent aggregation job, privacy engineering as testable spec, and ingestion resilience — are hard requirements of Phases 1 and 2. They are not stretch goals and cannot slip.

---

## Phase 1 — Scaffold, schema, and privacy primitives

Goal: a running Next.js app connected to Postgres with the complete schema migrated (raw, rollups, salt, watermark — the write/read separation exists in the schema from day one), plus the tested privacy primitives (salt lifecycle, visitor hash) that everything else builds on.

### Definition of done
- Next.js (App Router) + TypeScript + Tailwind boots with `npm run dev`; ESLint + Prettier pass; Vitest runs.
- Approved dependencies installed with exact pinned versions; `package-lock.json` committed.
- `lib/env.ts` validates all required env vars at startup and fails fast with a clear message; `.env.example` present.
- `lib/logger.ts` emits structured JSON lines and rejects `ip`/`userAgent` fields (unit tested).
- `lib/errors.ts` produces the single error body from `docs/api-contracts.md`.
- Drizzle schema in `lib/db/schema.ts` defines `site`, `daily_salt`, `event_raw`, `rollup_hourly`, `rollup_daily`, `rollup_page_daily`, `rollup_referrer_daily`, `rollup_country_daily`, `rollup_device_daily`, `rollup_watermark` exactly per `docs/architecture.md`; migration 0001 generated and applied cleanly to a fresh database via `npm run db:migrate`.
- `lib/privacy/salt.ts`: race-safe get-or-create of today's UTC salt; `destroyExpiredSalts()` deletes all rows before today. Unit/integration tested, including two concurrent get-or-create calls yielding one row.
- `lib/privacy/visitorHash.ts`: deterministic for identical inputs, different across salts, 32 hex chars. Unit tested.

### Manual test checklist
- `npm run dev` serves localhost:3000 without console errors (a placeholder page is fine).
- Start with a missing `DATABASE_URL`: the app refuses to start with one clear message, no stack trace spew.
- Run `npm run db:migrate` against a fresh database, then `\dt` in psql: all ten tables exist with the documented keys.
- Run migrations twice: second run is a no-op, no errors.

### Commits
- `chore(scaffold): init next app router with typescript and tailwind`
- `chore(tooling): add eslint prettier and vitest config`
- `feat(env): add validated fail-fast env access`
- `feat(logger): add structured logger with privacy field rejection`
- `feat(errors): add single api error format helper`
- `feat(db): add drizzle schema and initial migration for all tables`
- `feat(privacy): add daily salt lifecycle with destruction`
- `feat(privacy): add visitor hash derivation`

---

## Phase 2 — Data pipeline: ingestion and rollups

Goal: the complete pipeline works end to end from a curl'd beacon to correct rollup rows. All three differentiators land here: resilient ingestion (validation, origin check, rate limiting, graceful bad-input handling), the privacy engine live on the write path (geo then IP discard, salted hash, DNT), and the idempotent catch-up-safe aggregation job bridging write and read paths.

### Definition of done
- `POST /api/collect` implements the full contract in `docs/api-contracts.md`: 1 KB body cap (`413`), hand-rolled payload validation (`400`), site lookup + `Origin`/`Referer` host check (`403`), `DNT`/`Sec-GPC` header drop (`202`, nothing stored), bot UA drop (`202`, nothing stored), per-site token bucket (`429`), then device classification, optional GeoIP country, visitor hash, single `event_raw` insert, `202` with no body and no `Set-Cookie`.
- Path normalization strips query strings and fragments server-side regardless of what the client sent; referrer is reduced to an external hostname or null.
- `lib/ingest/device.ts` classifies desktop/mobile/tablet/unknown and detects common bots with a small in-house regex set (no UA-parser dependency); unit tested against a fixture list.
- `lib/ingest/geo.ts` reads the mmdb at `GEOIP_DB_PATH` once at startup; missing/corrupt file logs one warning and yields null countries — never a crash.
- A log-capture test proves a full ingest writes no IP and no raw UA to logs or DB.
- `POST /api/jobs/rollup` implements the job: bearer auth, advisory lock (second concurrent call gets `409`), recompute all hourly buckets from the watermark through the current partial hour, recompute daily tables (including exact `COUNT(DISTINCT visitor_hash)` per day) for touched days, upsert-overwrite only, advance watermark past hours older than the 5-minute grace, prune raw > 72 h on finalized days, destroy expired salts, cap 78 buckets per invocation, return the run-summary JSON.
- Integration tests (real Postgres) prove: running the job twice yields byte-identical rollups; a simulated multi-hour gap backfills correctly; a replayed raw set never changes recompute results; pruning does not alter rollups; sentinel mapping (`''` direct, `'ZZ'` unknown) is applied.

### Manual test checklist
- Insert a site row by hand (SQL), then curl a valid beacon with a matching `Origin`: `202`, one `event_raw` row with hash, device, country (or null), stripped path.
- Curl with a mismatched `Origin`: `403` and the standard error body; nothing stored.
- Curl malformed JSON, a missing `sid`, and a 2 KB body: `400`, `400`, `413`; nothing stored.
- Curl with `-H "DNT: 1"`: `202`, nothing stored.
- Loop 100 rapid beacons: some `429`s appear; wait a minute and beacons flow again.
- Curl the rollup route with the right bearer: `200` summary JSON; check rollup tables contain the expected counts. Curl it again immediately: identical rollup rows. Wrong bearer: `401`.
- Set the DB clock scenario by inserting raw rows across two UTC days (SQL), run the job, then confirm `daily_salt` only retains today and `rollup_daily` has both days.

### Commits
- `feat(ingest): add beacon validation and path normalization`
- `feat(ingest): add site origin check`
- `feat(ingest): add per-site rate limiting`
- `feat(ingest): add device classification and bot filtering`
- `feat(ingest): add optional local geoip country lookup`
- `feat(ingest): wire collect endpoint with hash and ip discard`
- `feat(rollup): add hourly and daily recompute sql`
- `feat(rollup): add job route with watermark catch-up and housekeeping`
- `test(rollup): cover idempotency gap backfill and pruning`

---

## Phase 3 — Admin auth

Goal: the single-admin login/session layer that will guard everything the dashboard does.

### Definition of done
- `lib/auth/password.ts` (scrypt verify + a `npm run hash-password` helper script that prints a hash for `.env`), `lib/auth/session.ts` (HMAC-signed cookie create/verify, 7-day expiry), `lib/auth/loginLimit.ts` (5/min in-memory).
- `/login` page per `docs/design.md`; `POST /api/auth/login` and `POST /api/auth/logout` per the contract.
- `middleware.ts` redirects unauthenticated page requests to `/login` and returns `401` on guarded APIs; tampered/expired cookies treated as absent.
- Placeholder `/dashboard` page exists solely to prove the guard.

### Manual test checklist
- Wrong password: `401`, one generic inline message, no hint which field failed.
- Six rapid failed logins: `429` on the sixth.
- Correct login: redirected to `/dashboard`; cookie is HttpOnly and SameSite=Lax in devtools.
- Edit the cookie value by one character: next request redirects to `/login`.
- Logout: cookie cleared; `/dashboard` redirects to `/login`; `curl /api/collect` still works with no cookie.

### Commits
- `feat(auth): add scrypt password verify and hash helper`
- `feat(auth): add signed session cookie`
- `feat(auth): add login and logout routes with attempt limiting`
- `feat(auth): guard dashboard routes with middleware`

---

## Phase 4 — Site management and tracking snippet

Goal: the owner can register a site in the UI, copy a working snippet, install it, and watch the site flip to verified on the first pageview.

### Definition of done
- `/api/sites` CRUD per the contract (list, create with domain/name validation and `409` on duplicates, get one, delete with cascade).
- `/sites` page: list with verified badges, register form with inline validation, delete with `ConfirmDialog`.
- `/sites/[id]` page: `SnippetBlock` showing the copy-ready tag built from `APP_URL` + public ID; `VerifyStatus` polls `GET /api/sites/{id}` every 5 s until `verifiedAt` is set (ingestion sets it on the first accepted event).
- `public/p.js`: reads `data-site`, sends the beacon on load and on `pushState`/`replaceState`/`popstate`, strips query/fragment client-side, uses `sendBeacon` with `fetch keepalive` fallback, no-ops entirely under DNT/GPC, never throws into the host page, sets no cookies/storage. A unit test fails if the file exceeds 1536 bytes.

### Manual test checklist
- Register a site with a valid domain: appears in the list as "waiting for first pageview".
- Register the same domain again: inline conflict message. Register `https://foo.com/x`: inline validation message.
- Serve a local test page with the snippet, open it: exactly one beacon in the network tab; site flips to verified within one poll.
- In the test page, navigate via `history.pushState` and back button: one beacon each; no beacon on re-render without URL change.
- Enable DNT in the browser: zero requests from the snippet.
- Kill the pulse server and load the test page: host page console shows no uncaught errors.
- Delete a site: confirm dialog, then gone; its rows are gone from `event_raw` and rollups (SQL check); other sites intact.

### Commits
- `feat(sites): add site crud api`
- `feat(sites): add site list and register ui`
- `feat(sites): add snippet block and verification polling`
- `feat(ingest): mark site verified on first accepted event`
- `feat(tracker): add pageview snippet with spa and dnt support`
- `test(tracker): enforce snippet byte budget`

---

## Phase 5 — Dashboard

Goal: the full read path — stats API over rollups and the dashboard UI with site/range pickers, tiles, chart, and breakdowns.

### Definition of done
- `/api/stats/summary`, `/api/stats/timeseries`, `/api/stats/breakdown` per the contract; params validated via `lib/stats/ranges.ts`; zero-filled buckets; sentinels mapped to display labels; a test asserts `lib/stats/queries.ts` never references `event_raw`.
- `/dashboard/[siteId]?range=` renders: `SitePicker`, `RangePicker` (Today/7d/30d/90d, state in the URL), two `StatTile`s (pageviews, unique visitors with the "per day, summed" note on multi-day ranges), `TimeseriesChart` (uPlot, hourly for Today, daily otherwise, crosshair tooltip, legend for the two series), and four `BreakdownList` panels (pages, referrers, countries, devices) with proportional bars.
- Loading skeletons per panel; per-panel empty states for a site with no data; per-panel friendly error state with retry on fetch failure.
- `/dashboard` with no sites shows an empty state linking to `/sites`.

### Manual test checklist
- Seed known events (curl loop), run the job, open the dashboard: tiles, chart, and breakdowns show exactly the seeded numbers.
- Switch ranges: Today shows hourly buckets, 7d/30d/90d show daily; every panel updates together; URL reflects the selection and reloading it restores the view.
- Switch sites: numbers change to the other site's data only.
- Brand-new site with zero events: empty states, not zero-height charts or NaNs.
- Stop Postgres, refresh: friendly per-panel error with retry, detailed server log, no stack trace in the browser.
- Unauthenticated curl of each stats endpoint: `401` with the standard error body.

### Commits
- `feat(stats): add range parsing and rollup query layer`
- `feat(stats): add summary timeseries and breakdown endpoints`
- `feat(dashboard): add shell with site and range pickers`
- `feat(dashboard): add stat tiles`
- `feat(dashboard): add timeseries chart`
- `feat(dashboard): add breakdown panels`
- `test(stats): cover ranges endpoints and rollup-only access`

---

## Phase 6 — Theming, polish, and e2e

Goal: production feel — themes, accessibility pass, error pages, and an automated end-to-end smoke of the whole loop.

### Definition of done
- Light/dark theme (system preference on first load, toggle persisted to `pulse-theme`, no flash); both themes meet the contrast targets in `docs/design.md`; chart colors switch with the theme.
- Accessibility pass: landmarks, one `h1` per page, labels on all inputs, visible focus rings, keyboard operability incl. pickers and dialogs, `prefers-reduced-motion` respected, chart data available as an accessible table alternative.
- Styled `404` and error pages; every remaining rough empty/loading state polished.
- Playwright smoke: log in, register a site, post beacons over HTTP, trigger the rollup route, assert the dashboard shows the non-zero numbers, log out.

### Manual test checklist
- Toggle theme; reload: persists; first-ever load matches OS preference; chart and bars legible in both themes.
- Keyboard-only: log in, switch site and range, open and cancel the delete dialog, log out.
- Visit an unknown route and an unknown site id: styled 404s.
- `npm run test:e2e` passes locally against a fresh database.

### Commits
- `feat(theme): add persisted light dark theme`
- `feat(a11y): add focus states labels and reduced motion handling`
- `feat(ui): add styled 404 and error pages`
- `test(e2e): add ingest-to-dashboard smoke test`

---

## Phase 7 — Custom events (promoted from Backlog)

Goal: named custom events with counts only (no properties). A tracked page can report a named event (e.g. a signup) through a tiny snippet API; ingestion validates and stores it on a dedicated raw table; the aggregation job rolls it up per (site, name, UTC day) with the same recompute-and-overwrite idempotency as pageviews; the dashboard shows a top-events panel that reads the rollup only. Arbitrary event properties stay out of scope — that remains a non-goal.

The write/read split, UTC-pinned aggregation, and privacy model are unchanged and non-negotiable: ingestion writes raw, dashboards read rollups only, and no IP is ever stored. Counts-only means custom events need no visitor hash at all.

### Definition of done
- The snippet exposes a documented `window.pulse('event', '<name>')` API that sends a `{ sid, n }` beacon over the same `sendBeacon`/`fetch keepalive` path; DNT/GPC, a missing `data-site`, or a missing script tag make it a safe no-op (it never throws into the host page); the file stays within its byte budget (or the budget is adjusted in the test and README with written justification).
- `POST /api/collect` accepts the custom-event beacon: validates the event name (1–64 chars, `[A-Za-z0-9._-]` allowlist), enforces the same origin check, DNT/GPC drop, per-site rate limit, and bot drop as pageviews, stores no IP and no visitor hash (counts only), and inserts exactly one `custom_event_raw` row. The first accepted event still verifies the site. Bad names return `400 invalid_payload` and store nothing.
- New tables via a forward migration: `custom_event_raw` (id, site_id, ts, name; ts index; 72-hour retention) and `rollup_custom_event_daily` (site_id, day, name, count; PK (site_id, day, name)).
- The rollup job recomputes `rollup_custom_event_daily` for every touched UTC day inside the same watermark-driven, UTC-pinned, recompute-and-overwrite pass, using `date_trunc(..., 'UTC')`-consistent explicit `timestamptz` day bounds; it prunes `custom_event_raw` past 72 hours. Running the job twice yields identical counts.
- `GET /api/stats/events?site=&range=&limit=` reads `rollup_custom_event_daily` only and returns top events by count for the range; a static test asserts the query references no raw table.
- The dashboard shows a "Custom events" panel (name + count, proportional bars) for the selected site and range, reading the rollup endpoint only, with the same skeleton/empty/error states as the other panels.

### Definition of done — tests
- Unit: event-name validation (good names, over-length, bad charset, non-string, empty); the snippet stays under budget and defines a safe no-op under DNT.
- Integration: a custom-event beacon stores exactly one row and no IP/hash; DNT/GPC and rate-limit drops store nothing; a bot UA is dropped; the job rolls up correct per-name counts and is byte-identical across two runs; pruning removes old custom raw without altering rollups.
- Static: the custom-events read layer references no raw table (mirrors the existing `event_raw` guard).

### Manual test checklist
- Load a page with the snippet, run `pulse('event','signup')` in the console: exactly one beacon to `/api/collect` with body `{ sid, n:"signup" }`, `202`, one `custom_event_raw` row, no `Set-Cookie`.
- `pulse('event','bad name!')` and a 100-char name: `400 invalid_payload`; nothing stored.
- With DNT enabled: `pulse('event','x')` sends nothing. Over the per-site rate limit: `429`, nothing stored.
- Curl the rollup route, then `GET /api/stats/events`: the seeded names appear with correct counts, ordered by count desc. Run the rollup again: identical counts.
- Open the dashboard: the Custom events panel lists names and counts for the selected range; switching range updates it; a site with no events shows the empty state.

### Commits
- `docs(phases): promote custom events backlog item to phase 7`
- `feat(db): add custom event raw and rollup tables`
- `feat(ingest): validate and store named custom event beacons`
- `feat(tracker): add custom event api to snippet`
- `feat(rollup): aggregate custom event daily counts`
- `feat(stats): add custom events endpoint over rollups`
- `feat(dashboard): add top custom events panel`
- `test(events): cover custom event ingest rollup and read path`
- `docs: document custom events in architecture api and memory`

---

## Phase 8: Goals and conversions (v2)

Goal: a site owner defines a goal for a site, either a target path (e.g. `/thank-you`)
or a named custom event that already exists in the repo. The aggregation job counts goal
completions per (site, goal, UTC day) into a dedicated rollup, and the dashboard shows a
goals panel listing each goal with its completions and a conversion rate over the selected
range.

The three invariants are unchanged and non-negotiable: the write/read split (ingestion
writes raw, dashboards read rollups only, `lib/stats/queries.ts` never touches a raw
table), the UTC-pinned recompute-and-overwrite aggregation, and the privacy model (no IP
ever stored; goals add no new personal-data path). Goals reuse the existing pageview and
custom-event plumbing rather than adding a new collection path: a `path` goal is matched
against `event_raw.path`, an `event` goal against `custom_event_raw.name`. No new beacon,
no snippet change.

### Conversion rate

For a range, a goal's `completions` is the summed daily completion count over the range,
and its `conversionRate` is `completions / visitors` where `visitors` is the range's summed
daily unique visitors, the exact figure `/api/stats/summary` already returns for the site.
The rate is returned as a fraction (0..n) and rendered as a percentage. Because completions
are total occurrences (a visitor may complete a repeatable goal more than once) and visitors
is unique-per-day summed, the rate is "completions per visitor" and can exceed 100% for
repeatable goals; the panel labels the denominator honestly, mirroring the existing "per
day, summed" caption. `visitors = 0` yields a rate of 0.

### Definition of done
- New tables via a forward Drizzle migration: `goal` (id, site_id, name, kind, match_value,
  created_at; `kind` in `path`|`event`; unique per (site_id, kind, match_value); site-leading
  index; `ON DELETE CASCADE` from site) and `rollup_goal_daily` (goal_id, site_id, day,
  completions; PK (goal_id, day); cascade from both goal and site). Applied migrations are
  never edited; this is a fix-forward migration.
- Goal validation is hand-rolled in `lib/goals/validate.ts` (no schema library): `kind`
  whitelist, `name` non-empty/max 80, and `match_value` validated by reusing the existing
  ingest validators: `normalizePath` for `path` goals, `EVENT_NAME_PATTERN` for `event`
  goals.
- Goal CRUD over `/api/goals` (session-guarded, re-checked in each handler, added to the
  middleware matcher): `GET ?site=` lists a site's goals, `POST` registers one (`409` on a
  duplicate target), `DELETE /api/goals/{id}` removes one (cascades its rollups). Standard
  error body throughout.
- The rollup job recomputes `rollup_goal_daily` for every touched UTC day inside the same
  watermark-driven, UTC-pinned, recompute-and-overwrite pass and day transaction as the
  pageview and custom-event rollups, using explicit `timestamptz` day bounds. A `path` goal
  counts matching `event_raw` rows; an `event` goal counts matching `custom_event_raw` rows.
  Running the job twice yields byte-identical `rollup_goal_daily` rows. No new raw table and
  no new prune step (goals derive from the two existing raw tables).
- `GET /api/stats/goals?site=&range=` reads `goal` and `rollup_goal_daily` only (plus
  `rollup_daily` for the visitors denominator) and returns each goal with its completions and
  conversion rate for the range; goals with zero completions still appear (left join). A
  static test asserts the goals read path references no raw table.
- The dashboard shows a "Goals" panel for the selected site and range: each goal with its
  name/target, completions, and conversion rate, with the same skeleton/empty/error states as
  the other panels. Managing goals (register/delete) is via the `/api/goals` API, documented
  in the README.

### Definition of done: tests
- Unit: goal validation (good path/event goals; bad kind; empty/over-length name; bad path;
  bad event name; non-string inputs); conversion-rate math (zero visitors gives 0, exact
  fraction, repeatable goal > 100%).
- Integration: goal CRUD (create, list by site, duplicate -> 409, delete -> 204 and cascade);
  the job counts a `path` goal by `event_raw.path` and an `event` goal by
  `custom_event_raw.name`, is byte-identical across two runs, and a goal registered after
  events still counts completions still inside the retention window; the stats endpoint
  returns completions and the correct conversion rate over a seeded range.
- Static: the goals read layer references no raw table (mirrors the `event_raw` guard).

### Manual test checklist
- `POST /api/goals` with `{ site, kind:"path", name:"Thank you", match:"/thank-you" }`:
  `201` with the goal; the same target again: `409`. `POST` with `kind:"event"` and an
  existing event name: `201`.
- Seed pageviews to `/thank-you` and `signup` events (curl loop), run the rollup route, then
  `GET /api/stats/goals?site=&range=today`: each goal shows the expected completions and a
  conversion rate equal to completions/visitors. Run the rollup again: identical completions.
- Register a bad goal (`kind:"path"` with `match:"no-slash"`, or `kind:"event"` with
  `match:"bad name!"`): `400 invalid_payload`, nothing stored.
- Open the dashboard Goals panel: goals list with completions and conversion rate; switching
  range updates them; a site with no goals shows the empty state.
- `DELETE /api/goals/{id}`: `204`; the goal and its `rollup_goal_daily` rows are gone; other
  goals untouched.
- Privacy spot-check: no IP or raw UA in any log line or table; the goals read path touches
  no raw table.

### Commits
- `docs(phases): add goals and conversions phase 8`
- `feat(db): add goal and goal rollup tables`
- `feat(goals): add goal validation and serialization`
- `feat(goals): add goal crud api`
- `feat(rollup): aggregate goal completions per utc day`
- `test(rollup): cover goal aggregation idempotency and matching`
- `feat(stats): add goals endpoint with conversion rate`
- `feat(dashboard): add goals panel`
- `docs: document goals in architecture api and readme`
- `docs(memory): log goals feature and architecture flag`

---

## Phase verification (run at the end of every phase)

- [ ] `npm run dev` runs; the phase's pages/routes work without console errors or warnings.
- [ ] `npm run build` succeeds; `npm run lint` clean.
- [ ] `npm run test` passes (and `npm run test:e2e` from Phase 6 on).
- [ ] Browser console and network tab clean; `/api/collect` responses set no cookies.
- [ ] Unhappy paths for everything added this phase:
  - [ ] Malformed, oversized, and unauthenticated requests get the documented status + standard error body, and store nothing.
  - [ ] Postgres down: friendly errors, detailed server logs, no stack traces to clients.
  - [ ] Duplicate submissions (double-click a form, replay a beacon, re-run the job): no corruption, no double-counting in rollups.
  - [ ] Refresh mid-action (mid-login, mid-delete, dashboard mid-load): consistent state after reload.
  - [ ] Empty states for zero sites, zero events, empty breakdowns.
  - [ ] Long inputs: a 512-char path, a long site name, a long referrer — stored/rendered without breaking layout.
- [ ] Privacy spot-check each phase from Phase 2 on: no IP or raw UA in any log line or table; `daily_salt` holds only today after a job run.
- [ ] `docs/memory.md` updated with what shipped and any non-obvious decision with its reason.

## Backlog

- _(empty — "Custom events (named events with counts, no properties)" was promoted to Phase 7 on 2026-07-23 and implemented.)_
