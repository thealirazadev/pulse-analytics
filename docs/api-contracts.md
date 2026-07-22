# API Contracts: pulse-analytics

This contract is agreed before any frontend or backend code is written. All routes live under the app's own origin (`APP_URL`). Three auth models exist and never mix:

- **Origin-checked, public** — `/api/collect`. No cookie, no token; validated against the registered site's domain.
- **Session cookie** — everything the dashboard uses (`/api/auth/logout`, `/api/sites*`, `/api/stats/*`). Signed HttpOnly cookie `pulse_session`; unauthenticated requests get `401`.
- **Bearer secret** — `/api/jobs/rollup` requires `Authorization: Bearer $CRON_SECRET`.

## Error response format (used everywhere)

Every non-2xx response body is exactly:

```json
{ "error": { "code": "invalid_payload", "message": "Path must start with '/'." } }
```

`code` is a stable machine-readable snake_case string; `message` is short, human-readable, and never contains stack traces, SQL, IPs, or secrets. Codes used: `invalid_payload`, `payload_too_large`, `unknown_site`, `origin_mismatch`, `rate_limited`, `invalid_credentials`, `unauthorized`, `not_found`, `conflict`, `invalid_range`, `internal`. Unexpected failures return `500` with `code: "internal"` and a generic message; detail goes to the server log only.

---

## Ingestion

### POST /api/collect

Public, origin-checked. Called by the snippet via `sendBeacon`/`fetch keepalive`. The body is JSON sent with `Content-Type: text/plain` (a CORS "simple request" — no preflight; the handler parses the text as JSON regardless of content type). Body limit: 1024 bytes.

Request body:

```json
{ "sid": "pk_x8f2ab31", "p": "/pricing", "r": "https://news.ycombinator.com/item?id=41" }
```

| Field | Required | Rules |
| --- | --- | --- |
| `sid` | yes | Registered site public ID, `^pk_[a-z0-9]{8}$` |
| `p` | yes | Path beginning with `/`, max 512 chars after server-side stripping of query string and fragment |
| `r` | no | Referrer URL; server keeps the hostname only, drops it if it equals the site's own domain, null if unparsable |

**Custom event beacon.** A named custom event is the same endpoint with a different body — `{ "sid": "pk_x8f2ab31", "n": "signup" }`, where `n` replaces `p`/`r`. `n` must match `^[A-Za-z0-9._-]{1,64}$` (counts only, no properties). Every guard (origin, DNT/GPC drop, per-site rate limit, bot drop) and every response in the table below is identical to a pageview; a bad `n` returns `400 invalid_payload`. The accepted row is written to `custom_event_raw` with no device, country, IP, or visitor hash — the IP is never read for custom events. Emitted from the snippet with `pulse('event', 'signup')`.

Server-derived (never sent by the client): timestamp, device class (from the `User-Agent` header), country (local GeoIP on the connection IP), visitor hash. The IP is discarded after derivation.

Responses (success responses have no body and never set cookies):

| Status | When | Stored? |
| --- | --- | --- |
| `202` | Accepted | yes |
| `202` | Dropped silently: bot UA, or `DNT: 1` / `Sec-GPC: 1` header | no |
| `400` `invalid_payload` | Malformed JSON, missing/invalid fields | no |
| `403` `unknown_site` / `origin_mismatch` | `sid` not registered, or `Origin`/`Referer` host does not match the site's domain | no |
| `413` `payload_too_large` | Body over 1024 bytes | no |
| `429` `rate_limited` | Per-site token bucket exhausted (sustained 10 req/s, burst 50 — constants in code) | no |

Replay note: a byte-identical replayed beacon re-derives the hash from the *replaying* connection's IP/UA at receipt time, so third-party replays look like different visitors and same-source replays are indistinguishable from real repeat pageviews. No event-level dedup is attempted; the rate limit bounds inflation of raw counts, and rollup integrity is unaffected (aggregation recomputes deterministically from whatever raw rows exist).

---

## Auth

### POST /api/auth/login

Public, rate-limited (5 attempts/min per source; the limiter key is held in memory only and never stored).

```json
{ "email": "admin@example.com", "password": "correct horse battery staple" }
```

- `204` — credentials match `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (scrypt). Sets `pulse_session`: HttpOnly, SameSite=Lax, Path=/, Secure in production, HMAC-signed payload `{ sub, exp }`, 7-day expiry.
- `401` `invalid_credentials` — either field wrong (response does not say which).
- `429` `rate_limited`.

### POST /api/auth/logout

Session cookie required. `204`; clears the cookie. (`401` if absent/invalid.)

---

## Sites

All require the session cookie (`401` otherwise). Sites are addressed by `public_id`.

### GET /api/sites

`200`:

```json
{ "sites": [ { "id": "pk_x8f2ab31", "domain": "example.com", "name": "Example",
               "createdAt": "2026-07-18T09:00:00Z", "verifiedAt": null } ] }
