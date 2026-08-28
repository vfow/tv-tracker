# Frontend Modernization Phase 4F — Settings Completion

## Scope

Phase 4F completes the staged Settings migration after Streaming, Notifications, Profile, Auth, Data, and Danger Zone all proved stable under guarded Vue ownership.

The goal is ownership cleanup, not another Settings feature rewrite.

## Final ownership model

- Vue is the only renderer for every current Settings section:
  - Profile
  - Auth
  - Notifications
  - Streaming
  - Data
  - Danger Zone
- `static/js/settings.js` remains only as the small route/state facade required by the existing app router.
- `static/js/settings-vue-bridge.js` is the sole `renderSettings` publisher and delegates every valid Settings render to the complete Vue owner.
- `static/js/settings-vue-loader.js` remains manifest-driven and proactively loads Vue on every supported direct Settings route.
- The per-section canary allowlist and legacy Settings markup/binders are removed.

## Failure behavior

Removing the duplicate renderer does not mean failing silently.

Before the Vue bundle attaches, the bridge renders a bounded loading state. If the manifest or bundle cannot load, the loader reports the existing privacy-safe `vue_settings_load_failed` runtime code and the bridge shows a small `Settings unavailable` state.

The failure path does not restore legacy Settings markup or create dual ownership.

## Preserved service boundaries

Phase 4F does not move persistence, authentication, notification, backup, upload/crop, streaming-region, or destructive-reset behavior into the route facade or bridge.

The existing boundaries remain authoritative, including:

- Profile save/draft/preview and image workflows.
- Auth account loading, credential persistence, logout cleanup, and CSRF behavior.
- Notification rendering/persistence and Push ownership.
- Streaming-region lookup and save behavior.
- Backup summary/export/import/report behavior.
- Tracker reset confirmation and destructive execution.

Earlier phase regression tests continue protecting these service boundaries without requiring the now-removed legacy renderer.

## Routing invariants

The six current Settings routes remain unchanged:

- `/app/settings/profile`
- `/app/settings/auth`
- `/app/settings/notifications`
- `/app/settings/streaming`
- `/app/settings/data`
- `/app/settings/danger-zone`

`/app/settings` continues to canonicalize to Profile, and `/app/notifications/settings` continues to canonicalize to Notifications.

Unknown Settings routes are not broadened.

## Out of scope

Phase 4F does not change:

- `static/js/app.js`
- `static/js/ui.js`
- Flask routes or server composition
- PostgreSQL schema or persistence semantics
- tracker-data or backup formats
- authentication/session semantics
- Push/service-worker behavior
- TMDB/TVmaze/provider behavior
- account deactivation or account deletion availability

No Vue component behavior changes are required in this phase, so the already-committed Phase 4E Vue bundle remains the presentation artifact; Phase 4F changes only the ownership handoff around it.

## Exit gate

Phase 4F is complete when:

1. Legacy Settings markup and binding functions are absent from `static/js/settings.js`.
2. The route/state facade exposes no renderer.
3. The bridge has no legacy-render fallback or per-section canary allowlist.
4. The bridge rejects incomplete Vue owners.
5. Every supported direct Settings route can trigger the manifest loader.
6. Load failure is observable and visibly bounded without dual rendering.
7. All six Vue Settings components and their existing service-boundary contracts remain intact.
8. A real-browser direct Settings route mounts the Vue owner with no loading/failure residue.
9. The full repository regression suite and diff hygiene pass.
