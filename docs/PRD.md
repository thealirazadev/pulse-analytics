# PRD: pulse-analytics

## What we're building

A self-hosted web analytics application a site owner runs on their own infrastructure. The owner registers a site, adds a small async script snippet to it, and gets a dashboard showing pageviews, unique visitors, top pages, referrers, countries, and device classes over selectable time ranges. Collection is cookieless: no cookies, no localStorage, no persistent identifiers, no fingerprinting beyond a daily-rotating salted hash that cannot link a visitor across days. The system is split into a cheap write path (raw events), a scheduled aggregation job, and a read path (rollup tables) - the dashboard never touches raw events.

## Target user

- Primary: a developer or small-business site owner who wants visitor numbers without shipping their audience's data to a third party and without a cookie consent banner. They run one Postgres database and one Node app, and they are the only person who logs in.
- Secondary: the visitor of a tracked site, who is never asked for consent because there is nothing to consent to - no cookie is set, no identifier persists, and their IP address is discarded seconds after arrival.

## Core features (prioritized)

### P0 - Ingestion endpoint (write path)
`POST /api/collect` accepts a beacon, validates the payload and the request `Origin` against a registered site, classifies the user agent into a device class, resolves the country from the IP, computes the visitor hash, discards the IP, and inserts one row into the raw event table. It rate-limits per site and handles malformed, oversized, and replayed beacons gracefully. Losing an event is acceptable; corrupting stored data is not.

### P0 - Privacy engine (cookieless unique visitors)
Unique visitors are counted with `visitor_hash = SHA-256(daily_salt || site_id || ip || user_agent)`. The salt is random per UTC day and old salts are destroyed, so hashes from different days cannot be joined. The IP exists in memory only for the geo lookup and the hash, is never stored, and is never logged. Do Not Track and Global Privacy Control are respected. This is a spec with testable criteria (below), not a slogan.

### P0 - Aggregation job and rollups (read path)
A scheduled job (cron hitting a protected route) recomputes hourly and daily rollup tables from raw events. The job is idempotent (recompute-and-overwrite, never increment) and catch-up safe: if runs are missed, the next run fills the gap from the raw retention window. It also prunes raw events past retention (72 hours) and destroys expired salts. Dashboards read rollups only.

### P0 - Embeddable tracking snippet
A single `<script>` tag serving `public/p.js`: under 1.5 KB, async, no dependencies. It sends a pageview on load and on SPA route changes (`pushState`/`replaceState`/`popstate`), strips query strings and fragments from the path, and sends nothing when DNT or GPC is enabled.

### P1 - Dashboard
Behind admin login: a site picker, a time-range picker (Today, Last 7 days, Last 30 days, Last 90 days), stat tiles for pageviews and unique visitors, a time-series chart, and top-ten breakdowns for pages, referrers, countries, and device classes. All data comes from the rollup tables through the stats API.

### P1 - Site management
Register a site (domain + name), get the snippet to copy, delete a site (with confirmation; removes its data). A site shows "waiting for first pageview" until its first valid event arrives, which marks it verified.

### P1 - Single-admin auth
One admin account with credentials in environment variables (email + scrypt password hash). Login sets a signed, HttpOnly session cookie used only for the dashboard and its APIs. The ingest endpoint never requires or reads this cookie.

### P2 - Theming and polish
Light and dark theme, loading skeletons, empty states, friendly error states, accessible keyboard navigation.

## Non-goals

- No funnels and no session replay.
- No custom events (logged to the Backlog in `docs/phases.md`; the schema is not pre-built for them).
- No multi-user accounts, teams, or roles - exactly one admin.
- No consent banner and no consent-management integration. This is deliberate, not an omission: the app sets no cookies and stores no persistent identifiers for visitors, no personal data leaves the owner's server, and the raw IP is discarded before anything is written. Honest caveat: the salted hash is derived from personal data (IP + UA), so collection is not "no processing" - it is short-lived, unlinkable-across-days processing. The privacy criteria below are what make that claim defensible; operators remain responsible for their own jurisdiction's rules.
- No realtime view; the dashboard is as fresh as the last rollup run (minutes, not seconds).
- No sampling, no data export, no email reports, no public/shared dashboards.
- No tracking of clicks, scroll depth, or outbound links - pageviews only.

## Success criteria per core feature

