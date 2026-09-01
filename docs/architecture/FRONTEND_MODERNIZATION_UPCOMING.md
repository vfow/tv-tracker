# Upcoming + Notifications Vue-native composition

Upcoming and Notifications now use structured view models rendered natively by Vue.

## Ownership

- `app.js` remains authoritative for Upcoming schedule selection, ordering, release timing, loggability, background refresh, and episode mutation services.
- `notifications-runtime.js` remains authoritative for notification settings, live notification polling/toasts, unread state services, and shared relative-time behavior.
- `upcoming-notifications-vue-bridge.js` is a DOM-free composition boundary for Upcoming data and the Notifications page data request/interaction boundary.
- `UpcomingNotificationsSurface.vue` owns the live Upcoming and Notifications page DOM. It does not use `v-html`.
- `app-router.js` remains the sole browser History/route owner and no longer writes the Upcoming skeleton directly into `#show-list`.

## Retired legacy ownership

- `ui.js` no longer owns `renderUpcoming(startBackgroundRefresh=true)`.
- `ui.js` no longer owns `renderUpcomingBatchEpisodesHTML(show,episodes)`.
- The non-owning `renderUpcomingSkeletonHTML()` helper remains temporarily for final `ui.js` cleanup, but the router no longer uses it for the live Upcoming route.
- The Notifications page no longer relies on `notifications-runtime.js` to compose page HTML before Vue renders it.

## Preserved behavior

The migration preserves group ordering, batch expansion, NEW badges, episode routes, release/loggability checks, quick-log actions, background schedule refresh, notification unread-dot refresh, notification read-all/list/delete APIs, swipe-delete behavior, and notification settings navigation.

Regression ownership contracts now assert the structured Upcoming bridge for loading/background-refresh behavior and explicitly reject restoration of the retired `ui.js` renderer or router skeleton write.
