<!--
Keep PRs small and focused on one change. See CONTRIBUTING.md.
-->

## What and why

Describe the change and the problem it solves. Link any related issue
(`Closes #123`).

## Which path does it touch

- [ ] Write path - `/api/collect`
- [ ] Aggregation job - `/api/jobs/rollup`
- [ ] Read path - dashboard / `/api/stats/*`
- [ ] Auth / session
- [ ] Site management / snippet
- [ ] Docs / tooling only

## Checks

All four run in CI and must be green. I ran them locally:

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`

## Tests

- [ ] I added or extended tests for the behavior I changed.
- [ ] A bug fix includes a test that fails before the fix.
- [ ] N/A - docs or tooling only.

## Invariants preserved

- [ ] The read path still reads only rollup tables, never raw events
      (`tests/unit/statsRollupOnly.test.ts` stays green).
- [ ] No visitor IP or raw user agent is stored or logged.
- [ ] Rollups stay UTC-pinned and recompute-and-overwrite (idempotent).
- [ ] A schema change ships as a new migration; no applied migration was edited.
- [ ] No new runtime dependency (or it is justified in the description).

## Notes for reviewers

Anything worth calling out: trade-offs, follow-ups, or areas you want a closer
look at.
