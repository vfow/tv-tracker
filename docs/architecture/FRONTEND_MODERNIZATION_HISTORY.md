# Frontend Modernization: History

## Current ownership

History now uses Vue-native structured composition while preserving the established tracker truth and pagination semantics.

- `DATA.history` remains authoritative tracker state.
- `static/js/history-activity.js` owns pure History data shaping: visibility, ordering, grouping inputs, routes, artwork fallbacks, relative-time values, empty-state data, and pagination calculations. It no longer writes DOM.
- `static/js/history-vue-bridge.js` owns the runtime handoff, lazy-loads the existing Vue entry, and passes a structured History view model to the attached Vue owner.
- `frontend/src/history/HistorySurface.vue` is the sole live History composition/DOM renderer for `/app/history`.
- `app-router.js` remains the sole browser History API owner.
- History mutations, watched/episode tracking, save behavior, pending-save behavior, APIs, Flask routes, and database schema are unchanged.

## Read-only state boundary

`static/js/history-state-bridge.js` exposes `window.TVTrackerHistoryStateBridge` with `ownership: "legacy-read-only"` and a `snapshot()` method.

The bridge is intentionally DOM-free, network-free, persistence-free, and navigation-free. It reads the current History and shows, mirrors the existing History visibility and sort rules, and returns detached frozen episode/movie summaries.

`frontend/src/history/contracts.ts` defines both the typed read-only snapshot and the native History renderer/view-model contracts. `frontend/src/history/legacyHistoryState.ts` continues to validate the snapshot boundary independently of live rendering.

## Vue rendering boundary

`static/js/history-vue-bridge.js` no longer captures a legacy `renderHistory`, stages a temporary `#show-list`, or hands serialized HTML to a generic Vue shell. It loads the existing Vite entry when required, receives its History owner via `attachVueOwner`, obtains the current structured model from `getHistoryViewModel()`, and renders that model directly.

`loadMoreHistory()` remains the pagination state action. It increments the existing `historyVisibleLimit` by `HISTORY_BATCH_SIZE` and reroutes the follow-up render through the public `renderHistory` bridge. The Vue `Load More` control delegates to that action, so pagination truth remains unchanged while Vue owns final composition.

## Invariants

- No History runtime path stages or serializes legacy HTML.
- Vue is the sole final live History DOM writer.
- `static/js/history-activity.js` remains DOM-free after the native handoff.
- The read-only state bridge must not mutate `DATA.history`.
- Episode/movie ordering, future-episode suppression, routes, artwork fallbacks, empty state, grouping, relative timestamps, and Load More behavior remain unchanged.
- `app-router.js` remains the sole browser History API owner.
- Watched/episode tracking remains separate domain ownership; this History migration does not change tracker truth or write semantics.

## Completion gate

History native composition is complete only after the exact PR head passes the full repository CI, is merged from the current production `main`, and the resulting production release passes regression, provenance, SSH deployment, restart, and public health verification.
