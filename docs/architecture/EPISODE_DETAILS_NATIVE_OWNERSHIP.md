# Native Episode Details ownership

Episode Details now uses `EpisodeDetails.vue` and `EpisodePeople.vue` for loading,
error, metadata, navigation, cast and crew composition. No HTML string is passed
into these components. The shared Vue loader mounts a stable model owner; route
close explicitly unmounts it. Request identity guards prevent late bundle or
crew responses from painting another episode or route.

The typed boundary is `episode-details-vue-bridge.js`. It projects existing
canonical episode metadata, air-time rules, watched arrays and History without
changing their truth. `episode-crew.js` remains a provider/cache service, with
normalization and request deduplication, and no DOM observer or HTML writer.
Crew failure uses the existing privacy-safe provider diagnostic boundary.

The existing `EpisodeTrackingController` remains the only watched-action owner.
Its existing state bridge calls `updateEpisodeWatched`; that service retains
the existing durable persistence and rollback behavior. Previous/next/back use
the existing navigation services and router. No backend endpoint changes.

Removed ownership: the episode page composer, skeleton composer, actor/crew/link
HTML helpers, episode tab script and crew DOM observer. Two remaining renderer
callers in database/UI refresh paths now call the native projection. Show detail
listeners are scoped to their own root, and duplicate episode/season mutation
listeners already superseded by the Vue controller are removed. Pointer guards
needed by nested season controls remain.

Verification adds projection/stale-response/History checks and a real compiled
Vue browser fixture at 320, 375 and 1280 pixels. The browser fixture covers
loading/error, escaped metadata, cast/crew keyboard focus, pending save,
acknowledgement, failed unwatch, preview/future restrictions, navigation and
overflow. Provider and save services use isolated synthetic responses.

This is an incremental Sprint 3 slice. Profile home/favorites/crop composition
and the final whole-system audit, torture matrix and release acceptance gates
still require review; this record does not declare the program complete.
