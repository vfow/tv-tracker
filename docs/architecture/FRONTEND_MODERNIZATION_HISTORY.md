# Frontend Modernization: History

## Current ownership

History now uses Vue-native structured composition while preserving established tracker truth and display semantics.

- `DATA.history` remains authoritative tracker state.
- `static/js/history-state-bridge.js` owns the read-only structured History snapshot and view-model projection. It preserves visibility, ordering, grouping, routes, artwork fallbacks, relative-time values, empty-state data, and tracked metadata fallbacks without writing DOM or mutating tracker state.
- `static/js/history-vue-bridge.js` owns History renderer activation and UI pagination state, lazy-loads the existing Vue entry, and passes a structured History view model to the attached Vue owner.
- `frontend/src/history/HistorySurface.vue` is the sole live History composition/DOM renderer for `/app/history`.
- `static/js/history-activity.js` contains no renderer or pagination logic; it remains only as a temporary parser-blocking compatibility placeholder until the final legacy file-removal sweep removes the script tag and file together.
- `app-router.js` remains the sole browser History API owner.
- History mutations, watched/episode tracking, save behavior, pending-save behavior, APIs, Flask routes, and database schema are unchanged.

## Read-only state boundary

`static/js/history-state-bridge.js` exposes `window.TVTrackerHistoryStateBridge` with `ownership: "legacy-read-only"`, `snapshot()`, and `viewModel(visibleLimit)`.

The bridge is intentionally DOM-free, network-free, persistence-free, and navigation-free. It reads current History and show/movie metadata, mirrors the existing future-episode visibility and ordering rules, and returns detached frozen structures. `viewModel()` uses the established grouping, route, artwork, episode metadata, and relative-time helpers so Vue receives the same display semantics without serialized HTML.

`frontend/src/history/contracts.ts` defines both the typed read-only snapshot and the native History renderer/view-model contracts. `frontend/src/history/legacyHistoryState.ts` continues to validate the snapshot boundary independently of live rendering.

## Vue rendering boundary

`static/js/history-vue-bridge.js` no longer captures a legacy `renderHistory`, stages a temporary `#show-list`, calls a legacy HTML composer, or hands serialized HTML to a generic Vue shell. It loads the existing Vite entry when required, receives its History owner via `attachVueOwner`, obtains the current structured model from `TVTrackerHistoryStateBridge.viewModel(visibleLimit)`, and renders that model directly.

Pagination is UI state owned by the History Vue bridge. The first page remains 40 entries and each Load More action adds the existing 40-entry batch size, then requests a new structured view model and rerenders through the same Vue owner. No History data is mutated by pagination.

## Invariants

- No History runtime path stages or serializes legacy HTML.
- Vue is the sole final live History DOM writer.
- `DATA.history` remains authoritative and is never mutated by the state bridge or renderer.
- Episode/movie ordering, future-episode suppression, routes, artwork fallbacks, empty state, grouping, relative timestamps, and 40-entry Load More behavior remain unchanged.
- `app-router.js` remains the sole browser History API owner.
- Watched/episode tracking remains separate domain ownership; this History migration does not change tracker truth or write semantics.

## Completion gate

Vue-native History composition is complete only after the exact PR head passes the full repository CI, is merged from the current production `main`, and the resulting production release passes regression, provenance, SSH deployment, restart, and public health verification.
