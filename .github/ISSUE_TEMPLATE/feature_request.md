---
name: Feature request
about: Suggest an improvement to pulse-analytics
title: "feat: "
labels: enhancement
---

## Problem

What are you trying to do that pulse-analytics does not support today? Describe
the underlying need, not just a proposed solution.

## Proposed solution

What you would like to see. If it affects data collection or aggregation, say
which path it touches (write, aggregation job, or read).

## Invariants it must respect

pulse-analytics keeps a few properties non-negotiable. Confirm your idea does
not break them (see CONTRIBUTING.md and SECURITY.md):

- [ ] The read path still reads only rollup tables, never raw events.
- [ ] No visitor IP or raw user agent is stored or logged.
- [ ] Rollups stay UTC-pinned and recompute-and-overwrite (idempotent).
- [ ] It adds no new runtime dependency (or explain why one is justified).

## Alternatives considered

Other approaches you weighed and why you set them aside.

## Additional context

Mockups, links, or related issues.
