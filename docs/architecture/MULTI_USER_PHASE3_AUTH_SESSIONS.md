# Multi-User Accounts — Phase 3 Authentication + Sessions

## Scope

Phase 3 moves authentication from a singleton-only assumption to a UUID-user-aware session boundary while keeping public registration closed.

This phase implements:

- login with one identifier field accepting username or email for `tv_tracker_users` accounts;
- Argon2 password verification through the existing password service;
- account-session generation checks backed by `tv_tracker_users.session_version`;
- normal logout of the current browser;
- **Sign Out All Devices** by atomically incrementing the account session generation;
- password changes requiring the current password and invalidating all existing sessions;
- login throttling by client plus a hashed/normalized identifier key;
- the existing singleton admin as a temporary migration fallback.

This phase does **not** implement:

- public account creation or a signup POST;
- email verification delivery/resend flows;
- forgot/reset-password email;
- email changes;
- username changes for UUID accounts;
- deactivation/reactivation;
- account deletion/recovery;
- TOTP 2FA;
- migration/removal of the legacy singleton admin;
- per-user tracker-data isolation.

Those remain in Phases 4–7.

## Registration remains closed

The Phase 1 registration policy remains authoritative. The existing `/signup` surface continues to show the non-operational **Registration coming soon** state and there is no account-creation POST route.

Phase 3 may authenticate a row that already exists in `tv_tracker_users` (for tests, staged migration, or later phases), but it cannot create one through the public application.

## Transitional authentication order

For `POST /login`:

1. Validate CSRF.
2. Normalize the supplied identifier.
3. Look for a UUID account by `username_normalized` or `email_normalized`.
4. If a UUID account exists, Phase 3 owns the attempt and applies UUID-user password/state/rate-limit/session rules.
5. If no UUID account exists, the request falls through to the existing singleton-admin login route.

This preserves the current owner login until Phase 7 explicitly migrates the owner account and removes the singleton path.

## Session model

The Flask session remains an HTTPS-only, HttpOnly, SameSite=Lax signed cookie, but UUID-user access is server-revocable because every protected request re-resolves the user and compares the cookie session generation with `tv_tracker_users.session_version`.

The client cookie does **not** contain the immutable user UUID. It stores only:

- `authenticated = true`;
- `auth_kind = user`;
- normalized username lookup key;
- an opaque SHA-256 account marker derived from the random UUID + account creation timestamp;
- the current session generation;
- the CSRF token.

The marker prevents a stale session from accidentally attaching to a future account that reuses the same username, while keeping the internal UUID out of the readable signed-cookie payload.

A username change in Phase 4 must recreate/invalidate sessions because the normalized username is the transitional lookup key. Phase 5 can move downstream ownership entirely to the resolved internal UUID without accepting a client-supplied user ID.

## Sign Out All Devices

For UUID accounts, Sign Out All Devices increments `tv_tracker_users.session_version`. Every previously issued browser session therefore fails the next server-side generation check.

For the temporary singleton admin, the same control increments `tv_tracker_admin.session_version`, preserving the existing invalidation model during migration.

Normal **Log Out** clears only the current browser session and does not invalidate other devices.

## Password changes

UUID-user password changes:

- require the current password;
- require matching new-password confirmation;
- use the locked minimum of 10 characters without arbitrary composition rules;
- hash with the existing Argon2 service;
- update the password and increment `session_version` in the same database transaction;
- clear the current browser session and require a new sign-in.

The legacy singleton admin keeps its existing stricter legacy password rule until that account is removed in Phase 7.

Username changes are intentionally not pulled into Phase 3; they remain Phase 4 work.

## Rate limiting

UUID login applies the existing database-backed login throttle to:

- the client key; and
- a derived identifier key.

The identifier itself is not stored in the security-event key. The helper hashes the normalized identifier before persistence so throttling does not create a plaintext login-identifier log.

## Acceptance contract

Phase 3 is acceptable only when tests prove:

- username login succeeds for a UUID account;
- email login resolves the same account;
- the UUID is absent from the client session;
- unknown identifiers still reach the temporary singleton-admin fallback;
- wrong passwords are throttled by client and identifier;
- unverified/non-active accounts cannot enter the application;
- password changes require the current password and invalidate all sessions;
- Sign Out All Devices invalidates the account session generation;
- public registration is still closed and no signup POST exists;
- the existing legacy admin path remains usable until Phase 7.
