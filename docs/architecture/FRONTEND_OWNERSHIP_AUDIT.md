# Frontend Ownership Audit

## Scope

This audit records current ownership at baseline `8cfef1b` through PR #108: History Vue ownership from PR #102, Media Details native composition from PR #103, Upcoming native composition from PR #104, final History fallback cleanup from PR #105, typed Show Details chrome from PR #106, complete typed Show tab-panel composition from PR #107, and dead Show composer removal from PR #108. It is intended to prevent duplicate renderers, duplicate History API ownership, stale fallback patches, and unsafe deletion of services that Vue still consumes through bridges.

Search duplicate renderer ownership is already removed. Watchlist and History no longer stage legacy HTML. The audited follow-up physically removes dead Show Details HTML composition and its stale streaming-region render wrapper while preserving established state, interaction, provider request/catalog, refresh, lazy-load, and routing services.

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
| Upcoming / notifications | Vue-native `UpcomingNotificationsSurface.vue` through `TVTrackerUpcomingNotificationsVueBridge` | canonical schedule/timing, episode mutation, notification persistence/API, polling/toast, and interaction services | PASS — active-page polling commits fetched version state only after explicit Vue render success; an unavailable owner remains retryable without legacy fallback |
| History | Vue-native `HistorySurface.vue` through `history-vue-bridge.js` | `DATA.history` truth plus DOM-free state/view-model helpers | PASS — PR #105 removed the final placeholder, skeleton composer, and History-specific failure fallback |
| Show details | Vue native page shell through `show-details-vue-bridge.js` + typed detail-node model | detail events plus tracker/provider request/catalog/routing/lazy-load services | PASS — chrome, every Info subtab, and Episodes are directly composed typed nodes; dead HTML composers and the stale provider render wrapper are physically removed |
| Movie details | Vue native page shell through `movie-details-vue-bridge.js` + typed detail-node model | detail events, provider services, one active-tab panel fragment | CHROME TYPED — poster, metadata, external links, tracking actions, and six primary tabs are native typed nodes; panels remain the sole fragment boundary |
| Episode tracking | Vue interaction owner | authoritative watched/history mutation and durable save semantics | RETAIN SERVICES — not dead-code cleanup |
| Pending-save recovery | no persistent warning UI | `db.js` queue/retry/storage recovery | PASS — silent retry/storage protection preserved and pending-save runtime copy is product-neutral |

## History ownership conclusion

`static/js/history-state-bridge.js` now owns the DOM-free structured History projection used by Vue. It preserves the established visibility, ordering, grouping, route, artwork, tracked metadata fallback, relative-time, and empty-state semantics without mutating `DATA.history`.

`static/js/history-vue-bridge.js` owns renderer activation and the existing 40-entry pagination UI state. It no longer captures an old renderer, clones a staging root, serializes HTML, or delegates pagination back to a legacy action. `HistorySurface.vue` is the sole live composition/DOM renderer.

The structured loading model preserves six mobile and eight desktop rows plus the existing accessible status behavior, while asset load failures exit the generic skeleton through `TVTrackerClientRuntime.renderSurfaceFailure()` and projection failures remain Vue-rendered with distinct markers and diagnostics.

The obsolete `static/js/history-activity.js` compatibility placeholder and its parser-blocking script tag are removed. No legacy History activity script participates in runtime ordering or ownership.

## Current Detail and Upcoming audit

PRs #103, #104, #106, and #107 changed these ownership boundaries after the earlier History audit:

- `show-details-vue-bridge.js` directly builds the complete typed Show node model. `movie-details-vue-bridge.js` directly builds typed Movie chrome and retains only `renderMovieActiveTabContentHTML(movie)` as a named panel fragment. The removed full-page composers are no longer dependencies; retained interaction binders and domain helpers remain explicit services.
- `upcoming-notifications-vue-bridge.js` builds structured Upcoming and Notifications models directly. It does not capture a legacy `renderUpcoming` composer; canonical schedule/timing, episode mutation, notification API/persistence, polling/toast, and DOM interaction services remain retained dependencies. The typed owner reports success only after mounting into an available root; the bridge then records the model and binds interactions. API failures may render the established Vue error model, while owner render exceptions propagate. Active Notifications-page polling advances fetched version state only after an end-to-end `true` result, leaving failed renders retryable without legacy rendering.
- `HistorySurface.vue` and `TrackerListsSurface.vue` continue to use structured view models and Vue-native composition.

The old Detail and Upcoming page composers are already removed. The audited Show-specific HTML composers in `ui.js` and their stale streaming-region render wrapper are now physically removed. Retained interaction, timing, mutation, provider request/catalog/refresh, and notification services remain active ownership.

## Required legacy dependencies that still block broad `app.js` / `ui.js` deletion

- Movie Details consumes one named active-tab panel fragment. Its chrome is typed; Show Details consumes no fragments, while both retain interaction binders and domain services.
- Upcoming still consumes canonical schedule/timing, loggability, background refresh, episode mutation, notification request/persistence, and interaction services.
- Episode tracking still delegates authoritative mutations and durable write semantics to established services.
- Discover retains its stability gate and legacy hub composition until a replacement is proven under direct-route, refresh, Back/Forward, provider-failure, and mobile acceptance coverage.

These dependencies mean the correct strategy remains incremental ownership replacement, not wholesale removal of `app.js` or `ui.js`.

## Cleanup order

1. COMPLETED: remove the audited dead Show HTML composers and stale Show provider render wrapper; retain interaction binders and domain/provider/routing/lazy-load services.
2. COMPLETED IN THIS SLICE: replace Movie chrome fragment factories with typed native composition.
3. NEXT: migrate the remaining Movie active-tab panels to typed nodes.
4. AFTER PANELS: remove proven-dead Movie HTML composers and callers, then remove the media-details node-model `fragment()` parser when no fragment calls remain.
5. Re-audit retained Upcoming timing, mutation, notification, interaction, and unused skeleton helpers without weakening release or persistence semantics.
6. Finish Discover native ownership, then re-audit `app.js` / `ui.js` and retain only explicitly named shared owners.

## Regression gates

Every cleanup PR must prove:

- exact-head full repository CI green;
- Vue/Tailwind committed assets remain reproducible;
- direct route, refresh, Back/Forward, and mobile behavior remain covered;
- no duplicate `pushState` / `replaceState` / `popstate` ownership appears;
- pending-save retry/storage protection remains intact while removed warning copy and placeholder product branding stay absent from the pending-save runtime slice;
- production deploy, restart, and public health pass for the exact merge commit.

## Current conclusion

Watchlist and History native composition are merged and deployed. PR #105 removed History's inert placeholder/script, legacy skeleton composer, and bridge failure DOM fallback.

Media Details and Upcoming native composition are merged through PRs #103 and #104, and Show Details has full typed composition through PR #107 plus physical composer cleanup in PR #108. Movie chrome is now typed with one active-tab panel fragment remaining. Broad `app.js` / `ui.js` deletion remains intentionally blocked while that panel fragment, shared interaction/domain services, and the Discover legacy owner are active.
