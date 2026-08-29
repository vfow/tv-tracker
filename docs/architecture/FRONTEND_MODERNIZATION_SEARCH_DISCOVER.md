# Frontend Modernization — Search / Discover

Status: first characterization slice active; typed contract added while legacy runtime ownership remains unchanged

Production baseline: `55ae81d4ffe3223675fbb9fbbdb6d198eb382ff5`

## Goal

Migrate Search / Discover incrementally to Vue 3 + TypeScript without changing canonical URLs, TMDB identity, search media semantics, adult filtering, eye-filter behavior, tracker labels, streaming-region behavior, Discover stability, or Back/Forward behavior.

This phase follows the approved rule to characterize current behavior before moving ownership. The first slice adds a strict typed contract only. It does not mount a Search / Discover Vue surface and it does not replace any legacy renderer.

## Current runtime owners

- `static/js/app.js` owns Search / Discover state, Search orchestration, Discover hub loading, category state, and the current `shouldShowDiscoverHub` decision.
- `static/js/ui.js` owns the current Search result renderer, Discover hub renderer, Discover stability gate, and their interaction wiring.
- `static/js/trending.js` owns trending-feed configuration, cache/load behavior, hub-row merging, and trending full-page behavior.
- `static/js/app-router.js` remains the canonical route owner for `/app/search`, `/app/discover`, Discover categories, details, and browser navigation.
- `frontend/src/search-discover/contracts.ts` is a typed, runtime-inactive boundary. It owns no DOM, network, History API, or Vue mount behavior.

## Typed contract

The first slice locks the current state vocabulary that later Vue owners must preserve:

- Search media types: `tv`, `movie`, `person`, `collection`.
- Discover media types: `tv`, `movie`.
- Search eye state: fade watched, hide watched, hide plan, and hide favorites.
- Search route defaults: empty query, TV media, all eye filters off.
- Discover search defaults: empty query, TV media, page 1, one total page, visible limit 21, not loading.
- Discover hub state: loaded/loading/error, sections, TV/movie genres, and collections.

The contract intentionally mirrors legacy field semantics rather than inventing a new product model during characterization.

## Invariants

- No Search / Discover production renderer moves in this slice.
- No Flask route or API changes.
- No direct browser History API ownership outside `static/js/app-router.js`.
- No change to Search canonical query parameters or person-search eye-filter behavior.
- No change to Discover stability, trending insertion, caching, adult filtering, streaming region, or tracker-state decoration.
- The typed contract remains DOM-free, network-free, global-runtime-free, and inactive in `frontend/src/main.ts` until a bounded renderer migration is separately proven.

## Exit gates for this slice

1. Strict Vue/TypeScript checking includes `frontend/src/search-discover/contracts.ts` and passes.
2. The contract locks the current Search and Discover media vocabularies and default state values.
3. A repository contract proves the current legacy owners remain explicit: state/loaders in `app.js`, renderers in `ui.js`, trending in `trending.js`, routing in `app-router.js`.
4. The typed contract contains no DOM, network, History API, or Vue mounting code.
5. Existing Search navigation, router, Discover stability, adult-filter, and streaming-region regressions continue to pass.
6. The full repository regression suite and diff-hygiene gate pass on the exact PR head.

## Next slice

After this characterization slice is merged and deployed, introduce an explicit read-only bridge/snapshot from the legacy Search state into the typed boundary and select one bounded renderer for parity work. Search results should be considered before the Discover hub because the hub also coordinates stability gating, trending rows, genres, collections, and multiple media sections. Runtime ownership must move once; no permanent dual renderer is allowed.
