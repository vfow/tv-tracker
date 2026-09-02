# Frontend Ownership Audit

## Scope

This audit records current ownership from the `5ec823a` main baseline: History Vue ownership from PR #102, Media Details native composition from PR #103, and Upcoming native composition from PR #104. It is intended to prevent duplicate renderers, duplicate History API ownership, stale fallback patches, and unsafe deletion of services that Vue still consumes through bridges.

Search duplicate renderer ownership is already removed. Watchlist and History no longer stage legacy HTML. This branch removes History's inert compatibility placeholder, migrates its skeleton/loading state fully into the structured Vue boundary, and replaces the History-specific failure fallback with the shared runtime shell boundary; that work remains pending exact-head verification.

## Ownership rules

1. Each live DOM surface has one final renderer/interaction owner.
2. Browser History API ownership stays centralized in `static/js/app-router.js`.
3. Legacy composition or mutation code may remain only when an active Vue bridge still consumes it as an explicit staging/service dependency.
4. A legacy function that is no longer called by an active bridge and no longer owns live DOM is dead ownership and is eligible for a dedicated cleanup slice.
5. Tracker state, durable save, pending-save recovery, auth/CSRF, TMDB identity, optional-provider behavior, History truth, and notification persistence are service invariants, not DOM cleanup targets.
6. Mega-file reduction is not a goal by itself. `app.js` / `ui.js` code is removed only when ownership evidence proves the behavior has another authoritative owner.

## Surface map

| Surface | Final live owner | Retained legacy/service dependency | Audit status |
| --- | --- | --- | --- |
| Routing / Back-Forward | `static/js/app-router.js` | shared route builders/state only | PASS — one History API owner |
| Settings | Vue Settings components via `settings-vue-bridge.js` | `settings.js` route/state facade | PASS — legacy markup/binders removed |
| Search results | Vue Search owner via `TVTrackerSearchVueBridge` | Search state/actions and shared route/image/filter/collection helpers | PASS — duplicate `ui.js` Search DOM renderer removed |
| Discover hub | legacy Discover renderer/stability gate | current Discover state/provider services | RETAIN — migration/removal not yet proven complete |
| Watchlist / tracker lists | Vue-native `TrackerListsSurface.vue` | `app.js` tracker state/mutations/save orchestration plus read-only filter/progress helpers | PASS — structured view model replaces detached legacy HTML composition |
| Upcoming / notifications | Vue-native `UpcomingNotificationsSurface.vue` | canonical schedule/timing, episode mutation, notification persistence/API, and interaction services | PASS — PR #104 removed legacy page composition; retained dependencies are services |
| History | Vue-native `HistorySurface.vue` through `history-vue-bridge.js` | `DATA.history` truth plus DOM-free state/view-model helpers | PASS at PR #102 — placeholder/fallback removal on this branch is pending verification |
| Show details | Vue native page shell through `show-details-vue-bridge.js` + typed detail-node model | detail events, tracker/provider services, shared fragment helpers | PAGE COMPOSER REMOVED — shared helpers remain service/fragment dependencies until final `ui.js` cleanup |
| Movie details | Vue native page shell through `movie-details-vue-bridge.js` + typed detail-node model | detail events, provider services, shared fragment helpers | PAGE COMPOSER REMOVED — shared helpers remain service/fragment dependencies until final `ui.js` cleanup |
| Episode tracking | Vue interaction owner | authoritative watched/history mutation and durable save semantics | RETAIN SERVICES — not dead-code cleanup |
| Pending-save recovery | no persistent warning UI | `db.js` queue/retry/storage recovery | PASS — silent retry/storage protection preserved and pending-save runtime copy is product-neutral |

## History ownership conclusion

`static/js/history-state-bridge.js` now owns the DOM-free structured History projection used by Vue. It preserves the established visibility, ordering, grouping, route, artwork, tracked metadata fallback, relative-time, and empty-state semantics without mutating `DATA.history`.

