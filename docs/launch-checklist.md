# Launch checklist: pulse-analytics

Work top to bottom before running this in production. Fill in near the end of implementation; nothing is checked until verified against a production-like build.

## Environment and configuration
- [ ] All production env vars set on the host: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `CRON_SECRET`, `APP_URL` (and `GEOIP_DB_PATH` if geo is wanted).
- [ ] `SESSION_SECRET` and `CRON_SECRET` are fresh random values, not the dev ones.
- [ ] `APP_URL` is the real https origin; session cookie is Secure in production.
- [ ] `.env` files with real values are not committed; `.env.example` carries dummies only and matches the current variable set.
- [ ] All migrations applied to the production database; `db:migrate` is part of the deploy procedure.

## Scheduler and pipeline
- [ ] Cron (or equivalent) calls `POST /api/jobs/rollup` every 5 minutes with the production `CRON_SECRET`; verified by the run-summary log lines.
- [ ] Job observed catching up after a deliberate pause (stop cron for an hour, restart, confirm backfill).
- [ ] Raw pruning confirmed: no `event_raw` rows older than 72 h after a day of operation.
- [ ] Salt destruction confirmed in production: `daily_salt` holds only the current UTC day.
- [ ] GeoIP database present and readable (or consciously absent, with countries showing "Unknown").

## Privacy verification (production build)
- [ ] `/api/collect` responses set no cookies (checked in devtools/curl).
- [ ] No IP or raw user agent appears in production logs during live traffic.
- [ ] DNT/GPC browser check against the live snippet: zero requests sent.
- [ ] Tracked page sets no cookies/storage attributable to pulse.

## Security
- [ ] Debug/verbose logging off; structured logs only.
- [ ] Login attempt limiting works against the production instance.
- [ ] Guarded routes return `401`/redirect without a session (spot-check `/api/stats/*`, `/api/sites`, `/dashboard`).
- [ ] Rollup route rejects a wrong bearer token.
- [ ] No stack traces or SQL in any client-facing error (spot-check with Postgres stopped).

## Snippet
- [ ] `p.js` served with long-lived cache headers and correct content type.
- [ ] Snippet verified on a real site: pageview + SPA navigation beacons arrive; size budget still holds.
- [ ] Host page shows no console errors when pulse is unreachable.

## UX states
- [ ] Loading skeletons, empty states, and error-with-retry present on every dashboard panel.
- [ ] Styled 404 and error pages exist and render in production.
- [ ] Multi-day visitors figure carries its "per day, summed" caption.
- [ ] Mobile layout checked (filter row, tiles, chart, breakdown stacking, 44 px touch targets).
- [ ] Light and dark themes checked on real devices; chart legible in both.

## Final
- [ ] Error tracking / log destination for production decided and connected (or explicitly deferred with a note here).
- [ ] Database backup schedule for the production Postgres in place.
- [ ] `docs/memory.md` current; all phase verification checklists in `docs/phases.md` complete.
