# Frontend Modernization: Media Details

## Scope

This phase covers the protected TV-show and movie detail surfaces reached through `/app/show/<show_key>` and `/app/movie/<movie_key>`.

The first slice is characterization only: establish a strict typed/read-only state boundary before any Vue renderer owns Media Details DOM.

## Current legacy ownership

### TV show details

- `static/js/app.js` owns `selectedShowId`, `showDetailPreview`, tracked show data in `DATA.shows`, route/open orchestration, async metadata hydration, save/tracking actions, and active tab state.
- `static/js/ui.js` owns the show-detail DOM renderer and its Info/Episodes and Info-subtab rendering.
- `static/js/app-router.js` remains the sole browser History owner.

The renderer-visible tab contract is:

- primary tabs: `Info`, `Episodes`
- Info subtabs: `Cast`, `Crew`, `Details`, `Genres`, `Releases`

### Movie details

- `static/js/app.js` owns `moviePageState`, `selectedMovieId`, route/open orchestration, async metadata hydration, tracking actions, `activeMovieDetailsTab`, and `activeMovieReleaseSort`.
- `static/js/ui.js` owns the movie-detail DOM renderer.
- `static/js/app-router.js` remains the sole browser History owner.

The renderer-visible contract is:

- tabs: `Info`, `Cast`, `Crew`, `Details`, `Genres`, `Releases`
- release sorting: `date`, `country`

## Ownership lock for the migration

Until a later explicit DOM handoff:

1. Legacy `app.js` remains authoritative for Media Details state, requests, tracking mutations, and orchestration.
2. Legacy `ui.js` remains authoritative for Media Details DOM.
3. `app-router.js` remains the sole History API owner.
4. The Media Details state bridge is read-only. It must not mutate legacy state, fetch data, render DOM, or navigate.
5. Vue code may consume normalized snapshots only after a bounded renderer slice is selected.

## First typed boundary

`frontend/src/media-details/contracts.ts` defines the renderer-facing shell state for show and movie pages, including normalized identity, title/artwork/date/rating summary fields and the exact current tab/sort enums.

`static/js/media-details-state-bridge.js` exposes an immutable detached snapshot of the current legacy show or movie detail state through `TVTrackerMediaDetailsStateBridge` with ownership `legacy-read-only`.

`frontend/src/media-details/legacyMediaDetailsState.ts` is the strict TypeScript adapter for that bridge. It is intentionally not mounted by `frontend/src/main.ts` in this characterization slice.

## Planned handoff sequence

1. Prove read-only bridge parity for show and movie detail shell state.
2. Select the smaller bounded renderer surface after reviewing coupling and action semantics.
3. Build Vue renderer/view-model while keeping provider requests and tracking mutations in legacy orchestration.
4. Preserve routes, modified-click behavior, back-stack semantics, tabs, release sorting, adult filtering, provider-region behavior, and tracker actions.
5. Move DOM ownership once for the selected surface.
6. Remove only the legacy renderer code replaced by that handoff.
7. Repeat for the second Media Details surface.
8. Run full regression and production acceptance before moving to Upcoming.
