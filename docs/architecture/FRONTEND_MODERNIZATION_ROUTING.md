# Frontend Modernization — Routing

Status: canonical runtime history ownership consolidated; final PR/CI/merge gate pending

Production baseline before this completion slice: `f360969b1ed676f09470ded38660fde793d05f29`

## Goal

Migrate routing incrementally without creating a second history owner or changing canonical URLs, direct loads, refresh, Back/Forward behavior, login return paths, or Flask route admission.

## Canonical owner

`static/js/app-router.js` is the sole direct browser History API owner and the sole application `popstate` owner. It owns route parsing, canonical URL/history writes, route application, and Back/Forward handling.

`frontend/src/routing/router.ts` remains the typed Vue-era adapter. It delegates route parsing and navigation to `window.TVTrackerRouter`; it does not call `history.pushState`, `history.replaceState`, or register `popstate` itself.

The former direct-history exceptions have been burned down. `static/js/trending.js`, `static/js/settings.js`, `static/js/app.js`, and the search-navigation owner in `static/js/ui.js` now delegate their path writes to `TVTrackerRouter.setPathRoute`.

## Invariants

- Flask route admission and redirects remain authoritative.
- `static/js/app-router.js` is the only application `popstate` owner and the only direct History API writer.
- Canonicalization remains implemented by the existing router.
- Vue callers use the typed routing adapter rather than writing browser history directly.
- Legacy runtime callers delegate path writes to `TVTrackerRouter.setPathRoute`.
- No Search, Discover, media-detail, Upcoming, tracker, History, or watched-state product behavior moves in this slice.
- No new direct History API writer may be introduced.

## Completion gates

1. Vue strict type checking continues to pass with the routing adapter.
2. The typed adapter delegates parsing, path writes, and route application to `TVTrackerRouter`.
3. Repository-wide ownership scanning finds exactly one application `popstate` owner: `static/js/app-router.js`.
4. Repository-wide ownership scanning finds exactly one direct History API writer: `static/js/app-router.js`.
5. `static/js/app.js`, `static/js/ui.js`, `static/js/trending.js`, and `static/js/settings.js` contain no direct `pushState` or `replaceState` calls.
6. The Routing matrix contract proves direct loads, reload/startup shells, canonical push/replace writes, search-result click navigation, and Back/Forward regression coverage remain present.
7. The full repository regression suite and diff-hygiene gate pass on the exact PR head.

## Next phase

After this slice is merged and deployed successfully, Routing is complete and the modernization roadmap advances to Search / Discover.