```

### POST /api/sites

```json
{ "domain": "example.com", "name": "Example" }
```

- Domain is lowercased and must be a bare hostname (no scheme/port/path); `name` non-empty, max 80 chars.
- `201` — the site object (same shape as above).
- `400` `invalid_payload` — bad domain or name.
- `409` `conflict` — domain already registered.

### GET /api/sites/{id}

`200` — the site object. Used by the UI to poll `verifiedAt` ("waiting for first pageview" flips when ingestion sets it). `404` `not_found` for an unknown id.

### DELETE /api/sites/{id}

`204` — deletes the site; events and rollups go with it via `ON DELETE CASCADE`. `404` `not_found` otherwise. The UI confirms before calling.

---

## Stats (dashboard data)

Session cookie required. Common query params, validated in `lib/stats/ranges.ts`:

| Param | Values | Notes |
| --- | --- | --- |
| `site` | site public ID | `404` `not_found` if unknown |
| `range` | `today` \| `7d` \| `30d` \| `90d` | `today` = current UTC day, hourly interval; others = last N UTC days including today, daily interval. Anything else: `400` `invalid_range` |

All stats read rollup tables only — never `event_raw`.

### GET /api/stats/summary?site=pk_x8f2ab31&range=7d

`200`:

```json
{ "range": { "from": "2026-07-12", "to": "2026-07-18", "interval": "day" },
  "pageviews": 12840, "visitors": 3211 }
```

`visitors` for multi-day ranges is the sum of daily uniques (documented overcount; see architecture). For `today` it is the exact daily figure so far.

### GET /api/stats/timeseries?site=pk_x8f2ab31&range=today

`200`:

```json
{ "interval": "hour",
  "points": [ { "bucket": "2026-07-18T00:00:00Z", "pageviews": 120, "visitors": 84 },
              { "bucket": "2026-07-18T01:00:00Z", "pageviews": 95,  "visitors": 61 } ] }
```

Buckets with no data are included with zeros so charts render continuous axes. `interval` is `"hour"` for `today`, `"day"` otherwise (daily `bucket` is a date string).

### GET /api/stats/breakdown?site=pk_x8f2ab31&range=30d&dimension=page&limit=10

| Param | Values |
| --- | --- |
| `dimension` | `page` \| `referrer` \| `country` \| `device` |
| `limit` | 1–50, default 10 |

`200`:

```json
{ "dimension": "page",
  "rows": [ { "key": "/pricing", "pageviews": 3100, "visitors": 2010 },
            { "key": "/",        "pageviews": 2400, "visitors": 1800 } ] }
```

Rows are ordered by pageviews desc. Sentinels are translated before the response: referrer `''` becomes `"(direct)"`, country `'ZZ'` becomes `"Unknown"`. `400` `invalid_range` for a bad dimension or limit.

### GET /api/stats/events?site=pk_x8f2ab31&range=30d&limit=10

| Param | Values |
| --- | --- |
| `limit` | 1–50, default 10 |

`200`:

```json
{ "rows": [ { "name": "signup", "count": 312 },
            { "name": "purchase", "count": 88 } ] }
```

Top named custom events by summed `count` over the range, ordered by count desc. Reads `rollup_custom_event_daily` only (never a raw table). `400` `invalid_range` for a bad range or limit; `404` `not_found` for an unknown site.

---

## Jobs

### POST /api/jobs/rollup

`Authorization: Bearer $CRON_SECRET`. Intended caller: cron via curl, every 5 minutes. Safe to call at any frequency — the job is idempotent (recompute-and-overwrite) and self-limiting (max 78 hourly buckets per invocation; call again to continue a large backfill).

- `200`:

```json
{ "hoursProcessed": 2, "daysRecomputed": 1, "rawPruned": 1840,
  "saltsDestroyed": 1, "finalizedThrough": "2026-07-18T08:00:00Z" }
```

`rawPruned` is the total rows removed from both raw tables (`event_raw` and `custom_event_raw`), which share the 72-hour retention window. `daysRecomputed` covers the pageview and custom-event daily rollups together.

- `401` `unauthorized` — missing/wrong bearer token.
- `409` `conflict` — a previous run is still in progress (advisory lock held); the caller just waits for the next tick.

Any other method on any route above returns `405` with the standard error body.
