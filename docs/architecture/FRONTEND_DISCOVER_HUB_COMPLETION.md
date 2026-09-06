# Discover hub ownership completion

Baseline: `476a1e93a163926f243af35592879651b66ec9d8` (merged migration CLI fix #133).

## Change

The existing Vue Discover component already renders hub content. The remaining
legacy stability gate still wrote loading HTML into its mount root, and unused
hub composers remained in `ui.js`. The bridge now owns the gate and hands loading
models to that same Vue owner. The replaced composers and event binders are removed.

Asset failures use the existing shared runtime failure surface. Late attachment,
failure, and render calls cannot overwrite Search or another route. A shared slow
Trending request settles the current gate even when a refresh follows a timeout.
A timeout while away is honored on return instead of leaving the gate stuck.

Hub card routes, modified-click behavior, genre tabs, collection navigation,
provider state, Trending requests/cache, and tracker semantics remain with their
established owners. Public registration remains closed.

## Verification

- TypeScript check and Vue/Tailwind builds pass with no committed asset drift.
- All 76 JavaScript regression files pass; the expanded stability tests additionally
  exercise overlapping refresh, hidden timeout, and return navigation.
- All 49 Python source-contract tests pass locally.
- Local full Python regression is unavailable: this runtime lacks Flask, Argon2,
  and psycopg; dependency installation cannot resolve the pinned Flask package.
  Exact-head GitHub CI must supply the full backend/PostgreSQL/browser gate before merge.
- Deployment/restart, merged-SHA health, and authenticated production acceptance
  remain release gates; local checks alone do not establish production acceptance.

## Remaining ownership

Browse, genre, collections, and person page composition still lives in `ui.js`.
Their active shared card/filter/event helpers are retained. Migrate each surface
through a separate tested ownership change, then remove only proven-dead callers.
Do not repeat the already-completed Watchlist, History, Movie/Show Details, or
Upcoming native composition. Final whole-system/torture and responsive acceptance
at 320px, 375px, tablet, and desktop remain required for roadmap completion.
