# Frontend Modernization: History

## Current ownership

History is entering gradual frontend modernization after Tracker Lists.

- `DATA.history` remains authoritative legacy tracker state.
- `static/js/history-activity.js` remains the live History renderer, including grouping, cards, relative timestamps, and Load More behavior.
- `app-router.js` remains the sole browser History API owner.
- History mutations, watched/episode tracking, save behavior, pending-save behavior, APIs, Flask routes, and database schema are unchanged.

## Read-only state boundary

`static/js/history-state-bridge.js` exposes `window.TVTrackerHistoryStateBridge` with `ownership: "legacy-read-only"` and a `snapshot()` method.

The bridge is intentionally DOM-free, network-free, persistence-free, and navigation-free. It reads the current legacy history and shows, mirrors the existing History visibility and sort rules, and returns detached frozen episode/movie summaries.

`frontend/src/history/contracts.ts` defines the typed History snapshot contract. `frontend/src/history/legacyHistoryState.ts` validates and normalizes the bridge for future Vue ownership; it is not mounted by `frontend/src/main.ts` in this slice.

## Invariants

- The legacy History renderer remains the live `#show-list` writer for `/app/history`.
- The read-only bridge must not mutate `DATA.history`.
- Future Vue History work must preserve episode/movie ordering, future-episode suppression, routes, artwork fallbacks, empty state, grouping, relative timestamps, and Load More behavior before legacy ownership is removed.
- Watched/episode tracking remains a separate later roadmap phase; this History boundary does not change tracker truth or write semantics.

## Next slice

After exact-head CI and production acceptance, move History rendering to Vue behind this boundary while retaining the existing authoritative data and router ownership. Physical legacy removal remains deferred to the later cleanup phase.
