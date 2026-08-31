# Frontend Modernization: Watched / Episode Tracking

## Phase position

The watched / episode-tracking modernization phase is complete. History rendering remains a separate completed surface; this phase owns the Vue interaction boundary for individual regular episodes and whole-season watched/unwatched actions while preserving the established mutation semantics.

## Final ownership lock

1. `DATA.shows[showId].episodes_watched` remains the authoritative watched-episode state.
2. `DATA.history` remains the activity/history log updated by the established episode mutation flow; it is not promoted to the primary watched-state store.
3. `app.js` remains the mutation owner of `updateEpisodeWatched`, `markSeasonWatched`, `markNextEpisode`, auto-completion/reopen behavior, History mutations, save calls, and episode-loading requirements.
4. The Episode Tracking state bridge is read-only. It does not mutate tracker state, render DOM, fetch provider data, persist data, or navigate.
5. `frontend/src/episode-tracking/EpisodeTrackingController.vue` is the Vue interaction owner for tracked Show Details episode/season controls and the Episode Details watched toggle. It claims those clicks during capture before dormant legacy target listeners can fire.
6. `frontend/src/episode-tracking/legacyEpisodeTrackingActions.ts` is a typed delegation boundary only. It calls the established legacy mutation functions and preserves the existing success animation; it does not write `DATA`, History, persistence, provider data, or browser navigation.
7. Discovery preview episode/season controls remain explicitly outside this owner because their semantics are "add show and log" rather than mutation of an already tracked show.
8. Watchlist remains a Vue-owned live DOM surface and its next-episode action continues to delegate to the established `markNextEpisode` mutation.
9. `app-router.js` remains the sole browser History API owner.
10. The legacy episode/season target listeners remain physically present only as rollback/readability code until the following legacy-cleanup phase; Vue capture prevents double mutation on migrated surfaces.

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

`frontend/src/episode-tracking/legacyEpisodeTrackingState.ts` is the strict TypeScript read adapter used by the Vue interaction controller. The controller uses that immutable snapshot to identify the tracked show, selected episode, and current watched state before delegating a mutation.

## Vue interaction ownership

The shared Vue entry mounts one hidden `EpisodeTrackingController` for interaction ownership. The controller does not render replacement episode markup; Show Details already has Vue live-DOM ownership, while Episode Details keeps its existing markup composition during this phase.

The controller owns only these mutation interactions:

- tracked Show Details `.episode-check-button` clicks;
- tracked Show Details `.season-all-button` clicks;
- Episode Details `#episode-toggle-watched-button` clicks.

It uses a capture listener plus `stopImmediatePropagation()` after it has positively identified an owned action. This makes the Vue controller the sole interaction dispatcher for those migrated controls while leaving the old target listeners dormant for rollback until cleanup.

Direct canonical episode URLs also load the shared Vue entry, so ownership does not depend on navigating through a Show Details page first.

## Mutation invariants preserved

The existing mutation semantics stay unchanged:

- marking an episode watched may mark earlier aired episodes as watched through the existing flow;
- unaired episodes remain blocked by the existing loggability rules;
- unwatching removes the corresponding History entry only after the existing confirmation path;
- marking a full season watched/unwatched keeps the existing confirmation and imported-special handling;
- watched logging may transition `plan` to `watching` and may auto-complete a show only through the existing verification logic;
- unwatching a regular episode or season may reopen a completed show through the existing rule;
- `saveShowMutation` / `saveData` behavior is unchanged;
- next-episode logging continues through `markNextEpisode` from the Vue-owned Watchlist surface.

## Acceptance contract

`tests/test_frontend_modernization_episode_tracking_state_bridge.js` proves immutable/detached state, special/future handling, selected episode state, and unchanged mutation ownership.

`tests/test_frontend_modernization_episode_tracking_completion.js` proves:

- Vue capture ownership for tracked Show Details episode/season controls;
- Vue capture ownership for the Episode Details watched toggle;
- no interception of discovery preview add-and-log controls;
- no direct `DATA`, History, persistence, provider, or browser-History ownership in the Vue controller/action adapter;
- delegation to `updateEpisodeWatched`, `markSeasonWatched`, and `markNextEpisode`;
- preservation of unwatch confirmation, future/loggability protection, completion/reopen, History, and save ownership;
- dormant legacy listeners remain present only for the next cleanup phase;
- direct episode routes load the shared Vue entry.

## Next phase

Episode Tracking modernization is complete once its exact PR head passes the full CI gate and the merged release passes production regression, deploy, restart, and public-health verification.

The next roadmap phase is legacy frontend cleanup: remove the now-dormant migrated episode-tracking listeners and other proven replacement-era legacy code without changing behavior or ownership.
