# Frontend Modernization — Routing

Status: typed routing boundary active with repository-wide ownership gate; runtime ownership migration remains open

Production baseline: `7324ce30a7d70da70b6a41894c1cb006db436e77`

## Goal

Migrate routing incrementally without creating a second history owner or changing canonical URLs, direct loads, refresh, Back/Forward behavior, login return paths, or Flask route admission.

## Current owner

`static/js/app-router.js` remains the sole runtime owner of browser route parsing, canonical URL/history writes, route application, and the application `popstate` listener.

`frontend/src/routing/router.ts` is the typed Vue-era adapter. It delegates route parsing and navigation to `window.TVTrackerRouter`; it does not call `history.pushState`, `history.replaceState`, or register `popstate` itself.

A repository-wide source contract now inventories browser-history ownership across `static/js` and `frontend/src`. It fails if a new direct History API writer or `popstate` owner appears. The only temporary direct-history exception is `static/js/trending.js`; removing that exception is explicit remaining Routing work rather than hidden debt.

## Invariants

- Flask route admission and redirects remain authoritative.
- `static/js/app-router.js` remains the only application `popstate` owner during this transition.
- Canonicalization remains implemented by the existing router.
- Vue callers must use the typed routing adapter when route ownership starts moving; they must not write browser history directly.
- No Search, Discover, media-detail, Upcoming, tracker, History, or watched-state behavior moves in this slice.
- No additional direct History API writer may be introduced while Trending remains the sole documented temporary exception.

## Exit gates for this slice

1. Vue strict type checking passes with the routing adapter included.
2. The adapter delegates parsing, path writes, and route application to `TVTrackerRouter`.
3. The adapter contains no direct History API calls and no `popstate` listener.
4. Repository-wide ownership scanning finds exactly one application `popstate` owner: `static/js/app-router.js`.
5. Repository-wide ownership scanning permits direct History API writes only in `static/js/app-router.js` and the temporary `static/js/trending.js` exception.
6. The full repository regression suite and diff-hygiene gate pass.

## Remaining Routing work

Later Routing slices must remove the Trending direct-history exception by delegating its path writes to the canonical router, migrate actual Vue route callers through the typed adapter with their deterministic Vite outputs rebuilt, prove the direct/click/reload/Back/Forward matrix, and only then retire legacy routing code. Runtime ownership must move once, with no permanent dual router.
