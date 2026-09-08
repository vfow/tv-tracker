# Streaming service ownership cleanup

Audited against main `73c31505fd343ffecb044ade7c1a965e8277bf9d`.
`SettingsStreaming.vue` already owns the complete streaming-country interface.
Its data boundary is `TVTrackerStreamingRegion`; profile changes use the existing
`saveData({stateKeys: ['profile']})` durable persistence service. The country and
provider catalogs use the existing TMDB proxy. No backend contract changes.

## Removed disconnected ownership

- `streaming-region.js`: the exported but uncalled `mountStreamingRegionSetting`
  / `mountSetting`, `settingMarkup`, `ensurePickerStyles`, their nested menu,
  validation and event handlers, and the now-unused HTML escaping helper.
- `installProviderRenderGuard` and `emptyMessage`: their only target was the
  obsolete `renderMovieProvidersHTML` composer, now also removed from `ui.js`.
  Native Movie Details panels already handle selected-region provider states.

Repository-wide references showed no production caller of the old Settings
mount. The old test invoked it directly, keeping a disconnected implementation
apparently alive. That test now exercises retained services and rejects a return
of DOM construction, listeners, or the removed export. The shipped-source
absence test also rejects the removed public/global names.

## Retained responsibilities

Region normalization and profile storage; country loading, caching, filtering
and name resolution; shared region getters; optional provider catalog and Browse
request guards; detail request guards; Profile draft/save compatibility wrappers;
provider cache invalidation. These are active services used by Vue and existing
request orchestration. They do not render Settings or Movie Details.

## Concrete failure fixed

Country-load errors previously became an empty successful array, so Vue could
not display its existing failure state or emit `streaming_countries_failed`.
The service now propagates the failure and still clears its in-flight promise.
The next request retries. No request payload is added to diagnostics.

Browser acceptance also exposed a focus bug: selecting an option restored focus
to the country input, whose focus handler immediately reopened the closed menu.
Focus restoration now suppresses that one focus-triggered open while preserving
normal click/focus opening and the existing keyboard behavior.

## Verification and remaining gates

The new browser acceptance uses the committed production bundle and real region
service. It covers country failure/reporting/retry, filtering, keyboard selection,
draft isolation, acknowledgement before success, failed-save rollback, provider
cache invalidation, Escape/Tab, unmount/remount and absence of duplicate UI.
The service test covers failure/retry and existing region/provider/save behavior.
Run full CI on the combined exact head before merge and verify deployment after.

This is one Sprint 3 cleanup. Watchlist control ownership, active Profile/Episode
rendering, the complete function inventory and the later release gates remain
open; this document does not declare the modernization program complete.
