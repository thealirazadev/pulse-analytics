# pulse-analytics

A self-hosted, privacy-first web analytics app. A site owner adds a tiny script snippet to their site; pulse collects pageviews without cookies or persistent identifiers, aggregates them into hourly and daily rollups, and shows a dashboard with pageviews, unique visitors, top pages, referrers, countries, and device classes over selectable time ranges. Unique visitors are counted with a daily-rotating salted hash, so nobody — including the operator — can link a visitor across days.

Status: planning — docs under review

## Planned stack

- Next.js (App Router) + TypeScript
- PostgreSQL with Drizzle ORM (migrations via drizzle-kit)
- Tailwind CSS
- uPlot for the time-series chart (proposed dependency, pending approval)
- Vitest for unit/component/integration tests, Playwright for an end-to-end smoke test
- ESLint + Prettier

See `docs/` for the PRD, architecture, API contracts, rules, phases, design, and testing docs.

## Install

TBD until implementation starts.

## Run

TBD until implementation starts.

## Test

TBD until implementation starts.

## License

MIT
