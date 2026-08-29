# Frontend Modernization — Search / Discover

Status: characterization is complete in production; read-only legacy Search state bridge slice active

Production baseline: `01cffbdac657b6fc8c4b556c1eb1b4fb20d4b924` (PR #65 / deploy #141)

## Goal

Migrate Search / Discover incrementally to Vue 3 + TypeScript without changing canonical URLs, TMDB identity, search media semantics, adult filtering, eye-filter behavior, tracker labels, streaming-region behavior, Discover stability, or Back/Forward behavior.

The characterization slice is complete in production. The current slice introduces a deliberately narrow read-only bridge from the legacy Search route/filter state into the typed boundary. It does not mount a Search / Discover Vue surface and it does not replace any legacy renderer.

## Current runtime owners

- `static/js/app.js` owns Search / Discover state, Search orchestration, Discover hub loading, category state, and the current `shouldShowDiscoverHub` decision.
- `static/js/ui.js` owns the current Search result renderer, Discover hub renderer, Discover stability gate, and their interaction wiring.
- `static/js/trending.js` owns trending-feed configuration, cache/load behavior, hub-row merging, and trending full-page behavior.
- `static/js/app-router.js` remains the canonical route owner for `/app/search`, `/app/discover`, Discover categories, details, and browser navigation.
- `static/js/search-state-bridge.js` exposes one read-only snapshot of the current legacy Search route/filter state. It owns no DOM, network, History API, renderer, or mutation path.
- `frontend/src/search-discover/contracts.ts` remains the pure typed Search / Discover state vocabulary.
- `frontend/src/search-discover/legacySearchState.ts` is the typed adapter for the read-only legacy Search snapshot. It remains unmounted in `frontend/src/main.ts` until a bounded Search renderer migration is separately proven.

## Typed contract

The first slice locked the current state vocabulary that later Vue owners must preserve:

- Search media types: `tv`, `movie`, `person`, `collection`.
- Discover media types: `tv`, `movie`.
- Search eye state: fade watched, hide watched, hide plan, and hide favorites.
- Search route defaults: empty query, TV media, all eye filters off.
- Discover search defaults: empty query, TV media, page 1, one total page, visible limit 21, not loading.
- Discover hub state: loaded/loading/error, sections, TV/movie genres, and collections.

The contract intentionally mirrors legacy field semantics rather than inventing a new product model during migration.

## Read-only Search state bridge

The current bridge exposes exactly the state needed to characterize a future Search renderer handoff:

- `query`
- `media`
- `fadeWatched`
- `hideWatched`
- `hidePlan`
- `hideFavorites`

Each call returns a newly created frozen object containing primitives only. The bridge never exposes the mutable legacy `searchRouteState` object itself. Later Vue code must read through the typed adapter rather than reaching into legacy globals directly.

The bridge is intentionally not a renderer and not a state owner. Search mutations continue to occur through the existing legacy Search/routing behavior during this slice.

## Invariants

- No Search / Discover production renderer moves in this slice.
- No Flask route or API changes.
- No direct browser History API ownership outside `static/js/app-router.js`.
- No change to Search canonical query parameters or person-search eye-filter behavior.
- No change to Discover stability, trending insertion, caching, adult filtering, streaming region, or tracker-state decoration.
- The legacy bridge is read-only, DOM-free, network-free, renderer-free, and navigation-free.
- The typed adapter remains unmounted in `frontend/src/main.ts` until bounded Search renderer parity is proven.
- Runtime ownership must move once; no permanent dual renderer is allowed.

## Exit gates for this slice

1. `static/js/search-state-bridge.js` loads after `app.js`, when the authoritative legacy Search state exists.
2. The bridge snapshot matches the current Search route/filter state for TV, movie, person, and collection modes.
3. Every returned snapshot is detached from the mutable legacy object and frozen.
4. `frontend/src/search-discover/legacySearchState.ts` type-checks strictly and converts the bridge snapshot into `SearchRouteState`.
5. Neither bridge layer owns DOM rendering, network requests, browser History, or Vue mounting.
6. `app.js` and `ui.js` remain the Search state/orchestration and renderer owners respectively.
7. Existing Search navigation, router, Discover stability, adult-filter, and streaming-region regressions continue to pass.
8. The full repository regression suite and diff-hygiene gate pass on the exact PR head.

## Next slice

After this bridge slice is merged and deployed, select the bounded Search results renderer for Vue parity work. Preserve TV, movie, person, and collection behavior plus eye filters, adult filtering, tracker decoration, loading/empty/error states, direct URLs, refresh, and Back/Forward. Only after parity is proven should Search renderer ownership move from `ui.js` to Vue and the replaced legacy renderer be deleted. Discover remains legacy-owned until Search is stable because the Discover hub coordinates stability gating, trending rows, genres, collections, and multiple media sections.
