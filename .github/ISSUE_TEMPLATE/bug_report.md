---
name: Bug report
about: Report a defect in pulse-analytics
title: "bug: "
labels: bug
---

<!--
Do NOT report security or privacy issues here. Anything touching auth, the
ingest endpoint, the rollup job, or a privacy invariant (a stored/logged IP,
raw user agent, or cross-day identifier) goes through SECURITY.md instead.
-->

## What happened

A clear description of the bug and what you expected instead.

## Which path

- [ ] Write path - `/api/collect` (beacon ingestion)
- [ ] Aggregation job - `/api/jobs/rollup`
- [ ] Read path - dashboard / `/api/stats/*`
- [ ] Auth / session
- [ ] Site management / snippet
- [ ] Other / not sure

## Steps to reproduce

1.
2.
3.

## Expected vs actual

- Expected:
- Actual:

## Logs

Relevant structured log lines or the failing test output. Remove anything
sensitive first (the app never logs IPs or raw user agents, but your `.env` and
DB URLs must stay out).

```
paste logs here
```

## Environment

- pulse-analytics commit:
- Node version (`node -v`):
- PostgreSQL version:
- How you run it (dev / production build / Docker):
- Browser (if a dashboard bug):

## Checklist

- [ ] I confirmed this reproduces on the latest `main`.
- [ ] This is not a security or privacy issue (those go through SECURITY.md).
