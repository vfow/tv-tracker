# Frontend Modernization — Routing

Status: typed routing boundary started; runtime ownership migration remains open

Production baseline: `0b916bb25e037e55b7231d9cac2e7fd0990ab75d`

## Goal

Migrate routing incrementally without creating a second history owner or changing canonical URLs, direct loads, refresh, Back/Forward behavior, login return paths, or Flask route admission.

## Current owner

`static/js/app-router.js` remains the sole runtime owner of browser route parsing, URL/history writes, route application, and the application `popstate` listener.

The first Routing slice adds `frontend/src/routing/router.ts` as a typed Vue-era adapter. It delegates route parsing and navigation to `window.TVTrackerRouter`; it does not call `history.pushState`, `history.replaceState`, or register `popstate` itself.

This slice is intentionally source-only. It is included by strict TypeScript checking but is not imported into the active Vite bundle yet, so production routing behavior is unchanged.

## Invariants

- Flask route admission and redirects remain authoritative.
- `static/js/app-router.js` remains the only `popstate` owner during this transition slice.
- Canonicalization remains implemented by the existing router.
- Vue callers must use the typed routing adapter when route ownership starts moving; they must not write browser history directly.
- No Search, Discover, media-detail, Upcoming, tracker, History, or watched-state behavior moves in this slice.

## Exit gates for this slice

1. Vue strict type checking passes with the routing adapter included.
2. The adapter delegates parsing, path writes, and route application to `TVTrackerRouter`.
3. The adapter contains no direct History API calls and no `popstate` listener.
4. `static/js/app-router.js` still has exactly one application `popstate` listener.
5. The full repository regression suite and diff-hygiene gate pass.

## Remaining Routing work

Later Routing slices must migrate actual Vue route callers through this adapter, remove competing Trending/Discover history ownership, prove the direct/click/reload/Back/Forward matrix, and only then retire legacy routing code. Runtime ownership must move once, with no permanent dual router.
