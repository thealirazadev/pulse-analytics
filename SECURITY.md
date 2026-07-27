# Security Policy

## Supported versions

pulse-analytics is self-hosted and released from `main`. Security fixes land on
`main`; there are no long-lived release branches to backport to. Run the latest
`main` to stay current.

## Reporting a vulnerability

Please report security issues privately - do not open a public issue, and do
not include a working exploit in any public discussion.

Use GitHub's private reporting form:
[Report a vulnerability](https://github.com/thealirazadev/pulse-analytics/security/advisories/new)

Please include:

- what the issue is and which component it affects (ingest endpoint, rollup
  job, auth/session, or the dashboard read path);
- the steps or request sequence needed to reproduce it;
- the impact you believe it has.

You can expect an acknowledgement within 7 days and a status update within 30
days. If a fix is warranted, the advisory is published once the fix is on
`main`. Reporters are credited unless they ask not to be.

## Scope

In scope:

- authentication and session handling (`lib/auth/`, `middleware.ts`);
- the public ingest endpoint (`/api/collect`) - validation, origin checking,
  and rate limiting;
- the rollup job endpoint (`/api/jobs/rollup`) and its bearer authorization;
- SQL injection or data leakage in any query;
- anything that causes a visitor IP, raw user agent, or a cross-day visitor
  identifier to be stored or logged (see "Privacy invariants" below).

Out of scope:

- issues that require an attacker to already control the server, the database,
  or the operator's `.env`;
- missing hardening on a deployment that ignores the documented deployment
  assumptions (see below);
- inflating your own site's analytics numbers. The write path is public and
  origin-checked, which stops another site from pointing a snippet at your site
  id, but a site's public id and domain are by nature public, so a determined
  non-browser client can submit events for that site. This is inherent to any
  public analytics pixel and is a known, accepted limitation;
- rate-limiter resets on process restart. The ingest and login limiters are
  in-memory by design for a single-instance self-hosted deployment.

## Privacy invariants

These are treated as security properties, and a regression in any of them is a
vulnerability worth reporting:

- a visitor IP is used only in memory for the geo lookup and the daily salted
  hash, and is never persisted or logged;
- `event_raw` stores no IP, no raw user agent, no full referrer URL, and no
  cross-day identifier;
- `POST /api/collect` never sets a cookie and writes nothing to the visitor's
  browser;
- salts for days before the current UTC day are destroyed, so past-day visitor
  hashes cannot be recomputed or verified by anyone, the operator included;
- Do Not Track and Global Privacy Control are honored by both the snippet and
  the ingest endpoint.

## Deployment assumptions

pulse-analytics expects the operator to:

- keep `SESSION_SECRET`, `CRON_SECRET`, and `ADMIN_PASSWORD_HASH` secret, and
  generate them with a CSPRNG (`openssl rand -hex 32`);
- serve the app over HTTPS in production, so `APP_URL` is `https://` and the
  session cookie is issued with `Secure`;
- run behind a reverse proxy that sets a trustworthy `X-Forwarded-For`. The
  client IP is read from that header; a proxy that passes through a
  client-supplied value lets a caller influence the geo lookup, the visitor
  hash, and the login attempt limiter;
- run the rollup cron. Salt destruction and raw-event pruning are part of that
  job, so a stopped scheduler means old salts and raw events are retained
  longer than intended.
