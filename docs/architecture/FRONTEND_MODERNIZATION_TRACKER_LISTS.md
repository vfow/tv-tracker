# Frontend Modernization: Watchlist / Tracker Lists

## Scope

This phase covers the protected tracker-list surfaces rooted at `/app/list/<status>` and the tracked show/movie state that later Vue renderers must preserve.

The first slice is characterization only: establish a strict typed/read-only state boundary before any Vue renderer owns Watchlist DOM or any tracker persistence path changes.

## Current legacy ownership

### Watchlist / show lists

- `static/js/app.js` owns tracker truth in `DATA.shows`, `activeFilter`, the canonical list-route mapping, tracker mutations, durable save orchestration, and the library filter state (`librarySearchQuery`, genre, network, year, and sort).
- `static/js/ui.js` owns `renderShowsPage()`, `renderWatchlist()`, library search/filter controls, sorting/filtering presentation, and the current Watchlist DOM.
- `static/js/app-router.js` remains the sole browser History owner for `/app/list/watching`, `/app/list/paused`, `/app/list/completed`, `/app/list/plan-to-watch`, and `/app/list/dropped`.

The current show status contract is:

- `watching` → `/app/list/watching`
- `paused` → `/app/list/paused`
- `finished` → `/app/list/completed`
- `plan` → `/app/list/plan-to-watch`
- `dropped` → `/app/list/dropped`

The current library sort contract is:

- `default`
- `title-az`
- `title-za`
- `recently-added`
- `recently-watched`
- `rating-desc`
- `year-newest`
- `year-oldest`

### Movies and favorites

- `DATA.movies` remains the authoritative tracked-movie store.
- Movie tracking preserves the existing `watched`, `plan`, and `favorite` flags.
- `DATA.profile.favorite_shows` and `DATA.profile.favorite_movies` remain the authoritative favorite selections and their existing limits/order semantics are unchanged.

## Ownership lock for the migration

Until a later explicit DOM handoff:

1. Legacy `app.js` remains authoritative for tracker data, status changes, watched/plan/favorite mutations, pending-save behavior, and persistence orchestration.
2. Legacy `ui.js` remains authoritative for Watchlist DOM, library controls, filtering, sorting, progress presentation, and watch actions.
3. `app-router.js` remains the sole History API owner.
4. The Tracker Lists state bridge is read-only. It must not mutate tracker state, call save APIs, render DOM, fetch provider data, or navigate.
5. Vue code may consume normalized snapshots only after a bounded renderer/action contract is selected.
6. History and watched/episode tracking remain separate later roadmap phases; this slice does not move those mutation owners.

## First typed boundary

`frontend/src/tracker-lists/contracts.ts` defines the current list status/route/sort vocabulary and normalized tracked-show/tracked-movie summary state.

`static/js/tracker-lists-state-bridge.js` exposes an immutable detached snapshot through `TVTrackerTrackerListsStateBridge` with ownership `legacy-read-only`. The snapshot contains the active list/filter state, tracked show/movie summaries, and detached favorite ID lists without exposing mutable `DATA` objects.

`frontend/src/tracker-lists/legacyTrackerListsState.ts` is the strict TypeScript adapter for that bridge. It is intentionally not imported by `frontend/src/main.ts` in this characterization slice.

## Planned handoff sequence

1. Prove read-only parity for status routes, library search/filter/sort state, tracked show/movie identity, and favorites.
2. Select the bounded Watchlist renderer handoff while keeping `app.js` persistence and mutation semantics authoritative.
3. Preserve existing next-episode/progress presentation, search, genre/network/year filters, sort modes, status changes, favorites, modified-click/detail navigation, and mobile behavior.
4. Move Watchlist DOM ownership to Vue once without moving durable-save or tracker mutation ownership at the same time.
5. Prove parity for Watching, Paused, Completed, Plan To Watch, and Dropped.
6. Extend the bounded contract for movie list presentation where the current product exposes it, without changing tracker-data formats.
7. Remove only the legacy list renderer code that has been proven replaced.
8. Run full regression and production acceptance before moving to History.
