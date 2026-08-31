# Frontend Modernization: History

## Current ownership

History is being modernized gradually after Tracker Lists.

- `DATA.history` remains authoritative legacy tracker state.
- `static/js/history-activity.js` remains the proven History composition owner, including grouping, cards, relative timestamps, routes, artwork fallbacks, empty state, and pagination calculations.
- `static/js/history-vue-bridge.js` runs that composition against a temporary staging `#show-list` and hands the resulting markup to the existing Vue show-list owner for the live render.
- Vue is the final live `#show-list` DOM writer for `/app/history`.
- `app-router.js` remains the sole browser History API owner.
- History mutations, watched/episode tracking, save behavior, pending-save behavior, APIs, Flask routes, and database schema are unchanged.

## Read-only state boundary

`static/js/history-state-bridge.js` exposes `window.TVTrackerHistoryStateBridge` with `ownership: "legacy-read-only"` and a `snapshot()` method.

The bridge is intentionally DOM-free, network-free, persistence-free, and navigation-free. It reads the current legacy history and shows, mirrors the existing History visibility and sort rules, and returns detached frozen episode/movie summaries.

`frontend/src/history/contracts.ts` defines the typed History snapshot contract. `frontend/src/history/legacyHistoryState.ts` validates and normalizes the bridge for future typed composition work.

## Vue rendering boundary

`static/js/history-vue-bridge.js` captures the legacy `renderHistory` implementation, replaces the public runtime entry point, and isolates legacy composition from the live Vue-owned root. In normal browsers the live root is temporarily renamed, a staging root receives legacy composition, and only serialized markup is handed to Vue.

The bridge rebinds the visible `Load More` control after the Vue handoff. `loadMoreHistory()` remains the legacy pagination action and routes its follow-up render through the active public `renderHistory` entry point, so pagination state stays authoritative while Vue remains the final live DOM writer.

The existing shared Vue show-list HTML owner is reused, so this slice does not change the committed Vite bundle or introduce a second Vue mount path.

## Invariants

- The legacy History composer must not mutate the live Vue-owned `#show-list` during normal staging composition.
- Vue is the sole final live History DOM writer after a successful handoff.
- If the shared Vue owner cannot load, the bridge falls back to the legacy renderer rather than leaving History blank.
- The read-only state bridge must not mutate `DATA.history`.
- Episode/movie ordering, future-episode suppression, routes, artwork fallbacks, empty state, grouping, relative timestamps, and Load More behavior must remain unchanged.
- `app-router.js` remains the sole browser History API owner.
- Watched/episode tracking remains a separate later roadmap phase; this History renderer handoff does not change tracker truth or write semantics.

## Next slice

After exact-head CI and production acceptance, complete the History phase by tightening ownership/completion contracts and removing only History live-DOM behavior proven inert. Physical broad `app.js` / `ui.js` cleanup remains deferred to the later legacy-removal phase.
