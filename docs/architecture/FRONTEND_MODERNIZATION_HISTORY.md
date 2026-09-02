# Frontend Modernization: History

## Current ownership

History uses Vue-native structured composition while preserving established tracker truth and display semantics. That ownership was merged in PR #102 (`24da376`) and is present in the deployed `main` baseline `5ec823a`.

- `DATA.history` remains authoritative tracker state.
- `static/js/history-state-bridge.js` owns the read-only structured History snapshot and view-model projection. It preserves visibility, ordering, grouping, routes, artwork fallbacks, relative-time values, empty-state data, and tracked metadata fallbacks without writing DOM or mutating tracker state.
- `static/js/history-vue-bridge.js` owns History renderer activation and UI pagination state, lazy-loads the existing Vue entry, and passes a structured History view model to the attached Vue owner.
- `frontend/src/history/HistorySurface.vue` is the sole live History composition/DOM renderer for `/app/history`.
- On this branch, the obsolete `static/js/history-activity.js` compatibility placeholder and its parser-blocking script tag are removed, and the History skeleton/loading state moves to the structured Vue boundary with the existing six-mobile/eight-desktop layout and accessible status semantics. The deployed baseline still contained that non-owning placeholder; its deletion remains pending branch verification.
- `app-router.js` remains the sole browser History API owner.
- History mutations, watched/episode tracking, save behavior, pending-save behavior, APIs, Flask routes, and database schema are unchanged.

## Read-only state boundary

`static/js/history-state-bridge.js` exposes `window.TVTrackerHistoryStateBridge` with `ownership: "legacy-read-only"`, `snapshot()`, and `viewModel(visibleLimit)`.

The bridge is intentionally DOM-free, network-free, persistence-free, and navigation-free. It reads current History and show/movie metadata, mirrors the existing future-episode visibility and ordering rules, and returns detached frozen structures. `viewModel()` uses the established grouping, route, artwork, episode metadata, and relative-time helpers so Vue receives the same display semantics without serialized HTML.

`frontend/src/history/contracts.ts` defines both the typed read-only snapshot and the native History renderer/view-model contracts. `frontend/src/history/legacyHistoryState.ts` continues to validate the snapshot boundary independently of live rendering.

## Vue rendering boundary

`static/js/history-vue-bridge.js` no longer captures a legacy `renderHistory`, stages a temporary `#show-list`, calls a legacy HTML composer, or hands serialized HTML to a generic Vue shell. It loads the existing Vite entry when required, receives its History owner via `attachVueOwner`, obtains the current structured model from `TVTrackerHistoryStateBridge.viewModel(visibleLimit)`, and passes loading, empty, error, and ready states to Vue without writing History DOM.

History asset/manifest failures use the shared `TVTrackerClientRuntime.renderSurfaceFailure()` shell boundary so the server skeleton cannot remain indefinitely. Model projection failures remain a structured Vue error state. Asset failures use `data-tvtracker-history-vue-asset-load-failed` / `vue_history_asset_load_failed`, while projection failures use `data-tvtracker-history-model-projection-failed` / `history_model_projection_failed`.

Pagination is UI state owned by the History Vue bridge. The first page remains 40 entries and each Load More action adds the existing 40-entry batch size, then requests a new structured view model and rerenders through the same Vue owner. No History data is mutated by pagination.

## Invariants

- No History runtime path stages or serializes legacy HTML.
- Vue is the sole final live History DOM writer.
- `DATA.history` remains authoritative and is never mutated by the state bridge or renderer.
- Episode/movie ordering, future-episode suppression, routes, artwork fallbacks, empty state, grouping, relative timestamps, and 40-entry Load More behavior remain unchanged.
- Skeleton/loading-state migration is explicitly part of this branch: History preserves six mobile rows, eight desktop rows, `role="status"`, polite live announcements, and hidden decorative rows without the conflicting Watchlist row layout class.
- `app-router.js` remains the sole browser History API owner.
- Watched/episode tracking remains separate domain ownership; this History migration does not change tracker truth or write semantics.

## Verification status

PR #102 already supplied the merged and deployed proof for Vue-native History ownership at the `5ec823a` main baseline. This branch does not re-establish that ownership; it removes the inert placeholder/script tag and the bridge-owned failure fallback. Those removals are not production-proven until this exact branch head passes full CI, merge, regression, provenance, deployment, restart, and public health verification.
