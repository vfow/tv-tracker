# Frontend Ownership Audit

## Scope

This audit records the current post-migration frontend ownership model on the production baseline after PR #93. It is intended to prevent duplicate renderers, duplicate History API ownership, stale fallback patches, and unsafe deletion of legacy services that Vue still consumes through bridges.

## Ownership rules

1. Each live DOM surface has one final renderer/interaction owner.
2. Browser History API ownership stays centralized in `static/js/app-router.js`.
3. Legacy composition or mutation code may remain only when an active Vue bridge still consumes it as an explicit staging/service dependency.
4. A legacy function that is no longer called by an active bridge and no longer owns live DOM is dead ownership and is eligible for a dedicated cleanup slice.
5. Tracker state, durable save, pending-save recovery, auth/CSRF, TMDB identity, optional-provider behavior, History truth, and notification persistence are service invariants, not DOM cleanup targets.

## Surface map

| Surface | Final live owner | Retained legacy/service dependency | Audit status |
| --- | --- | --- | --- |
| Routing / Back-Forward | `static/js/app-router.js` | shared route builders/state only | PASS — one History API owner |
| Settings | Vue Settings components via `settings-vue-bridge.js` | `settings.js` route/state facade | PASS — legacy markup/binders removed |
| Search results | Vue Search owner via `TVTrackerSearchVueBridge` | legacy Search state/actions and shared helpers | ACTION — old `ui.js` Search DOM renderer is duplicate/dead ownership and should be removed on a fresh current-main slice |
| Discover hub | legacy Discover renderer/stability gate | current Discover state/provider services | RETAIN — migration/removal not yet proven complete |
| Watchlist / tracker lists | Vue final `#show-list` writer | `ui.js` detached Watchlist composition plus `app.js` tracker state/mutations/save orchestration | RETAIN — bridge still stages legacy composition |
| Upcoming / notifications | Vue final live owner | canonical timing/notification services | RETAIN SERVICES — no broad deletion |
| History | Vue final live writer through `history-vue-bridge.js` | `history-activity.js` detached composer and pagination action | RETAIN — Vue-native composition not yet proven |
| Show / movie details | Vue final live owners through detail bridges | route/state/provider and mutation services | REVIEW PER FUNCTION — remove only DOM-only paths no bridge stages |
| Episode tracking | Vue interaction owner | authoritative watched/history mutation and durable save semantics | RETAIN SERVICES — not dead-code cleanup |
| Pending-save recovery | no persistent warning UI | `db.js` queue/retry/storage recovery | PASS — silent recovery preserved |

## Search ownership finding

`static/js/search-state-bridge.js` explicitly publishes `TVTrackerSearchVueBridge` with `ownership:"vue"` and assigns `global.renderSearchResults = render`. The bridge builds the renderer model, owns the Vue loading/failure handoff, and delegates actions to established state/navigation services.

Therefore the older Search DOM renderer/card functions still physically present in `static/js/ui.js` are not the runtime Search owner. They should not remain as a competing implementation. The stale PR #68 demonstrated the intended removal boundary but must not be merged because it is based on an old pre-migration baseline; the deletion must be recreated from current `main` with current tests.

## Required legacy dependencies that block broad `app.js` / `ui.js` deletion

- Watchlist Vue ownership still consumes detached legacy composition from `ui.js`.
- History Vue ownership still consumes `history-activity.js` composition.
- Episode tracking still delegates authoritative mutations and durable write semantics to established services.
- Search Vue ownership still consumes shared route/image/filter/collection helpers even though its old DOM renderer is dead.

These dependencies mean the correct strategy is incremental ownership deletion, not wholesale removal of the mega-files.

## Next cleanup order

1. Recreate the Search dead-renderer removal from current `main`; remove only the obsolete Search DOM renderer/card/skeleton functions and update ownership regression tests.
2. Audit migrated detail/upcoming DOM-only functions for bridge references and remove only functions with zero active staging/service callers.
3. Replace Watchlist detached legacy composition with a typed Vue-native view model before removing its `ui.js` composer.
4. Replace History detached composition/pagination rendering with Vue-native composition before deleting `history-activity.js` renderer ownership.
5. Re-audit `app.js` / `ui.js`; retain only explicitly named shared state/service owners or remove the shells if no such ownership remains.

## Regression gates

Every cleanup PR must prove:

- exact-head full repository CI green;
- Vue/Tailwind committed assets remain reproducible;
- direct route, refresh, Back/Forward, and mobile behavior remain covered;
- no duplicate `pushState` / `replaceState` / `popstate` ownership appears;
- no removed pending-save warning copy or placeholder public product branding returns;
- production deploy, restart, and public health pass for the exact merge commit.

## Current conclusion

Frontend ownership is substantially consolidated, but the legacy-removal phase is not complete. The main remaining architectural debt is detached legacy composition behind otherwise Vue-owned surfaces. Search has a proven dead duplicate renderer and is the next safe physical-removal target; Watchlist, History, and episode mutation services must not be deleted wholesale yet.
