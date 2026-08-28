# Frontend Modernization Phase 4B — Profile Settings Vue Canary

## Decision

Profile becomes the third guarded Vue-owned Settings section after Streaming and Notifications. This phase does not rewrite the existing profile services. Vue owns the Profile Settings DOM and lifecycle while the established JavaScript functions remain the canonical service boundaries for draft creation, avatar/header preview and upload/crop behavior, profile persistence, and adult-filter refresh.

## Guarded ownership

The Settings Vue bridge now allows exactly these canary sections in sequence: `streaming`, `notifications`, and `profile`. Auth, Data, and Danger Zone remain legacy-owned. Before the Vue bundle attaches, the existing Settings renderer remains the fallback for Profile. Lazy-load failures therefore leave the legacy Profile UI available.

The Profile component preserves the legacy element IDs required by the existing avatar/header helpers. This is a deliberate compatibility bridge; it avoids moving upload/crop logic and Profile DOM ownership in the same release.

## Sensitive-file boundary

Phase 4B must not modify `static/js/app.js` or `static/js/ui.js`. The existing `saveProfileSettings()` function in `app.js` remains the only Profile persistence boundary used by the new component. The existing Profile draft, preview, avatar upload/crop, and header upload/crop functions in `ui.js` remain in place and are called through their current global interfaces.

No API, Flask route, database schema, tracker-data format, backup format, or authentication behavior changes in this phase.

## Rollback

Rollback is code-only. Removing Profile from the guarded Vue allowlist returns `/app/settings/profile` to the existing legacy renderer. Because no schema or data contract changes are introduced, no database rollback is required.

## Removal gate

The legacy Profile renderer and compatibility helper IDs must remain until real-browser coverage proves Profile mounting and the avatar/header/persistence bridge is stable in production. A later phase may migrate those helper implementations into typed frontend modules, but that is explicitly out of scope for this canary.
