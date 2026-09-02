# Frontend Modernization: Media Details

## Scope

This phase covers the protected TV-show and movie detail surfaces reached through `/app/show/<show_key>` and `/app/movie/<movie_key>`.

At baseline `8cfef1b` through PR #108, Show and Movie Details final DOM is Vue-owned. Show Details has full typed composition and its dead HTML composers are removed. Movie Details chrome is directly composed as typed nodes, with one named fragment remaining for the active tab panel.

## Current ownership

### TV show details

- `static/js/app.js` owns `selectedShowId`, `showDetailPreview`, tracked show data in `DATA.shows`, route/open orchestration, async metadata hydration, save/tracking actions, and active tab state.
- `frontend/src/media-details/ShowDetails.vue` owns the final show-detail DOM.
- `static/js/show-details-vue-bridge.js` builds the immutable renderer model and delegates established interactions after Vue mounts.
- `static/js/show-details-vue-bridge.js` directly composes poster fallback, metadata, external links, tracker actions, primary tabs, all five Info subtabs, provider-region states, seasons, episodes, and the similar-title rail as immutable typed nodes. Show Details no longer calls an HTML-fragment composer.
- The audited follow-up physically removed the 27 dead Show Details HTML composers from `static/js/ui.js` and the stale Show provider render wrapper from `static/js/streaming-region.js`.
- `frontend/src/episode-tracking/EpisodeTrackingController.vue` capture-owns tracked episode and season watched actions; matching `ui.js` target handlers remain as dormant fallback.
- Existing `ui.js` binders remain active for other Show interactions, including tabs and season expansion/lazy loading, while established mutation, provider, and routing services remain authoritative.
- `static/js/app-router.js` remains the sole browser History owner.

The renderer-visible tab contract is:

- primary tabs: `Info`, `Episodes`
- Info subtabs: `Cast`, `Crew`, `Details`, `Genres`, `Releases`

### Movie details

- `static/js/app.js` owns `moviePageState`, `selectedMovieId`, route/open orchestration, async metadata hydration, tracking actions, `activeMovieDetailsTab`, and `activeMovieReleaseSort`.
- `frontend/src/media-details/MovieDetails.vue` owns the final movie-detail DOM.
- `static/js/movie-details-vue-bridge.js` directly composes poster fallback, metadata, external links, tracking actions, and all six primary tabs as immutable typed nodes.
- `renderMovieActiveTabContentHTML(movie)` is the sole remaining named fragment dependency; Movie tab-panel behavior and its existing provider/services remain unchanged.
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

`static/js/media-details-node-model.js` provides sanitized typed node constructors during the incremental conversion. Show composition and Movie chrome use `text()` / `element()` directly. Its `fragment()` parser remains only for `renderMovieActiveTabContentHTML(movie)` and must not be removed before Movie tab panels migrate.

## Cleanup sequence

1. COMPLETED: physically remove the audited dead Show HTML composers in PR #108, while retaining Show state, interactions, routing, provider requests, lazy loading, and shared Movie/Discover/Episode helpers.
2. COMPLETED IN THIS SLICE: replace Movie chrome fragment composition with typed native nodes while retaining one active-tab panel fragment.
3. NEXT: replace `renderMovieActiveTabContentHTML(movie)` and its Movie tab panels with typed native nodes without changing panel behavior.
4. AFTER PANELS: remove only Movie HTML composers and callers proven dead across the repository.
5. AFTER CLEANUP: remove `fragment()` and the HTML parser only when no active bridge consumes them.
6. Preserve routes, modified clicks, back-stack semantics, tabs, release sorting, adult filtering, provider-region behavior, tracker actions, and watched state through full regression and production verification.
