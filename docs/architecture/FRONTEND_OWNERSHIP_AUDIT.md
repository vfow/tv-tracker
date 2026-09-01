# Frontend Ownership Audit

## Scope

This audit records the current post-migration frontend ownership model after Watchlist native composition and the History native-composition replacement. It is intended to prevent duplicate renderers, duplicate History API ownership, stale fallback patches, and unsafe deletion of legacy services that Vue still consumes through bridges.

Search duplicate renderer ownership is already removed. Watchlist no longer stages legacy HTML. This History slice removes the equivalent History staging/composer dependency while preserving tracker truth, routing, and durable-write ownership.

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
| Upcoming / notifications | Vue final live owner | legacy Upcoming/notification composition plus canonical timing/notification services | RETAIN — `upcoming-notifications-vue-bridge.js` still invokes the legacy composers before Vue takes final DOM ownership |
| History | Vue-native `HistorySurface.vue` through `history-vue-bridge.js` | `DATA.history` truth plus DOM-free state/view-model helpers | PASS — no detached HTML staging, legacy DOM composer, or legacy pagination action remains |
| Show details | Vue final live owner through `show-details-vue-bridge.js` | `renderShowDetailsPageHTML`, detail events, tracker/provider services | RETAIN COMPOSER — bridge still consumes the legacy HTML composer |
| Movie details | Vue final live owner through `movie-details-vue-bridge.js` | `renderMovieDetailPageHTML`, detail events, provider services | RETAIN COMPOSER — bridge still consumes the legacy HTML composer |
| Episode tracking | Vue interaction owner | authoritative watched/history mutation and durable save semantics | RETAIN SERVICES — not dead-code cleanup |
| Pending-save recovery | no persistent warning UI | `db.js` queue/retry/storage recovery | PASS — silent retry/storage protection preserved and pending-save runtime copy is product-neutral |

## History ownership conclusion

`static/js/history-state-bridge.js` now owns the DOM-free structured History projection used by Vue. It preserves the established visibility, ordering, grouping, route, artwork, tracked metadata fallback, relative-time, and empty-state semantics without mutating `DATA.history`.

`static/js/history-vue-bridge.js` owns renderer activation and the existing 40-entry pagination UI state. It no longer captures an old renderer, clones a staging root, serializes HTML, or delegates pagination back to a legacy action. `HistorySurface.vue` is the sole live composition/DOM renderer.

`static/js/history-activity.js` is now only a temporary parser-blocking compatibility placeholder and contains no History renderer, composer, or pagination logic. The final file-removal sweep may remove that empty compatibility file and script tag together after the remaining frontend ownership work is stable.

## Detail and Upcoming cleanup audit

The next active composition dependencies are Show/Movie Details and Upcoming:

- `show-details-vue-bridge.js` calls `renderShowDetailsPageHTML` to build the model delivered to the Vue owner.
- `movie-details-vue-bridge.js` calls `renderMovieDetailPageHTML` to build the model delivered to the Vue owner.
- `upcoming-notifications-vue-bridge.js` captures and invokes the legacy `renderUpcoming` implementation, then hands the resulting model to Vue.
- Watchlist and History now use structured view models and Vue-native composition.

No detail or Upcoming composer is therefore eligible for physical deletion until its structured replacement is production-proven.

## Required legacy dependencies that still block broad `app.js` / `ui.js` deletion

- Upcoming Vue ownership still consumes the legacy Upcoming composer before final Vue rendering.
- Show and movie detail Vue ownership still consumes legacy HTML composers.
- Episode tracking still delegates authoritative mutations and durable write semantics to established services.
- Discover retains its stability gate and legacy hub composition until a replacement is proven under direct-route, refresh, Back/Forward, provider-failure, and mobile acceptance coverage.

These dependencies mean the correct strategy remains incremental ownership replacement, not wholesale removal of `app.js` or `ui.js`.

## Next cleanup order

1. Move Show/Movie detail composition to typed Vue-native view models before removing their legacy HTML composers.
2. Migrate the Upcoming composer only after timing, grouping, watched actions, notification state, loading/failure, and mobile behavior have equivalent Vue-native coverage.
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

Watchlist and History native composition are now structurally complete in source. History is not considered production-complete until this exact branch head passes full CI, merges from current `main`, and the resulting release passes regression, provenance, deploy, restart, and public health.

After that gate, the next meaningful ownership reduction is Show/Movie Details, followed by Upcoming. Broad `app.js` / `ui.js` deletion remains intentionally blocked while those named composers/services are active.
