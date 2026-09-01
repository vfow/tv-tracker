# Frontend Modernization: Watchlist / Tracker Lists

## Scope

The protected `/app/list/<status>` surfaces now use a Vue-native structured view model. Tracker truth and mutations remain in the proven legacy service layer; legacy Watchlist HTML composition is no longer part of the runtime path.

## Current ownership

Legacy `app.js` remains authoritative for tracker data, mutations, durable save orchestration, list/filter state, and persistence semantics.

- `static/js/app.js` remains authoritative for `DATA.shows`, tracker mutations, durable save orchestration, list/filter state, and persistence semantics.
- `static/js/tracker-lists-state-bridge.js` is a read-only boundary. Its `viewModel()` reuses the established read-only filter/sort/progress helpers and produces structured card/action/empty-state data without touching the DOM, network, storage, or navigation.
- `frontend/src/tracker-lists/TrackerListsSurface.vue` is the Vue-native Watchlist renderer. It renders the existing Watchlist classes and action affordances without `v-html`.
- `static/js/upcoming-notifications-vue-bridge.js` publishes the Watchlist render entrypoint and mutation actions, but no longer captures or stages the legacy `renderWatchlist` HTML composer.
- `app-router.js` remains the sole History API owner.

The Tracker Lists state bridge is read-only. It does not own tracker truth, mutations, persistence, DOM navigation, or provider requests.

## Preserved behavior

The five canonical status routes remain:

- `watching` → `/app/list/watching`
- `paused` → `/app/list/paused`
- `finished` → `/app/list/completed`
- `plan` → `/app/list/plan-to-watch`
- `dropped` → `/app/list/dropped`

The existing library query/genre/network/year/sort selection continues to flow through `getWatchlistShowsForCurrentView()`, including the established adult-filter read-time wrapper. Next-episode text, completed/dropped presentation, new-episode badges, poster fallbacks, routes, and action availability are mapped into the structured view model using the existing domain helpers.

Mutation ownership is unchanged:

- `mark` delegates to `markNextEpisode` after the existing success animation;
- `watching` delegates to `updateShowStatus(..., "watching")`;
- durable save/pending-save behavior remains in the established services.

## Completion status

The Watchlist Vue-native structured view model is complete. The legacy Watchlist HTML composer has been removed from `ui.js`, and the detached `composeWatchlistHTML()` staging path has been removed from the runtime bridge. Vue is both the composition renderer and final live DOM owner, while tracker truth and persistence remain unchanged.

Every completion head must still pass exact-head repository CI and production deployment/restart/public-health verification before this ownership reduction is considered production-proven.
