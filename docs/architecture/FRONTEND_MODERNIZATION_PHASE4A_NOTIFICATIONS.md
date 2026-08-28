# Frontend Modernization Phase 4A — Notifications Settings Vue Canary

## Scope

Phase 4A expands the guarded Settings Vue migration from Streaming to Notifications without changing backend routes, database schema, tracker data, push delivery, service-worker ownership, or notification persistence semantics.

## Ownership boundary

- Vue owns the `/app/settings/notifications` Settings shell, tab navigation, mount lifecycle, and the DOM container used for notification controls.
- `static/js/notifications-runtime.js` remains the canonical owner of notification settings transport, switch behavior, Push permission/subscription flows, service-worker integration, timezone synchronization, disabled-state rules, and user feedback.
- The existing legacy `settings.js` Notifications renderer remains the fallback until the Vue owner attaches successfully.
- The existing Streaming Vue canary remains unchanged.
- Profile, Auth, Data, and Danger Zone remain legacy-owned.
- `static/js/app.js` and `static/js/ui.js` are intentionally outside this phase.

## Failure behavior

The Settings bridge first renders the legacy fallback and requests the manifest-driven Vue owner. If the manifest or Vue bundle fails to load, the legacy Notifications surface remains usable and `vue_settings_load_failed` is reported through the privacy-safe client telemetry path.

If the Vue Notifications shell mounts but the canonical notification runtime is unavailable, the shell shows a temporary-unavailable state and emits only the coarse `vue_notifications_runtime_unavailable` diagnostic. No user notification preferences or browser Push material are included in that diagnostic.

## Multi-section Vue guard

Phase 4A is the first release where two Settings sections can be Vue-owned. The Vue owner therefore tracks the currently mounted Settings section as well as the root element. Switching between Streaming and Notifications forces a component remount instead of incorrectly reusing the previous section's Vue application.

## Data and security invariants

- Notification settings still use the existing authenticated, CSRF-protected `/api/notifications/settings` boundary.
- Push configuration, subscription, unsubscribe, device presence, and service-worker behavior remain in the existing hardened runtime.
- No database migration is introduced.
- No tracker-state or backup format changes are introduced.
- No Node dependency becomes a production server runtime dependency.

## Verification

Phase 4A must pass strict Vue/TypeScript build verification, deterministic hashed asset checks, the full Python/Node regression suite, and a real-Chrome test that authenticates directly into `/app/settings/notifications`, proves the Vue ownership marker is present, and proves the canonical notification controls render inside it.
