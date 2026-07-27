# Rules: pulse-analytics

Binding for anyone implementing this project. When a rule and a request conflict, flag it instead of silently diverging (see Boundaries).

## Conventions

### Libraries and patterns
- **Next.js App Router**, server components by default; `"use client"` only where interactivity or browser APIs require it (pickers, chart, forms, theme toggle, verify polling).
- **All database access is server-side** through Drizzle in `lib/`. No DB imports in client components; client components get data via the `/api/stats` and `/api/sites` contracts only.
- **The write/read split is a hard rule, not a preference:** ingestion code writes `event_raw` and reads `site`/`daily_salt`; dashboard/stats code reads rollup tables and `site` only. `lib/stats/queries.ts` must never reference `event_raw`. Only `lib/rollup/` touches both sides.
- Aggregation SQL lives in `lib/rollup/sql.ts` as hand-written statements; rollup writes are always `INSERT ... ON CONFLICT ... DO UPDATE` with recomputed values - never `UPDATE ... SET x = x + n`.
- Styling is **Tailwind** with the tokens from `docs/design.md` in `tailwind.config.ts`. No inline styles except truly dynamic values (bar widths in `BreakdownList`); no CSS-in-JS.
- Charts: **uPlot** for the time series only. Breakdown bars are plain HTML/CSS. No second chart library.
- Validation is hand-rolled in `lib/ingest/validate.ts` and `lib/stats/ranges.ts` with unit tests; no schema library without approval.
- Auth/crypto uses **node:crypto** (scrypt, HMAC, SHA-256, randomBytes). No auth framework.
- The snippet `public/p.js` is dependency-free plain JS, hand-written, with a byte-size test (<= 1536 bytes). It never imports anything and never touches cookies or storage.

### What to avoid
- Never store, log, or pass to a third party a visitor IP or raw user agent. The only permitted uses are the in-memory geo lookup, device classification, and hash input inside the collect handler. `lib/logger.ts` rejects `ip` and `userAgent` fields outright.
- No third-party requests from the tracked page (the snippet talks only to this app) and no third-party geo/UA APIs from the server.
- No querying `event_raw` from any dashboard, stats, or page code.
- No increments on rollup tables; recompute-and-overwrite only.
- No new config options, flags, or env vars for values that are constants today (retention, grace, rate limits live in code).
- No `any` in domain code; no unpinned dependency ranges; no dead code or commented-out blocks.

### Naming
- Components `PascalCase.tsx` (`StatTile.tsx`); non-component modules `camelCase.ts` (`visitorHash.ts`); route files follow Next conventions (`app/api/collect/route.ts`).
- Functions `camelCase`, descriptive verbs (`getTodaySalt`, `recomputeHour`, `classifyDevice`). Types/interfaces `PascalCase` (`Site`, `RollupPoint`, `BeaconPayload`).
- Constants `UPPER_SNAKE_CASE` (`RAW_RETENTION_HOURS`, `MAX_BEACON_BYTES`).
- Database tables and columns `snake_case`, singular table names (`site`, `event_raw`, `rollup_hourly`), defined in `lib/db/schema.ts`.
- The session cookie is `pulse_session`; the theme key is `pulse-theme`.

### Commit format
- Conventional Commits: `type(scope): subject`, imperative, no trailing period, <= 72 chars. Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `build`, `ci`.
- ONE commit per feature/task; never batch features. Follow the per-phase commit lists in `docs/phases.md` in order.

### Dependencies and migrations
- Pin exact versions (no `^`/`~`); commit `package-lock.json` with every dependency change. No blanket upgrades or "latest" without approval.
- Adding, removing, or upgrading any dependency requires owner approval first. The proposed set (`drizzle-orm`, `drizzle-kit`, `postgres`, `uplot`, `maxmind`) still requires sign-off before install.
- **Never modify the database schema directly.** Every schema change is a generated migration file in `drizzle/`, reviewed and committed. Applied migrations are never edited afterward - fix forward with a new migration.

## Error handling and logging

