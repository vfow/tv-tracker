# Frontend Modernization: Watched / Episode Tracking

## Phase position

This is the Phase 14 watched / episode-tracking modernization boundary. History rendering is already migrated separately; this phase owns the interaction and state that marks individual regular episodes or whole seasons watched/unwatched.

## Current ownership lock

1. `DATA.shows[showId].episodes_watched` remains the authoritative watched-episode state.
2. `DATA.history` remains the activity/history log updated by the established episode mutation flow; it is not promoted to the primary watched-state store.
3. `app.js` remains the owner of `updateEpisodeWatched`, `markSeasonWatched`, `markNextEpisode`, auto-completion/reopen behavior, History mutations, save calls, and episode-loading requirements.
4. The Episode Tracking state bridge is read-only. It must not mutate tracker state, render DOM, fetch provider data, persist data, or navigate.
5. `app-router.js` remains the sole browser History API owner.
6. Episode detail/show detail rendering ownership is unchanged in this characterization slice.

## Read-only state boundary

`static/js/episode-tracking-state-bridge.js` exposes a frozen `window.TVTrackerEpisodeTrackingStateBridge` with `ownership: "legacy-read-only"`.

A snapshot is detached from live tracker data and contains:

- tracked show identity, title, status, and completion timestamp;
- every season known by either `episodes_watched` or `_episode_list`;
- sorted watched episode numbers per season;
- known episode title, air date, watched state, loggable state, and special marker;
- whether all currently loggable regular episodes in a season are watched;
- the currently selected episode context when it belongs to the requested show.

The bridge deliberately includes watched episode numbers that are not currently present in `_episode_list`, so incomplete provider metadata cannot hide authoritative local watched state.

`frontend/src/episode-tracking/legacyEpisodeTrackingState.ts` provides the strict TypeScript adapter. It is intentionally not imported by `frontend/src/main.ts` yet; no Vue renderer takes episode-tracking ownership in this slice.

## Mutation invariants preserved

The existing mutation semantics stay unchanged:

- marking an episode watched may mark earlier aired episodes as watched through the existing flow;
- unaired episodes remain blocked by the existing loggability rules;
- unwatching removes the corresponding History entry only after the existing confirmation path;
- marking a full season watched/unwatched keeps the existing confirmation and imported-special handling;
- watched logging may transition `plan` to `watching` and may auto-complete a show only through the existing verification logic;
- unwatching a regular episode or season may reopen a completed show through the existing rule;
- `saveShowMutation` / `saveData` behavior is unchanged.

## Handoff sequence

1. Characterize watched/episode state through this immutable boundary.
2. Move the visible episode-tracking controls behind a Vue-owned surface without changing mutation semantics.
3. Delegate Vue interactions back to the established mutation functions until parity is proven.
4. Add focused parity tests for individual episode watch/unwatch, season watch/unwatch, next-episode logging, completion/reopen, and unavailable/future episodes.
5. Remove migrated legacy rendering/listener code only in the later legacy-cleanup phase after replacement ownership is proven.
