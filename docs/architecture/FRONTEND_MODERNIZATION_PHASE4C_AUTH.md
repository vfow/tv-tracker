# Frontend Modernization Phase 4C — Auth Settings

## Scope

Phase 4C makes `/app/settings/auth` the fourth guarded Vue-owned Settings surface, after Streaming, Notifications, and Profile.

This phase changes frontend rendering ownership only. It does not redesign authentication, credential persistence, sessions, CSRF, logout, or the Flask API.

## Ownership boundary

Vue owns:

- the Auth Settings shell and tabs;
- the username/password form markup;
- the logout form markup;
- mount/unmount lifecycle for `/app/settings/auth`.

Existing legacy services remain authoritative for:

- loading the current admin username (`loadAdminAccountIntoSettings`);
- reading the current admin account state (`getAdminAccountUsername`);
- username/password validation and persistence (`saveAdminAccountChanges`);
- password values and credential transport;
- session invalidation after credential changes;
- CSRF-protected logout;
- best-effort client-storage cleanup before logout.

## Security invariants

The Vue component intentionally does not bind password inputs with `v-model` or keep password values in Vue reactive state.

It does not call `fetch`, does not introduce a new `/api/` route, and does not duplicate any authentication transport. Instead, it preserves the exact legacy element IDs consumed by the existing hardened account service functions.

Logout remains a server-side `POST /logout` with the existing CSRF token and must continue even if browser-storage cleanup fails.

## Fallback

`static/js/settings.js` remains the legacy Auth renderer while the guarded canary is active. If the manifest-driven Vue bundle cannot load or attach, the bridge falls back to the legacy renderer.

## Explicitly out of scope

- Data / Backup Settings remain legacy-owned.
- Danger Zone remains legacy-owned.
- `static/js/app.js` is not modified for this phase.
- `static/js/ui.js` is not modified for this phase.
- No backend, database, schema, or tracker-data migration is introduced.

## Exit gate

Phase 4C is ready only when:

1. strict Vue/TypeScript build passes;
2. the real-browser Auth canary proves Vue ownership on `/app/settings/auth`;
3. source contracts prove credential logic remains behind existing services;
4. all existing authentication/session/CSRF/logout tests remain green;
5. the full regression suite passes;
6. the temporary asset-generation workflow is removed before PR review;
7. `app.js` and `ui.js` are absent from the final branch diff.
