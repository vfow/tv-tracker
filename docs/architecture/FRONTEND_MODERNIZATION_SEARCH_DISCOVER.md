# Frontend Modernization — Search / Discover

Status: Vue Search renderer ownership is production-verified; legacy Search DOM renderer cleanup active

Production baseline: `c70325d247ddc9d583a1bf78a73ce2b8fdc3f5da` (PR #67 / deploy #143)

## Goal

Migrate Search / Discover incrementally to Vue 3 + TypeScript without changing canonical URLs, TMDB identity, search media semantics, adult filtering, eye-filter behavior, tracker labels, streaming-region behavior, Discover stability, or Back/Forward behavior.

The characterization, read-only state bridge, and Vue Search renderer ownership slices are complete in production. The current cleanup removes only the now-inert legacy Search DOM renderer/card wiring while preserving legacy Search state, requests, filtering semantics, route generation, detail-opening actions, and shared helpers still used by Vue or Discover.

## Current runtime owners

- `static/js/app.js` continues to own Search / Discover state, Search orchestration, provider requests, Discover hub loading, category state, and the current `shouldShowDiscoverHub` decision.
- `static/js/search-state-bridge.js` preserves the detached read-only `TVTrackerSearchStateBridge` snapshot and now also owns the bounded Search renderer handoff/model adapter through `TVTrackerSearchVueBridge`.
- `frontend/src/search-discover/SearchResults.vue` owns the runtime DOM for Search result tabs, eye-filter controls, TV/movie result grids, person results, collection results, loading/empty states, and VIEW MORE.
- `frontend/src/search-discover/searchViewModel.ts` owns the strict TypeScript renderer model/action contract.
- `static/js/ui.js` continues to own the Discover hub renderer, Discover stability gate, and shared Search navigation/filter helpers still consumed by the Vue bridge. The legacy Search DOM renderer/card functions have been removed.
- `static/js/trending.js` continues to own trending-feed configuration, cache/load behavior, hub-row merging, and trending full-page behavior.
- `static/js/app-router.js` remains the sole canonical browser route/History owner.

## Typed contract

The phase preserves the existing Search / Discover vocabulary:

- Search media types: `tv`, `movie`, `person`, `collection`.
- Discover media types: `tv`, `movie`.
- Search eye state: fade watched, hide watched, hide plan, and hide favorites.
- Search route defaults: empty query, TV media, all eye filters off.
- Discover search defaults: empty query, TV media, page 1, one total page, visible limit 21, not loading.
- Discover hub state: loaded/loading/error, sections, TV/movie genres, and collections.

The new Search renderer model intentionally mirrors existing runtime semantics rather than introducing a second product model.

## Read-only Search state bridge

`TVTrackerSearchStateBridge` remains intentionally narrow. Each `snapshot()` call returns a new frozen primitive-only object containing:

- `query`
- `media`
- `fadeWatched`
- `hideWatched`
- `hidePlan`
- `hideFavorites`

The mutable legacy `searchRouteState` object is never exposed directly through this API.

## Vue Search renderer handoff

`TVTrackerSearchVueBridge` is the runtime Search rendering entry point for this slice. It:

1. receives the same `resultsList` previously sent to `ui.js`;
2. reads the authoritative legacy `discoverSearchState`;
3. applies the same media selection, visible-limit, eye-filter and pagination decisions;
4. converts visible results into frozen typed view-model items;
5. preserves existing route helpers and detail-opening actions;
6. lazy-loads the existing Vite `frontend/src/main.ts` bundle;
7. hands the model to the Vue owner;
8. exposes only a bounded loading/failure shell while the Vue bundle is unavailable.

The Vue component renders the established CSS classes and data attributes so current styling, eye-filter delegation, modified-click behavior, and navigation semantics remain intact.

## Search parity preserved in this slice

- TV result cards and show-detail opening.
- Movie result cards, adult badge, and movie-detail opening.
- Person result cards and person-detail opening.
- Collection cards, poster stacks, counts, and collection-detail opening.
- Search media tabs.
- Fade watched / hide watched / hide plan / hide favorites controls for TV/movie.
- Inactive eye control for person/collection.
- Prompt, loading, results, filtered-empty, and no-provider-result states.
- Visible batch size 21 and VIEW MORE behavior.
- Direct URLs, canonical routes, modified-click browser behavior, and Search back-route locking.
- Existing adult filtering and tracker decoration upstream of the renderer.

## Invariants

- No Flask route, API, database, or schema changes.
- No direct browser History API ownership outside `static/js/app-router.js`.
- `app.js` remains the Search state/request/orchestration owner.
- Vue owns Search result DOM only; it does not fetch TMDB/provider data directly.
- Search result navigation continues through the existing route/detail functions.
- Discover remains legacy-owned in this slice.
- Trending, Discover stability, streaming region, and Discover cache behavior are unchanged.
- `TVTrackerSearchStateBridge` remains detached/read-only even though the same bridge file now also hosts the Vue renderer handoff.
- The legacy `ui.js` Search DOM renderer/card functions are absent and must not be reintroduced; Vue remains the sole Search DOM owner.

## Exit gates for this slice

1. Strict Vue/TypeScript checking includes `SearchResults.vue` and the Search view-model contract.
2. VM regression coverage proves TV, movie, person, and collection view-model parity.
3. VM regression coverage proves eye-filtered empty-state wording, loading/prompt states, pagination, and existing detail-opening actions.
4. The Vue renderer contains no provider `fetch()` and no browser History writes.
5. `window.renderSearchResults` is replaced by the Vue bridge after legacy state/orchestration exists.
6. Existing Search navigation, router, Discover stability, adult-filter, streaming-region, and full frontend regressions continue to pass.
7. The full repository regression suite and diff-hygiene gate pass on the exact PR head.
8. Production deployment, restart, and public health verification pass after merge.

## Cleanup gate

The cleanup removes `renderSearchResults`, `renderSearchTabButtonHTML`, `renderSearchResultPosterCard`, and `renderSearchPersonCard` from `static/js/ui.js`. Shared helpers such as `lockSearchRouteBeforeResultOpen` and eye-filter logic remain because the Vue bridge still consumes them. Source contracts now assert Vue/bridge ownership directly instead of requiring the legacy renderer to exist.

## Next slice

Begin the bounded Discover migration with a typed/read-only hub model before moving Discover DOM ownership. Keep the existing Discover stability gate and renderer authoritative until parity is proven. Runtime ownership must continue to move once; no permanent competing renderer is allowed.