- Every external interaction handles failure explicitly: DB queries (connection refused, constraint violations, timeouts), the GeoIP file read (missing/corrupt file -> geo disabled with one warning log, not a crash), request body reads (aborted/oversized), and the snippet's own network send (silent failure; never an uncaught error on the host page).
- One error shape everywhere: `lib/errors.ts` produces `{ "error": { "code", "message" } }` per `docs/api-contracts.md`. Route handlers wrap their logic so unexpected exceptions become `500 internal` with detail logged server-side only.
- User-facing errors are short and friendly; logged errors carry the detail (`event`, `code`, `status`, `durationMs`, `siteId`, sanitized `path`). Never show a stack trace, SQL, or internal identifiers to a client.
- Structured logging from day one via `lib/logger.ts`: one JSON line per event (`ingest_accepted`, `ingest_rejected`, `rollup_run`, `login_failed`, ...). No stray `console.log`. The logger enforces the privacy redaction rule above.
- The rollup job logs one summary line per run (the same counts the route returns) and one error line per failed bucket; a failed bucket aborts that bucket's transaction, leaves the watermark untouched, and is retried on the next run.

## Security

- No hardcoded secrets. All sensitive values live in `.env` (see `.env.example`, kept current with dummy values). Nothing secret carries a `NEXT_PUBLIC_` prefix; this project needs no public env vars at all.
- Server-side validation on every input: beacon payloads (size, shape, path pattern), stats params (site, range, dimension, limit whitelists), site registration (hostname grammar, name length), login (shape + rate limit). Client-side validation is UX only.
- All SQL goes through Drizzle's parameterized queries or parameterized `sql` fragments - never string interpolation into SQL.
- Everything rendered from user-influenced data (paths, referrer hosts, site names) is rendered as text through React's default escaping; no `dangerouslySetInnerHTML` anywhere in this project.
- Route protection map: `/api/collect` public but origin-checked against the registered domain; `/api/jobs/rollup` requires the `CRON_SECRET` bearer; `/login` and `/api/auth/login` public with attempt limiting; everything else (`/dashboard*`, `/sites*`, `/api/sites*`, `/api/stats/*`, `/api/auth/logout`) requires a valid `pulse_session` cookie, enforced in `middleware.ts` and re-checked in each handler.
- Session cookie: HttpOnly, SameSite=Lax, Secure when `APP_URL` is https, HMAC-signed with `SESSION_SECRET`, 7-day expiry. Tampered or expired cookies are treated as absent.
- `POST /api/collect` responses never set cookies - a header regression here is a privacy bug, and a test guards it.

## Simplicity (YAGNI / KISS)

- Write the minimum that satisfies the current phase in `docs/phases.md`. No speculative features (no custom-event columns "for later", no multi-tenant hooks, no plugin points).
- Prefer the boring, direct solution over the clever or "scalable" one. In-memory rate limiting is correct for this deployment shape; do not build a Redis abstraction.
- No abstraction until three real, existing use cases demand it. No new wrapper classes, factories, managers, or utils files without owner approval first.
- No config options or parameters that are not needed today; operational constants stay in code until a real deployment proves they must vary.
- Before submitting, self-review: "can this be done in fewer lines without hurting readability?" If yes, rewrite first.
- If a solution exceeds ~150 lines, pause and justify it before continuing. (The rollup SQL module is the one expected exception; justify it when it lands.)
- Use built-ins over reimplementation: `node:crypto`, `URL`, `Intl` for formatting - and use libraries already approved rather than writing parallel helpers.

## Code style - no AI fingerprints

- NEVER mention Claude, AI, assistants, or any model/tool names in code, comments, commit messages, docstrings, the README, or anywhere else in the repository.
- No "Generated by...", "Co-authored-by: ..." or similar attribution lines in commits.
- Comment like an experienced human developer: sparse, only where logic is non-obvious (the watermark/grace reasoning deserves a comment; a getter does not).
- No emoji anywhere - code, comments, docs, commit messages.
- Commit messages short, imperative, conventional: `feat(ingest): drop beacons with dnt header`.
- Concise docstrings on non-obvious exported functions; no boilerplate.
- TypeScript strict mode; explicit return types on exported functions; follow ESLint + Prettier without hand-formatting around them.

## Boundaries - never do without asking the owner first

- Never delete or rewrite a file wholesale; make targeted edits and flag destructive changes first.
- Never modify `docs/PRD.md` or `docs/architecture.md` without flagging it first - they are the source of truth.
- Never add a dependency/library without approval (including dev dependencies and the proposed list above).
- If a task is ambiguous or two docs disagree, ask instead of assuming.
- On an error you cannot fix in 2 attempts, STOP and explain what was tried, the exact errors, and a proposed next step - no churning.
- Mid-phase requests not in `docs/PRD.md`: ask whether to (a) add to the current phase, (b) create a new phase, or (c) log to the Backlog in `docs/phases.md`. Never silently absorb scope.
