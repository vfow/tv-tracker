# Frontend Legacy Removal Inventory

## Purpose

This document locks the safe removal boundary for the post-migration `app.js` / `ui.js` cleanup. The goal is to reduce legacy ownership without deleting still-required tracker state, mutation, persistence, provider, notification, or routing services.

The inventory now reflects the production-proven Watchlist native composition and the History native-composition candidate in this branch.

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

This branch replaces the remaining History DOM composer with Vue-native structured composition.

- `DATA.history` remains authoritative History truth.
- `static/js/history-activity.js` retains pure visibility, ordering, grouping input, route/artwork/relative-time model shaping, and pagination calculations, but no DOM writes.
- `static/js/history-vue-bridge.js` passes the structured view model to the attached Vue owner without cloning a staging root or serializing HTML.
- `frontend/src/history/HistorySurface.vue` owns final History composition/DOM.
- `loadMoreHistory()` remains the pagination-state action and routes its follow-up render through the active public renderer.

The History DOM ownership reduction is not production-proven until this exact branch head passes CI, merge, deploy, restart, and public health.

### Episode tracking

Vue owns the migrated episode-tracking interaction boundary, while tracker truth and durable write semantics remain established service ownership. Cleanup must preserve mutation delegation, watched/history truth, pending-save behavior, and PostgreSQL acknowledgement semantics.

### Pending-save recovery

The retry/storage recovery mechanism remains required, while persistent user-facing warnings were intentionally removed. Cleanup must preserve silent durable recovery and must not restore removed warning copy.

### Product naming

The product has no chosen public name. Internal repository/package/storage identifiers may continue to use existing technical names, but user-facing runtime copy must remain neutral until an explicit product name is selected.

## Remaining active composition dependencies

After Watchlist and History native composition, the important remaining frontend composition debt is:

1. Show Details: `show-details-vue-bridge.js` still consumes `renderShowDetailsPageHTML`.
2. Movie Details: `movie-details-vue-bridge.js` still consumes `renderMovieDetailPageHTML`.
3. Upcoming / notifications: `upcoming-notifications-vue-bridge.js` still consumes legacy Upcoming/notification composition while canonical timing and notification services remain authoritative.
4. Discover: the legacy Discover hub/stability owner remains until native ownership passes direct-route, refresh, Back/Forward, provider-failure, and mobile acceptance.

## Removal order

Proceed incrementally:

1. Finish and production-prove History native composition.
2. Replace Show/Movie detail HTML composers with typed Vue-native view models.
3. Replace legacy Upcoming/notification composition while preserving timing, watched actions, notification persistence, Push semantics, loading/failure behavior, and mobile parity.
4. Finish Discover native ownership.
5. Re-audit `app.js` / `ui.js` and remove only dead ownership; retain named shared services or remove the shells only if no required ownership remains.

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
