# Frontend Modernization: Media Details

## Scope

This phase covers the protected TV-show and movie detail surfaces reached through `/app/show/<show_key>` and `/app/movie/<movie_key>`.

Show and Movie Details final DOM is Vue-owned. This record describes the current incremental removal of the legacy HTML fragment composition still feeding those Vue surfaces.

## Current ownership

### TV show details

- `static/js/app.js` owns `selectedShowId`, `showDetailPreview`, tracked show data in `DATA.shows`, route/open orchestration, async metadata hydration, save/tracking actions, and active tab state.
- `frontend/src/media-details/ShowDetails.vue` owns the final show-detail DOM.
- `static/js/show-details-vue-bridge.js` builds the immutable renderer model and delegates established interactions after Vue mounts.
- On this branch, poster fallback, metadata, external links, tracker actions, primary tabs, and the similar-title rail are native typed nodes. The Info/Episodes panel remains the only named legacy HTML-fragment dependency.
- `static/js/app-router.js` remains the sole browser History owner.

The renderer-visible tab contract is:

- primary tabs: `Info`, `Episodes`
- Info subtabs: `Cast`, `Crew`, `Details`, `Genres`, `Releases`

### Movie details

- `static/js/app.js` owns `moviePageState`, `selectedMovieId`, route/open orchestration, async metadata hydration, tracking actions, `activeMovieDetailsTab`, and `activeMovieReleaseSort`.
- `frontend/src/media-details/MovieDetails.vue` owns the final movie-detail DOM.
- `static/js/movie-details-vue-bridge.js` still converts named legacy HTML fragments into typed nodes and is the next composition-removal target.
- `static/js/app-router.js` remains the sole browser History owner.

The renderer-visible contract is:

- tabs: `Info`, `Cast`, `Crew`, `Details`, `Genres`, `Releases`
- release sorting: `date`, `country`

## Ownership lock for the migration

1. Legacy `app.js` remains authoritative for Media Details state, requests, tracking mutations, and orchestration.
2. Vue is the sole final Show/Movie Details DOM owner.
3. `app-router.js` remains the sole History API owner.
4. The Media Details state bridge is read-only. It must not mutate legacy state, fetch data, render DOM, or navigate.
5. Existing APIs, TMDB identity, provider behavior, tracker truth, watched state, and save semantics remain unchanged.
6. A legacy fragment composer is deleted only after no Vue bridge or retained legacy surface calls it.

## Typed boundaries

`frontend/src/media-details/contracts.ts` defines the renderer-facing shell state for show and movie pages, including normalized identity, title/artwork/date/rating summary fields and the exact current tab/sort enums.

`static/js/media-details-state-bridge.js` exposes an immutable detached snapshot of the current legacy show or movie detail state through `TVTrackerMediaDetailsStateBridge` with ownership `legacy-read-only`.

`frontend/src/media-details/legacyMediaDetailsState.ts` is the strict TypeScript adapter for that bridge. The Vue renderers consume immutable view models through their dedicated runtime bridges.

`static/js/media-details-node-model.js` provides sanitized typed node constructors during the incremental conversion. New bridge composition must use `text()` / `element()` directly; parsing legacy HTML through `fragment()` is temporary and must disappear after the remaining tab panels migrate.

## Remaining sequence

1. Replace the remaining Show Info/Episodes panel HTML fragment with typed native data/nodes.
2. Replace Movie chrome and tab-panel fragment composition with typed native data/nodes.
3. Remove `fragment()` and the HTML parser once no Details bridge calls it.
4. Delete only fragment composers and callers proven dead across the repository.
5. Preserve routes, modified clicks, back-stack semantics, tabs, release sorting, adult filtering, provider-region behavior, tracker actions, and watched state.
6. Run full regression, exact-head CI, deployment, and production verification before declaring Sprint 2A complete.
