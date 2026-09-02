# Frontend Legacy Removal Inventory

## Purpose

This document locks the safe removal boundary for the post-migration `app.js` / `ui.js` cleanup. The goal is to reduce legacy ownership without deleting still-required tracker state, mutation, persistence, provider, notification, or routing services.

The inventory reflects baseline `8cfef1b` through PR #108, including complete typed Show Details composition, physical removal of dead Show composers, and the final History placeholder/fallback cleanup. Movie Details chrome is typed in the current slice, with one active-tab panel fragment remaining.

## Current rule

A legacy path may be physically removed only when all of the following are true:

1. A migrated owner is already production-proven for the same runtime responsibility.
2. No bridge still calls the legacy function as a staging/composition/service dependency.
3. No tracker mutation, persistence, pending-save, backup, notification, provider, or session behavior depends on it.
4. Direct URLs, Back/Forward, refresh, mobile behavior, and failure behavior remain covered by regression tests.
5. The exact cleanup head passes full repository CI before merge.

Deleting code merely because Vue is the final live DOM writer is not sufficient when Vue still consumes a legacy composer or service.

## Safe ownership conclusions

### Settings

Settings rendering is fully Vue-owned. `static/js/settings.js` remains only as the established small route/state facade, while `settings-vue-bridge.js` publishes the Vue render boundary. Legacy Settings markup/binders must not be reintroduced.

### Routing

`static/js/app-router.js` is the sole browser History API owner. Cleanup must not add `history.pushState`, `history.replaceState`, or competing `popstate` ownership back into other files.

### Watchlist / tracker lists

Watchlist native composition is production-proven.

- `static/js/app.js` remains authoritative for tracker state, mutations, list/filter state, durable save orchestration, and pending-save semantics.
- `static/js/tracker-lists-state-bridge.js` exposes the structured read-only model using established filter/sort/progress helpers.
- `frontend/src/tracker-lists/TrackerListsSurface.vue` owns Watchlist composition and final live DOM.
- The detached Watchlist HTML staging/composer path has been removed.

The remaining tracker services are explicit retained services, not dead renderer ownership.

### History

PR #102 replaced History DOM composition with Vue-native structured composition. PR #105 then removed the inert `history-activity.js` placeholder/script tag, migrated the History skeleton/loading state into the structured Vue boundary, and replaced the History-specific failure fallback with the shared runtime surface shell.

- `DATA.history` remains authoritative History truth.
- `static/js/history-state-bridge.js` retains pure visibility, ordering, grouping input, route/artwork/relative-time model shaping, but no DOM writes.
- `static/js/history-vue-bridge.js` owns pagination state and passes the structured view model to the attached Vue owner without cloning a staging root or serializing HTML.
- `frontend/src/history/HistorySurface.vue` owns loading, empty, error, and ready History composition/DOM.
- The loading migration preserves six mobile/eight desktop skeleton rows and accessible status semantics; the shared runtime shell handles Vue asset failure, while Vue alone handles model projection failure.
- `loadMoreHistory()` remains the Vue bridge-owned pagination action and routes its follow-up render through the sole active renderer.

History Vue ownership and final fallback cleanup remain production-proven; the current inventory baseline is `8cfef1b` through PR #108.

### Episode tracking

Vue owns the migrated episode-tracking interaction boundary, while tracker truth and durable write semantics remain established service ownership. Cleanup must preserve mutation delegation, watched/history truth, pending-save behavior, and PostgreSQL acknowledgement semantics.

### Pending-save recovery

The retry/storage recovery mechanism remains required, while persistent user-facing warnings were intentionally removed. Cleanup must preserve silent durable recovery and must not restore removed warning copy.

### Product naming

The product has no chosen public name. Internal repository/package/storage identifiers may continue to use existing technical names, but user-facing runtime copy must remain neutral until an explicit product name is selected.

## Remaining active composition dependencies

The current retained dependencies at baseline `8cfef1b` through PR #108 are:

1. Show Details: the bridge directly composes all typed nodes. The 27 audited dead `ui.js` HTML composers and stale streaming-region render wrapper are physically removed; interaction/domain, provider request/catalog/refresh, routing, and lazy-load services remain active.
2. Movie Details: the bridge directly composes typed poster, metadata, external links, tracking actions, and six primary tabs. It retains interaction binders and exactly one named fragment, `renderMovieActiveTabContentHTML(movie)`, for the active panel; the former full-page composer is removed.
3. Upcoming / notifications: Vue composes structured models while canonical timing, loggability, episode mutation, background refresh, notification API/persistence, and interaction services remain authoritative.
4. Discover: the legacy Discover hub/stability owner remains until native ownership passes direct-route, refresh, Back/Forward, provider-failure, and mobile acceptance.

## Removal order

Proceed incrementally:

1. COMPLETED: audit and physically remove dead Show HTML composers and the stale Show provider render wrapper, while retaining interaction binders and shared domain/provider/routing/lazy-load services.
2. COMPLETED IN THIS SLICE: migrate Movie chrome fragment factories to typed native composition.
3. NEXT: migrate the remaining Movie active-tab panels to typed nodes.
4. AFTER PANELS: remove proven-dead Movie HTML composers and callers, then remove the media-details node-model fragment parser only when no bridge consumes it.
5. Re-audit Upcoming timing, mutation, notification, interaction, and unused skeleton helpers while preserving release and persistence semantics.
6. Finish Discover native ownership, then re-audit `app.js` / `ui.js` and remove only dead ownership.

Each removal slice uses a dedicated branch/PR, exact-head CI, serialized merge, and production verification.

## Explicit non-targets

The legacy-removal phase must not casually change:

- PostgreSQL schema or tracker-data formats;
- backup/import formats;
- authentication/session/CSRF semantics;
- TMDB canonical identity;
- TVmaze optionality;
- Push optionality;
- notification persistence ordering;
- pending-save durability/retry policy;
- History/watched truth;
- router URL contracts.

## Exit gate

Legacy frontend removal is complete only when:

1. Every migrated surface has one runtime renderer/interaction owner.
2. No required Vue path depends on a detached legacy DOM composer.
3. `app.js` / `ui.js` contain only genuinely shared services with explicit retained ownership, or are removed entirely.
4. No duplicate History API owner, global navigation patch, or duplicate live-DOM writer remains.
5. Full CI, browser parity, mobile acceptance, and production deployment/health verification are green on the exact completion commit.

Until those conditions are met, cleanup proceeds incrementally rather than by deleting the mega-files wholesale.
