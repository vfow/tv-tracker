# Frontend Modernization — Routing

Status: typed routing boundary active with repository-wide ownership and navigation-matrix gates; runtime ownership migration remains open

Production baseline: `3905e5673c1cf29c9a72842c91dc6c5ab72c5d4c`

## Goal

Migrate routing incrementally without creating a second history owner or changing canonical URLs, direct loads, refresh, Back/Forward behavior, login return paths, or Flask route admission.

## Current owner

`static/js/app-router.js` remains the canonical runtime owner of browser route parsing, canonical URL/history writes, route application, and the application `popstate` listener.

`frontend/src/routing/router.ts` is the typed Vue-era adapter. It delegates route parsing and navigation to `window.TVTrackerRouter`; it does not call `history.pushState`, `history.replaceState`, or register `popstate` itself.

A repository-wide source contract inventories browser-history ownership across `static/js` and `frontend/src`. The first run of that contract exposed four direct-history exceptions in addition to the canonical router: `static/js/app.js`, `static/js/settings.js`, `static/js/trending.js`, and `static/js/ui.js`. Trending and Settings have now been burned down: both delegate their path writes to `TVTrackerRouter.setPathRoute` and no longer write browser history directly. The remaining explicit migration inventory is `static/js/app.js` and `static/js/ui.js`. CI fails if another direct History API writer or `popstate` owner appears.

A dedicated Routing matrix contract now locks the existing runtime evidence for direct pretty-route loads, startup/reload shells, canonical push/replace writes, search-result click navigation through `TVTrackerRouter`, and browser Back/Forward through the sole `popstate` owner. This prevents those behaviors from silently losing regression coverage while ownership moves.

## Invariants

- Flask route admission and redirects remain authoritative.
- `static/js/app-router.js` remains the only application `popstate` owner during this transition.
- Canonicalization remains implemented by the existing router.
- Vue callers must use the typed routing adapter when route ownership starts moving; they must not write browser history directly.
- Trending and Settings route writes must delegate to `TVTrackerRouter.setPathRoute`; neither may become a History API owner.
- No Search, Discover, media-detail, Upcoming, tracker, History, or watched-state behavior moves in this slice.
- No additional direct History API writer may be introduced while the two remaining legacy exceptions are being burned down.

## Exit gates for this slice

1. Vue strict type checking passes with the routing adapter included.
2. The adapter delegates parsing, path writes, and route application to `TVTrackerRouter`.
3. The adapter contains no direct History API calls and no `popstate` listener.
4. Repository-wide ownership scanning finds exactly one application `popstate` owner: `static/js/app-router.js`.
5. Repository-wide ownership scanning finds exactly the current direct-history inventory: `static/js/app-router.js`, `static/js/app.js`, and `static/js/ui.js`.
6. `static/js/trending.js` and `static/js/settings.js` delegate path writes to `TVTrackerRouter.setPathRoute` and contain no direct `pushState` or `replaceState` call.
7. The Routing matrix contract proves that direct loads, reload/startup shells, canonical push/replace writes, search-result click navigation, and Back/Forward regression coverage remain present.
8. The full repository regression suite and diff-hygiene gate pass.

## Remaining Routing work

Later Routing slices must burn down the two remaining direct-history exceptions one at a time by delegating their path writes to the canonical router, migrate actual Vue route callers through the typed adapter with their deterministic Vite outputs rebuilt, exercise the locked direct/click/reload/Back/Forward matrix as ownership moves, and only then retire legacy routing code. Runtime ownership must move once, with no permanent dual router.