### Ingestion endpoint
- A valid beacon from a registered site's origin returns `202` and produces exactly one `event_raw` row with the expected path, device, country, and visitor hash.
- A request whose `Origin`/`Referer` host does not match a registered site's domain returns `403` and stores nothing.
- A body over 1 KB returns `413`; malformed JSON or missing/invalid fields returns `400`; neither stores anything.
- Requests over the per-site rate limit return `429` and store nothing; the limiter recovers on its own once traffic drops.
- A replayed (byte-identical) beacon is indistinguishable from a real repeat pageview and is bounded by the rate limit; it can inflate raw counts within that bound but can never make a rollup run produce different results for the same underlying raw data (see aggregation criteria).
- A beacon whose user agent classifies as a bot returns `202` and stores nothing.
- Query strings and fragments never appear in stored paths, even if the snippet is bypassed and they are sent directly.

### Privacy engine (each item is a test)
- No table has an IP column; the ingest code path has no write of the IP to the database or the logger. A log-capture test over a full ingest asserts the IP and raw UA appear nowhere.
- Two events with identical (site, IP, UA) on the same UTC day produce the same `visitor_hash`; the same inputs on the next UTC day produce a different hash.
- After the housekeeping step runs, no `daily_salt` row exists for any day before the current UTC day - old salts are destroyed, making cross-day linkage impossible even with database access.
- A beacon request carrying `DNT: 1` or `Sec-GPC: 1` returns `202` and stores nothing; the snippet itself sends no request when `navigator.doNotTrack === "1"` or `navigator.globalPrivacyControl` is truthy.
- The response sets no cookie and no header that could act as an identifier (verified in a test asserting the absence of `Set-Cookie` on `/api/collect`).
- Country resolution happens offline against a local GeoIP database; no visitor IP is ever sent to a third party. With no GeoIP database configured, country is stored as null and everything else works.

### Aggregation job and rollups
- Running the job twice in a row over the same data leaves every rollup row byte-identical (idempotent recompute-and-overwrite).
- If the job misses several runs, the next run backfills every complete hour since the watermark, and the resulting rollups equal what uninterrupted runs would have produced.
- The current partial hour and current day are recomputed on every run, so the dashboard shows today's data without ever double-counting.
- Raw events older than 72 hours (and belonging to finalized days) are pruned by the job; rollups remain intact afterward.
- The dashboard's query layer imports only rollup tables - a test (and code review) asserts no dashboard or stats code references `event_raw`.
- Hourly rollup `visitors` is the exact distinct-hash count for that hour; daily `visitors` is the exact distinct-hash count for that UTC day. Multi-day range totals are the sum of daily uniques and are documented in the UI as such (cross-day dedup is impossible by design - that is the privacy guarantee, not a bug).

### Tracking snippet
- The built file `public/p.js` is at most 1536 bytes (enforced by a unit test that fails the build budget).
- On a plain page load, exactly one beacon is sent with the path (no query string, no fragment).
- In an SPA, `history.pushState`, `history.replaceState`, and back/forward navigation each produce exactly one beacon; re-rendering without a URL change produces none.
- With DNT or GPC enabled in the browser, zero network requests are made by the snippet.
- The snippet never sets cookies, never touches `localStorage`/`sessionStorage`, and its failure (blocked, offline, endpoint down) never throws an uncaught error on the host page.

### Dashboard
- For a seeded, known dataset, the stat tiles, time series, and every breakdown show exactly the numbers the rollups contain.
- Switching the time range or site updates every panel consistently; Today renders hourly buckets, the other ranges render daily buckets.
- A site with no data shows an empty state (not zeros in a broken chart); API failure shows a friendly error state with retry; loading shows skeletons.
- No dashboard request goes out without a valid session cookie; unauthenticated requests to `/api/stats/*` and `/api/sites*` return `401`.

### Site management
- Registering a valid domain creates the site and shows a copy-ready snippet containing its public site ID.
- A duplicate or malformed domain is rejected with an inline message and the standard error body.
- The site shows "waiting for first pageview" until the first valid event, then flips to verified without a manual step.
- Deleting a site asks for confirmation and removes the site with its events and rollups; other sites' data is untouched.

### Single-admin auth
- Correct env credentials log in and set an HttpOnly, SameSite=Lax, signed session cookie; wrong credentials return `401` with no hint which field was wrong.
- Login attempts are rate-limited; tampered or expired cookies are rejected and redirect to login.
- Logout clears the session; the ingest endpoint works with no cookie at all.
