# Frontend Modernization: Watchlist / Tracker Lists

## Scope

This phase covers the protected tracker-list surfaces rooted at `/app/list/<status>` and the tracked show/movie state that Vue renderers must preserve.

The read-only characterization slice is complete in production. The current bounded slice moves only the final Watchlist DOM handoff to Vue while keeping tracker state, filtering, sorting, actions, and durable persistence in the proven legacy owners.

## Current ownership

### Watchlist / show lists

- `static/js/app.js` owns tracker truth in `DATA.shows`, `activeFilter`, the canonical list-route mapping, tracker mutations, durable save orchestration, and the library filter state (`librarySearchQuery`, genre, network, year, and sort).
- `static/js/ui.js` continues to compose the established Watchlist markup, next-episode/progress presentation, empty states, library controls, filtering, and sorting.
- `static/js/upcoming-notifications-vue-bridge.js` now captures that composed Watchlist markup and hands it to the already-built generic Vue `#show-list` HTML owner. Vue is therefore the final runtime DOM owner for Watchlist after the handoff.
- The same runtime bridge rebinds the existing Watchlist action semantics after Vue mounts: `mark` delegates to `markNextEpisode`, and `watching` delegates to `updateShowStatus`.
- `refreshWatchlistShows` deliberately becomes a full Watchlist rerender in this bounded ownership slice so legacy partial-DOM reuse cannot compete with Vue ownership.
- `static/js/app-router.js` remains the sole browser History owner for `/app/list/watching`, `/app/list/paused`, `/app/list/completed`, `/app/list/plan-to-watch`, and `/app/list/dropped`.

The shared Vue shell reuse is intentionally narrow. It reuses only the existing generic `v-html` mount into `#show-list`; it does not give Upcoming business logic ownership over Watchlist. Runtime ownership is marked as `vue-watchlist` after mount.

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
- This Watchlist renderer slice does not invent a new movie-list surface or alter movie persistence.

## Ownership lock for the migration

1. Legacy `app.js` remains authoritative for tracker data, status changes, watched/plan/favorite mutations, pending-save behavior, and persistence orchestration.
2. Legacy `ui.js` remains authoritative for Watchlist markup composition, library controls, filtering, sorting, and progress calculations in this bounded slice.
3. Vue is the final runtime owner of the resulting Watchlist DOM in `#show-list`.
4. `app-router.js` remains the sole History API owner.
5. The Tracker Lists state bridge remains read-only. It must not mutate tracker state, call save APIs, render DOM, fetch provider data, or navigate.
6. No API, database, schema, tracker-data-format, retry-policy, or durable-save semantics change in this handoff.
7. History and watched/episode tracking remain separate later roadmap phases; this slice does not move those mutation owners.

## Typed boundary

`frontend/src/tracker-lists/contracts.ts` defines the current list status/route/sort vocabulary and normalized tracked-show/tracked-movie summary state.

`static/js/tracker-lists-state-bridge.js` exposes an immutable detached snapshot through `TVTrackerTrackerListsStateBridge` with ownership `legacy-read-only`. The snapshot contains the active list/filter state, tracked show/movie summaries, and detached favorite ID lists without exposing mutable `DATA` objects.

`frontend/src/tracker-lists/legacyTrackerListsState.ts` is the strict TypeScript adapter for that bridge. It remains intentionally separate from mutation and DOM ownership in this slice.

## Handoff sequence

1. Read-only parity for status routes, library search/filter/sort state, tracked show/movie identity, and favorites. **Complete.**
2. Bounded Watchlist Vue DOM handoff while keeping legacy tracker state/actions/persistence authoritative. **Current slice.**
3. Prove parity for Watching, Paused, Completed, Plan To Watch, and Dropped, including search, genre/network/year filters, sort modes, next-episode/progress presentation, actions, direct routes, and mobile behavior.
4. Extend the bounded contract for any existing movie-list presentation without changing tracker-data formats.
5. Remove only legacy list-renderer code that has been proven replaced.
6. Run full regression and production acceptance before moving to History.
