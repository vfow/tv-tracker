# Upcoming + Notifications Vue-native composition

Upcoming and Notifications now use structured view models rendered natively by Vue.

## Ownership

- `app.js` remains authoritative for Upcoming schedule selection, ordering, release timing, loggability, background refresh, and episode mutation services.
- `notifications-runtime.js` remains authoritative for notification settings, live notification polling/toasts, unread state services, and shared relative-time behavior. When polling detects new data on the active Notifications page, it requires `TVTrackerUpcomingNotificationsVueBridge` with `ownership: "vue-dom"` and dispatches directly to that bridge. Polling commits the fetched notification version only when the bridge explicitly reports a completed Vue render; missing, invalid, or not-ready ownership remains retryable and never invokes the legacy fallback renderer.
- `upcoming-notifications-vue-bridge.js` owns DOM-free Upcoming view-model composition, including private same-show/season/date batch grouping and batch-key composition, and the Notifications page data request/interaction boundary. Its explicit `renderNotificationsPage()` entrypoint returns `true` after rendering the ready, empty, or existing Vue error model, and `false` when no Vue owner can render. API failures select the error model, but owner render exceptions remain outside that recovery boundary and propagate so polling can retry.
- The typed Vue owner itself returns `false` when its target root is absent and `true` only after mounting and recording the active Vue app/root. The bridge stores the model and binds interactions only after that explicit success result.
- `UpcomingNotificationsSurface.vue` owns the live Upcoming and Notifications page DOM. It does not use `v-html`.
- `app-router.js` remains the sole browser History/route owner and no longer writes the Upcoming skeleton directly into `#show-list`.

## Retired legacy ownership

- `ui.js` no longer owns `renderUpcoming(startBackgroundRefresh=true)`.
- `ui.js` no longer owns `renderUpcomingBatchEpisodesHTML(show,episodes)`.
- `ui.js` no longer owns `prepareUpcomingDisplayItems(items)` or `getUpcomingBatchKey(show, episode)`; batching composition is private to the structured Upcoming bridge.
- The obsolete `renderUpcomingMediaRowSkeletonHTML()` and `renderUpcomingSkeletonHTML()` helpers have been removed from `ui.js`; Upcoming loading DOM is owned by `UpcomingNotificationsSurface.vue`.
- The Notifications page no longer relies on `notifications-runtime.js` to compose page HTML before Vue renders it.

## Preserved behavior

The migration preserves group and item ordering, adjacent and non-adjacent same-date batches, authoritative schedule objects, batch episode arrays and IDs, batch expansion, NEW badges, episode routes, release/loggability checks, quick-log actions, background schedule refresh, notification unread-dot refresh, notification read-all/list/delete APIs, swipe-delete behavior, and notification settings navigation. Batch composition does not mutate schedule inputs.

Regression ownership contracts now assert the structured Upcoming bridge for loading/background-refresh behavior and explicitly reject restoration of the retired `ui.js` renderer or router skeleton write. Executable polling coverage proves that an active Notifications page commits a fresh version only after explicit Vue render success, a not-ready or invalid bridge leaves that version retryable without legacy API or DOM fallback, and an inactive page keeps the runtime-owned live-toast behavior without invoking either renderer.