`static/js/history-vue-bridge.js` owns renderer activation and the existing 40-entry pagination UI state. It no longer captures an old renderer, clones a staging root, serializes HTML, or delegates pagination back to a legacy action. `HistorySurface.vue` is the sole live composition/DOM renderer.

Skeleton/loading-state migration is included in this branch. The structured loading model preserves six mobile and eight desktop rows plus the existing accessible status behavior, while asset load failures exit the generic skeleton through `TVTrackerClientRuntime.renderSurfaceFailure()` and projection failures remain Vue-rendered with distinct markers and diagnostics.

The obsolete `static/js/history-activity.js` compatibility placeholder and its parser-blocking script tag are removed. No legacy History activity script participates in runtime ordering or ownership.

## Current Detail and Upcoming audit

PRs #103 and #104 changed these ownership boundaries after the earlier History audit:

- `show-details-vue-bridge.js` and `movie-details-vue-bridge.js` build typed node models for Vue. The removed `renderShowDetailsPageHTML` and `renderMovieDetailPageHTML` page composers are no longer dependencies; retained `ui.js` fragment helpers and interaction binders remain explicit services.
- `upcoming-notifications-vue-bridge.js` builds structured Upcoming and Notifications models directly. It does not capture a legacy `renderUpcoming` composer; canonical schedule/timing, episode mutation, notification API/persistence, and DOM interaction services remain retained dependencies.
- `HistorySurface.vue` and `TrackerListsSurface.vue` continue to use structured view models and Vue-native composition.

The old Detail and Upcoming page composers are already removed. Their retained fragment, interaction, timing, mutation, and notification services are not dead ownership merely because Vue now composes the pages.

## Required legacy dependencies that still block broad `app.js` / `ui.js` deletion

- Show and movie details still consume named fragment factories and interaction binders through typed node-model bridges.
- Upcoming still consumes canonical schedule/timing, loggability, background refresh, episode mutation, notification request/persistence, and interaction services.
- Episode tracking still delegates authoritative mutations and durable write semantics to established services.
- Discover retains its stability gate and legacy hub composition until a replacement is proven under direct-route, refresh, Back/Forward, provider-failure, and mobile acceptance coverage.

These dependencies mean the correct strategy remains incremental ownership replacement, not wholesale removal of `app.js` or `ui.js`.

## Next cleanup order

1. Re-audit the retained Show/Movie detail fragment factories and interaction binders; replace or remove only dependencies with equivalent typed coverage.
2. Re-audit retained Upcoming timing, mutation, notification, interaction, and unused skeleton helpers without weakening release or persistence semantics.
3. Finish Discover native ownership under direct-route, refresh, Back/Forward, provider-failure, and mobile acceptance coverage.
4. Re-audit `app.js` / `ui.js`; retain only explicitly named shared state/service owners or remove the shells if no such ownership remains.

## Regression gates

Every cleanup PR must prove:

- exact-head full repository CI green;
- Vue/Tailwind committed assets remain reproducible;
- direct route, refresh, Back/Forward, and mobile behavior remain covered;
- no duplicate `pushState` / `replaceState` / `popstate` ownership appears;
- pending-save retry/storage protection remains intact while removed warning copy and placeholder product branding stay absent from the pending-save runtime slice;
- production deploy, restart, and public health pass for the exact merge commit.

## Current conclusion

Watchlist and History native composition are already merged; History ownership proof came from PR #102 and is present in deployed main `5ec823a`. This branch's inert placeholder/script deletion and removal of the bridge failure DOM fallback are pending exact-head CI, merge, regression, provenance, deployment, restart, and public-health verification.

Media Details and Upcoming native composition are also merged through PRs #103 and #104. Broad `app.js` / `ui.js` deletion remains intentionally blocked while their named fragment/interaction/domain services and the Discover legacy owner are active.
