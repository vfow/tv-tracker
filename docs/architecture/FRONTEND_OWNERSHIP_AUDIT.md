# Frontend Ownership Audit

## Scope

This audit records the current post-migration frontend ownership model on production after PR #99. It is intended to prevent duplicate renderers, duplicate History API ownership, stale fallback patches, and unsafe deletion of legacy services that Vue still consumes through bridges.

The Search dead-renderer cleanup from PR #98 is now complete and deployed. PR #99 also leaves pending-save recovery silent and removes the remaining product-branded network fallback from the pending-save runtime slice without changing queue, retry, or storage semantics.

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
| Search results | Vue Search owner via `TVTrackerSearchVueBridge` | Search state/actions and shared route/image/filter/collection helpers | PASS — duplicate `ui.js` Search DOM renderer removed in PR #98 |
| Discover hub | legacy Discover renderer/stability gate | current Discover state/provider services | RETAIN — migration/removal not yet proven complete |
| Watchlist / tracker lists | Vue-native `TrackerListsSurface.vue` | `app.js` tracker state/mutations/save orchestration plus read-only filter/progress helpers | PASS — structured view model replaces detached legacy HTML composition |
| Upcoming / notifications | Vue final live owner | legacy Upcoming/notification composition plus canonical timing/notification services | RETAIN — `upcoming-notifications-vue-bridge.js` still invokes the legacy composers before Vue takes final DOM ownership |
| History | Vue final live writer through `history-vue-bridge.js` | `history-activity.js` detached composer and pagination action | RETAIN — Vue-native composition not yet proven |
| Show details | Vue final live owner through `show-details-vue-bridge.js` | `renderShowDetailsPageHTML`, detail events, tracker/provider services | RETAIN COMPOSER — bridge still consumes the legacy HTML composer |
| Movie details | Vue final live owner through `movie-details-vue-bridge.js` | `renderMovieDetailPageHTML`, detail events, provider services | RETAIN COMPOSER — bridge still consumes the legacy HTML composer |
| Episode tracking | Vue interaction owner | authoritative watched/history mutation and durable save semantics | RETAIN SERVICES — not dead-code cleanup |
| Pending-save recovery | no persistent warning UI | `db.js` queue/retry/storage recovery | PASS — silent retry/storage protection preserved and pending-save runtime copy is product-neutral |

## Search ownership conclusion

`static/js/search-state-bridge.js` publishes `TVTrackerSearchVueBridge` with Vue renderer ownership and assigns the runtime Search renderer to the bridge. PR #98 removed the obsolete Search DOM renderer/card/skeleton implementation from `static/js/ui.js` while preserving shared Search/Discover helpers and the established Search state/actions.

The cleanup also exposed a real Tailwind ownership edge: a Vue-owned person skeleton class was no longer discoverable after its legacy markup disappeared. The class is now explicitly retained by the Tailwind configuration and regression coverage guards that contract. Search therefore no longer has duplicate DOM renderer ownership.

## Detail and Upcoming cleanup audit

The next legacy-removal candidate from the previous audit was migrated detail/Upcoming DOM-only code. Current-main reference checks show those composers are still active staging dependencies, so deleting them would be an ownership regression rather than cleanup:

- `show-details-vue-bridge.js` calls `renderShowDetailsPageHTML` to build the model delivered to the Vue owner.
- `movie-details-vue-bridge.js` calls `renderMovieDetailPageHTML` to build the model delivered to the Vue owner.
- `upcoming-notifications-vue-bridge.js` captures and invokes the legacy `renderUpcoming` implementation, then hands the resulting model to Vue.
- Watchlist no longer uses detached legacy HTML composition; its bridge now consumes a read-only structured view model and Vue renders the cards natively.

No detail or Upcoming composer is therefore eligible for physical deletion in the current architecture. This is a positive audit result: required staging code remains named and bounded instead of being removed merely because the final DOM owner is Vue.

## Required legacy dependencies that still block broad `app.js` / `ui.js` deletion

- Upcoming Vue ownership still consumes the legacy Upcoming composer before final Vue rendering.
- Show and movie detail Vue ownership still consumes legacy HTML composers.
- History Vue ownership still consumes `history-activity.js` composition.
- Episode tracking still delegates authoritative mutations and durable write semantics to established services.
- Discover retains its stability gate and legacy hub composition until a replacement is proven under direct-route, refresh, Back/Forward, provider-failure, and mobile acceptance coverage.

These dependencies mean the correct strategy remains incremental ownership replacement, not wholesale removal of `app.js` or `ui.js`.

## Next cleanup order

1. Replace History detached composition/pagination rendering with Vue-native composition before deleting `history-activity.js` renderer ownership.
2. Move Show/Movie detail composition to typed Vue-native view models before removing their legacy HTML composers.
3. Migrate the Upcoming composer only after timing, grouping, watched actions, notification state, loading/failure, and mobile behavior have equivalent Vue-native coverage.
4. Finish Discover native ownership under direct-route, refresh, Back/Forward, provider-failure, and mobile acceptance coverage.
5. Re-audit `app.js` / `ui.js`; retain only explicitly named shared state/service owners or remove the shells if no such ownership remains.

## Regression gates

Every cleanup PR must prove:

- exact-head full repository CI green;
- Vue/Tailwind committed assets remain reproducible;
- direct route, refresh, Back/Forward, and mobile behavior remain covered;
- no duplicate `pushState` / `replaceState` / `popstate` ownership appears;
- pending-save retry/storage protection remains intact while the removed warning copy and placeholder product branding stay absent from the pending-save runtime slice;
- production deploy, restart, and public health pass for the exact merge commit.

## Current conclusion

Frontend ownership is substantially consolidated and Search duplicate renderer ownership is complete. There is no further safe detail/Upcoming physical deletion on the current architecture because active Vue bridges still consume those legacy composers.

Watchlist native composition is now complete. The next meaningful ownership reduction is History: replace its detached legacy composition and pagination rendering with a Vue-native structured model, then remove only the obsolete History renderer ownership after exact parity tests prove the replacement. Broad `app.js` / `ui.js` deletion remains intentionally blocked while the other named composers/services are active.
