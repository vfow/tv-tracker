# Frontend Modernization — Routing

Status: complete in production

Production completion merge: `55ae81d4ffe3223675fbb9fbbdb6d198eb382ff5` (PR #64)

## Goal

Migrate routing incrementally without creating a second history owner or changing canonical URLs, direct loads, refresh, Back/Forward behavior, login return paths, or Flask route admission.

## Canonical owner

`static/js/app-router.js` is the sole direct browser History API owner and the sole application `popstate` owner. It owns route parsing, canonical URL/history writes, route application, and Back/Forward handling.

`frontend/src/routing/router.ts` remains the typed Vue-era adapter. It delegates route parsing and navigation to `window.TVTrackerRouter`; it does not call `history.pushState`, `history.replaceState`, or register `popstate` itself.

The former direct-history exceptions have been burned down. `static/js/trending.js`, `static/js/settings.js`, `static/js/app.js`, and the search-navigation owner in `static/js/ui.js` delegate their path writes to `TVTrackerRouter.setPathRoute`.

## Invariants

- Flask route admission and redirects remain authoritative.
- `static/js/app-router.js` is the only application `popstate` owner and the only direct History API writer.
- Canonicalization remains implemented by the existing router.
- Vue callers use the typed routing adapter rather than writing browser history directly.
- Legacy runtime callers delegate path writes to `TVTrackerRouter.setPathRoute`.
- No new direct History API writer may be introduced.

## Completion evidence

1. Vue strict type checking passed with the routing adapter.
2. The typed adapter delegates parsing, path writes, and route application to `TVTrackerRouter`.
3. Repository-wide ownership scanning finds exactly one application `popstate` owner: `static/js/app-router.js`.
4. Repository-wide ownership scanning finds exactly one direct History API writer: `static/js/app-router.js`.
5. `static/js/app.js`, `static/js/ui.js`, `static/js/trending.js`, and `static/js/settings.js` contain no direct `pushState` or `replaceState` calls.
6. The Routing matrix locks direct loads, reload/startup shells, canonical push/replace writes, search-result click navigation, and Back/Forward behavior.
7. Exact-head PR CI passed before merge, and deployment #140 passed the full regression suite, release provenance, production activation, restart, and public health check.

## Next phase

Routing is complete. The modernization roadmap is now in Search / Discover; see `FRONTEND_MODERNIZATION_SEARCH_DISCOVER.md`.
