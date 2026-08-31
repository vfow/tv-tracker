# Frontend Modernization: Watchlist / Tracker Lists

## Scope

This phase covers the protected tracker-list surfaces rooted at `/app/list/<status>` and the tracked show/movie state that Vue renderers must preserve.

The read-only characterization, Watchlist Vue DOM handoff, and five-status parity slices are complete. This completion slice removes the remaining live-DOM overlap: legacy Watchlist composition still produces the established markup, but it now runs against a detached staging root. Vue is the only owner that writes the composed Watchlist markup into the live `#show-list`.

## Current ownership

### Watchlist / show lists

- `static/js/app.js` owns tracker truth in `DATA.shows`, `activeFilter`, the canonical list-route mapping, tracker mutations, durable save orchestration, and the library filter state (`librarySearchQuery`, genre, network, year, and sort).
- `static/js/ui.js` continues to compose the established Watchlist markup, next-episode/progress presentation, empty states, library controls, filtering, and sorting.
- `static/js/upcoming-notifications-vue-bridge.js` captures that composed Watchlist markup through a detached staging root and hands it to the already-built generic Vue `#show-list` HTML owner. Vue is therefore the final runtime DOM owner for Watchlist after the handoff and the sole writer of Watchlist markup into the live `#show-list`.
- The same runtime bridge rebinds the existing Watchlist action semantics after Vue mounts: `mark` delegates to `markNextEpisode`, and `watching` delegates to `updateShowStatus`.
- `refreshWatchlistShows` deliberately becomes a full Watchlist rerender so legacy partial-DOM reuse cannot compete with Vue ownership.
- `static/js/app-router.js` remains the sole browser History owner for `/app/list/watching`, `/app/list/paused`, `/app/list/completed`, `/app/list/plan-to-watch`, and `/app/list/dropped`.

The detached staging root is intentionally temporary. It exists only while the legacy composition function builds the established HTML; it is removed before Vue renders into the live root. This keeps the proven composition logic available without giving the legacy renderer a live Watchlist DOM ownership role.

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
- The current product does not expose a separate tracker-list movie DOM surface analogous to the five show-status lists, so this phase does not invent one or alter movie persistence.

## Ownership lock for the migration

1. Legacy `app.js` remains authoritative for tracker data, status changes, watched/plan/favorite mutations, pending-save behavior, and persistence orchestration.
2. Legacy `ui.js` remains authoritative for Watchlist markup composition, library controls, filtering, sorting, and progress calculations until the later physical legacy-removal phase.
3. Vue is the final runtime owner of the resulting Watchlist DOM in `#show-list` and the only runtime owner that writes the composed Watchlist markup into the live root.
4. `app-router.js` remains the sole History API owner.
5. The Tracker Lists state bridge is read-only and remains read-only through completion. It must not mutate tracker state, call save APIs, render DOM, fetch provider data, or navigate.
6. No API, database, schema, tracker-data-format, retry-policy, or durable-save semantics change in this handoff.
7. History and watched/episode tracking remain separate later roadmap phases; this slice does not move those mutation owners.

## Typed boundary

`frontend/src/tracker-lists/contracts.ts` defines the current list status/route/sort vocabulary and normalized tracked-show/tracked-movie summary state.

`static/js/tracker-lists-state-bridge.js` exposes an immutable detached snapshot through `TVTrackerTrackerListsStateBridge` with ownership `legacy-read-only`. The snapshot contains the active list/filter state, tracked show/movie summaries, and detached favorite ID lists without exposing mutable `DATA` objects.

`frontend/src/tracker-lists/legacyTrackerListsState.ts` is the strict TypeScript adapter for that bridge. It remains intentionally separate from mutation and DOM ownership.

## Completion status

1. Read-only parity for status routes, library search/filter/sort state, tracked show/movie identity, and favorites. **Complete.**
2. Bounded Watchlist Vue DOM handoff while keeping legacy tracker state/actions/persistence authoritative. **Complete.**
3. Parity for Watching, Paused, Completed, Plan To Watch, and Dropped, including route and library search/filter/sort state. **Complete.**
4. Existing movie tracking behavior characterized without inventing a new movie-list surface. **Complete for the current product surface.**
5. Remove remaining legacy live-DOM ownership while preserving still-required composition logic. **Complete through detached staging.**
6. Full regression and production acceptance for this phase. **Required on the exact completion head before advancing to History.**

After that production gate passes, the Tracker Lists phase is complete. Physical removal or rewrite of the still-required `ui.js` composition helpers belongs to the later legacy frontend removal phase, after equivalent Vue-native composition has been proven.
