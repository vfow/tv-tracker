# Frontend Legacy Removal Inventory

## Purpose

This document locks the safe removal boundary for the post-migration `app.js` / `ui.js` cleanup. The goal is to reduce legacy ownership without deleting still-required tracker state, composition, mutation, or persistence services.

The inventory is based on the production `main` baseline after the Episode Tracking completion and the pending-save/unnamed-product fixes.

## Current rule

A legacy path may be physically removed only when all of the following are true:

1. A migrated owner is already production-proven for the same runtime responsibility.
2. No bridge still calls the legacy function as a staging/composition/service dependency.
3. No tracker mutation, persistence, pending-save, backup, notification, provider, or session behavior depends on it.
4. Direct URLs, Back/Forward, refresh, mobile behavior, and failure fallback remain covered by regression tests.
5. The exact cleanup head passes full repository CI before merge.

Deleting code merely because Vue is the final live DOM writer is not sufficient when Vue still consumes a legacy composer or service.

## Safe ownership conclusions

### Settings

Settings rendering is fully Vue-owned.

- `static/js/settings.js` is intentionally retained only as a small route/state facade.
- `static/js/settings-vue-bridge.js` is the sole Settings render publisher.
- Legacy Settings markup/binders and the per-section canary fallback were already removed in Phase 4F.

No broad Settings rollback or duplicate renderer should be reintroduced during cleanup.

### Routing

`static/js/app-router.js` is the sole browser History API owner.

Cleanup must not add `history.pushState`, `history.replaceState`, or competing `popstate` ownership back into `app.js` / `ui.js`.

### Watchlist / tracker lists

Vue is the sole final live `#show-list` DOM writer, but physical legacy composition removal is **not yet safe**.

- `static/js/app.js` still owns authoritative tracker state, list/filter state, tracker mutations, and durable save orchestration.
- `static/js/ui.js` still composes the proven Watchlist markup, controls, filtering, sorting, and progress presentation.
- `static/js/upcoming-notifications-vue-bridge.js` currently runs that composition against a detached staging root and hands the serialized result to Vue.

Therefore the current cleanup target is live-DOM ownership overlap and dead call paths, not the still-required Watchlist composer/service implementation. Vue-native replacement must be proven before those helpers are deleted.

### History

Vue is the final live History DOM writer, but the proven legacy History composer is still required.

- `static/js/history-activity.js` remains the History composition owner.
- `static/js/history-vue-bridge.js` stages legacy composition off-DOM and hands markup to Vue.
- `loadMoreHistory()` remains the pagination action and routes follow-up rendering through the active public renderer.

Do not delete the History composer or pagination service until equivalent Vue-native composition/pagination is production-proven.

### Episode tracking

Vue owns the migrated episode-tracking interaction boundary, but tracker truth and durable write semantics remain legacy-backed.

The cleanup phase must preserve the existing mutation delegation, watched/history truth, pending-save behavior, and PostgreSQL acknowledgement semantics. Moving or deleting those services is a separate evidence-backed refactor, not dead-code cleanup.

### Pending-save recovery

The retry/storage recovery mechanism remains required, but persistent user-facing warnings were intentionally removed. Cleanup must preserve silent recovery and must not restore the removed warning copy.

### Product naming

The product has no chosen public name. Internal repository/package/storage identifiers may continue to use existing technical names, but user-facing runtime copy must remain neutral until an explicit product name is selected.

## Removal order

Use this order for physical cleanup:

1. Remove proven-inert duplicate live-DOM writers and obsolete runtime patch/fallback paths.
2. Remove dead Search/Discover renderer code only through a fresh, current-main-compatible cleanup path; the old PR #68 remains parked and must not be merged as stale evidence.
3. Remove migrated detail/upcoming/tracker/history DOM-only code after confirming no bridge still stages it.
4. Replace remaining detached legacy composers with Vue-native typed composition one domain at a time.
5. Only then shrink or remove the remaining `app.js` / `ui.js` shells.

Each removal slice must use a dedicated branch/PR and exact-head CI. Do not combine unrelated domains into a large deletion.

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
3. `app.js` / `ui.js` contain only genuinely shared services that have an explicit retained owner, or are removed entirely.
4. No duplicate History API owner, global navigation patch, or duplicate live-DOM writer remains.
5. Full CI, browser parity, mobile acceptance, and production deployment/health verification are green on the exact completion commit.

Until those conditions are met, cleanup proceeds incrementally rather than by deleting the mega-files wholesale.
