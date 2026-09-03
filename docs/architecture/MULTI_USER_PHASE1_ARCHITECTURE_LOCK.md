# Multi-user Phase 1 architecture lock

Status: **Phase 1 complete only when this audit, the registration rollout guard, its regression test, and normal CI are green.**

Baseline audited from `main` commit `f456f33927509dd67a3026b593af87e7e65e6b48` (PR #121). Database compatibility version is 6. This phase does not create user accounts, migrate production data, or delete the existing administrator.

## Non-negotiable rollout rule

Public registration stays **closed during every development and migration phase**. Phases 1 through 7 may build signup internals/UI, but visitors must not be able to create accounts. Phase 8 may enable registration only as the final release action after the complete production acceptance gate passes.

`tvtracker.auth.registration_policy` is intentionally source-controlled and ignores environment overrides. A deployment setting must not be able to expose incomplete registration.

The current application already has a pre-existing **GET `/signup` placeholder route**. It only selects the `SIGN UP` tab in `templates/login.html`, whose content is `Registration coming soon`, and redirects back to `/login`. There is no account-creation POST endpoint or signup form. Phase 1 preserves that harmless informational surface while explicitly locking actual registration closed.

## Product decisions locked in this phase

- Public signup is eventually open to anyone, but only after Phase 8 acceptance.
- Account identity is email + username + password.
- Every account receives an internal immutable UUID. Email and username may change; the UUID never changes and is the ownership key.
- UUIDs are internal and are not ordinary user-facing identifiers.
- Email addresses are unique. Usernames are unique case-insensitively.
- Username rules: 3-30 characters, letters/numbers/underscore only.
- Password minimum: 10 characters. Do not require arbitrary uppercase/symbol composition rules; reject obviously weak/common compromised passwords where practical.
- Login accepts either username or email plus password.
- New public signups always receive `user`; signup can never grant `admin`.
- The owner's new personal account is explicitly promoted to `admin` during migration.
- No user-management admin panel is part of this rollout. The admin role is a permission foundation only.
- Admin accounts require TOTP authenticator-app 2FA. Normal users may enable TOTP optionally. No SMS dependency.
- Email must be verified before a newly created account can enter the application.
- Verification links expire after 24 hours and can be resent.
- Password-reset links expire after 30 minutes and are single-use.
- Password-reset behavior may directly report that no account exists for an unknown email; account-existence hiding is not a requirement.
- Email changes require the current password, verify the new address before switching, keep the old address active until verification succeeds, and invalidate other sessions after the switch.
- Username changes are allowed while preserving the immutable UUID.
- Security-sensitive password/account changes invalidate all sessions as specified by the later phase implementation.
- Settings will support normal Log Out plus Sign Out All Devices.
- Deactivate Account and Delete Account must both be enabled for real users and both require the current password.
- Deactivation preserves data indefinitely, blocks normal app access, and requires an explicit `Reactivate Account` action after valid credentials.
- Deletion blocks normal app access immediately and starts a 30-day recovery window.
- A pending-deletion account sees an explicit `Cancel Account Deletion` action after valid credentials; it does not silently re-enter the app.
- Email and username remain reserved during the 30-day deletion window. After permanent deletion they may be reused.
- Permanent deletion removes the active account and all user-owned application records. Historical hosting/database backups age out under provider retention rather than being edited in place.
- User data is strictly isolated server-side. A client-supplied `user_id` is never authorization.
- Backups/exports/imports are per-account and must never overwrite another account's data.
- Authentication/email UI must use a configurable product/display name and must not hard-code `TV Tracker` as the eventual product name.
- No Proton alias integration is part of the architecture.

## Observed current authentication/session model

Current authentication is single-user by construction:

- `tv_tracker_admin` contains exactly the singleton administrator row (`singleton_id = 1`) with username, Argon2 password hash, `session_version`, and update timestamp.
- `tvtracker.auth.security.read_admin_account()` caches that singleton globally and per request.
- Authentication checks Flask session `authenticated == True` and compares its `session_version` with the singleton administrator's version.
- `/login` authenticates against that one administrator.
- `/api/admin/account` reads/updates the private administrator credentials.
- `tools/reset_admin.py` can reset or recreate that singleton administrator and increments/initializes session version.
- Login/account-change rate limiting currently stores security events by `event_type` and network/client key rather than account UUID.
- CSRF protection already exists for state-changing authenticated requests and must be retained during conversion.

The legacy administrator and recovery tool stay available until the replacement admin UUID is created, promoted, tested, migrated, and accepted in Phase 7.

## Observed current tracker ownership model

The database is globally scoped today. There is no account ownership column on tracker, notification, or push records.

| Current relation | Current role | Multi-user ownership decision |
| --- | --- | --- |
| `tv_tracker_shows` | Global show library keyed by `show_id` | Add `user_id`; identity becomes (`user_id`, `show_id`). |
| `tv_tracker_history` | Global history keyed by `entry_id` | Add `user_id`; identity becomes (`user_id`, `entry_id`). |
| `tv_tracker_state` | Global JSON state keyed by `state_key` | Add `user_id`; identity becomes (`user_id`, `state_key`). |
| `tv_tracker_meta` | Singleton global revision | One revision row per user. |
| `tv_tracker_changes` | Global revision/change log | Scope revision and operation identity by user. |
| `tv_tracker_notification_settings` | Singleton notification settings | One settings row per user. |
| `tv_tracker_notification_baseline` | Global show notification baseline | Scope by user + show. |
| `tv_tracker_notification_events` | Global detected show events | Scope by user because eligibility is user-library dependent. |
| `tv_tracker_notifications` | Global inbox rows | Add `user_id`; every query is authenticated-user scoped. |
| `tv_tracker_final_notification_settings` | Singleton final notification settings | One row per user while this split remains. |
| `tv_tracker_movie_notification_baseline` | Global movie baseline | Scope by user + movie/region. |
| `tv_tracker_push_subscriptions` | Push subscriptions tied to current admin session version | Add user ownership; prevent cross-account delivery after account switching. |
| `tv_tracker_push_presence` | Device/client presence | Scope by user/device/client. |
| `tv_tracker_push_deliveries` | Push delivery queue/history | Carry user ownership directly or through a user-owned subscription FK. |
| `tv_tracker_security_events` | Short-lived abuse/rate-limit events | Infrastructure may remain global, but account-associated events should use a nullable `user_id`/safe subject key with short retention. |
| `tv_tracker_admin` | Singleton legacy login | Keep through migration; remove in Phase 7 only after replacement acceptance. |
| `tv_tracker_migrations`, `tv_tracker_schema_meta` | Database infrastructure | Remain global; never user-owned. |

`tv_tracker_state` currently contains the user-level keys `profile`, `movies`, `metadata_sync`, `network_sync`, `import_info`, and `provider_metadata` (plus `history_order` maintained by storage code). Therefore movies, favorite shows/movies, avatar/header data, streaming region, adult-filter preference, synchronization state, and provider/import state are all part of the account boundary even though several are not separate SQL tables today.

`read_tracker_data()` currently reads every show, history record, and state key in the database. `replace_tracker_data_transactionally()` currently deletes/replaces every tracker row in those global tables. Both boundaries must accept or derive the authenticated UUID before public multi-user operation is possible.

## Target account/security schema

The exact migration SQL belongs to Phase 2, but responsibilities are locked here.

### `tv_tracker_users`

Required conceptual fields:

- `user_id UUID PRIMARY KEY`, generated server-side.
- display email plus normalized email with a unique constraint.
- display username plus normalized username with a unique constraint.
- `password_hash` using the project's password hashing service.
- `role` constrained to at least `user` / `admin`.
- account status constrained to `unverified`, `active`, `deactivated`, `pending_deletion`.
- `email_verified_at`.
- account/session security version or equivalent revocation generation.
- `deletion_requested_at` and `deletion_due_at` where applicable.
- created/updated timestamps.

Do not use email or username as foreign keys. All owned data points to immutable `user_id`.

### Server-controlled sessions

The target supports server revocation and Sign Out All Devices. Phase 3 introduces account-bound server session records or an equivalent server-authoritative store. Session state contains/resolves the UUID and never trusts a body/query parameter for ownership.

Minimum responsibilities: random opaque credential, user UUID, creation/expiry/revocation timestamps, and enough metadata to invalidate all sessions after security-sensitive changes.

### Verification/reset/email-change tokens

Use dedicated account-token records or an equivalent service storing only a safe hash of the random token. Records are account-bound, purpose-bound, expiring, and single-use where required. Email-change tokens carry the pending new address until verified.

### TOTP

Phase 7 stores user-bound TOTP configuration securely. Admin access is not accepted until required TOTP works. Include a safe recovery path such as one-time recovery codes before enforcement can lock the administrator out.

## Authorization boundary

The server derives the active UUID from the authenticated session. APIs/services receive a trusted account context from authentication, not a `user_id` supplied by JavaScript.

Every data service moves from global read/update semantics to read/update for the authenticated user UUID. This applies to state sync, backup import/export, notifications, push, account settings, and background notification processing.

Database constraints/composite keys provide defense in depth so identical show IDs, history IDs, state keys, device IDs, revisions, and operation IDs may safely exist for different users without collision.

## Existing-admin migration lock

The old administrator is not deleted during development.

Phase 7 order:

1. New account system is functional while public registration remains closed.
2. Create the owner's new personal account through an explicitly controlled path.
3. Verify its email/security setup and immutable UUID.
4. Explicitly promote that UUID to `admin`; public signup never performs promotion.
5. Attach/migrate existing tracker/notification/push data to that UUID.
6. Compare key counts and exercise login, state read/write, settings, backup, and notifications.
7. Verify admin TOTP and recovery path.
8. Only then retire `tv_tracker_admin`, `/api/admin/account`, singleton-admin auth/cache behavior, and `tools/reset_admin.py`, replacing recovery tooling as needed.

The owner has an external backup, but migration remains transactional and verifiable.

## Email architecture without a purchased domain

There is no requirement to buy a domain and no personal email address is used as the application sender.

The application will expose a provider-neutral mail service configured from production secrets/environment, conceptually including `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, and `APP_DISPLAY_NAME`. Authentication code calls this service rather than AlwaysData directly.

AlwaysData documentation confirms SMTP at `smtp-[account].alwaysdata.net` (465 SSL/TLS, 587 STARTTLS) and states SMTP authentication is not required when the sending service itself is hosted on AlwaysData. Their examples demonstrate an `@alwaysdata.net` mailbox, while address-creation documentation says mailbox creation requires a domain to be present in the account. Therefore Phase 4 must verify the sender/address actually available on this specific AlwaysData account before email-backed signup can be accepted. If no suitable non-personal sender is available, registration remains closed while another non-personal-email transport is selected.

Official references checked during Phase 1:

- https://help.alwaysdata.com/en/docs/emails/use-an-email-address/
- https://help.alwaysdata.com/en/docs/emails/create-an-email-address/
- https://help.alwaysdata.com/en/docs/admin-billing/profile/restricted-mode/

Restricted AlwaysData profiles may have outgoing SMTP quantity/time restrictions; Phase 4 acceptance must verify the production account is suitable for verification/reset traffic.

## Eight-phase implementation sequence

1. **Audit + architecture lock (this phase):** current auth/session/schema ownership mapped; registration source-locked closed.
2. **Multi-user database foundation:** users/UUIDs/account states/roles and ownership migration scaffolding. No public signup.
3. **Authentication + sessions:** email-or-username login, server-authoritative sessions, logout/all-device revocation, rate limits, password change. No public signup.
4. **Account creation + email flows:** signup implementation exists behind the closed gate; verification, resend, forgot/reset, email/username changes, provider-neutral mail + verified AlwaysData sender path. Registration still closed.
5. **Full data isolation:** every tracker, movie, history, favorite, state, notification, push, and backup boundary scoped by authenticated UUID; adversarial two-user isolation tests. Registration still closed.
6. **Account lifecycle:** deactivate/reactivate, 30-day pending deletion/cancel/purge, identifier reservation and session invalidation. Registration still closed.
7. **Admin + TOTP + legacy migration:** required admin TOTP, optional user TOTP, create/promote owner UUID, migrate existing data, verify, remove legacy singleton admin. Registration still closed.
8. **Final acceptance + registration opening:** complete regression/isolation/security/mobile/email/deletion/recovery/production acceptance while registration is still closed; enabling public registration is the final release action only after all gates pass.

## Phase 1 exit criteria

Phase 1 is complete when:

- this baseline/ownership/schema/rollout document is merged;
- the source-controlled registration policy remains `False` and is not environment-overridable;
- a regression test protects the rollout lock and key architecture decisions;
- the pre-existing GET `/signup` remains informational only, with no account-creation POST endpoint or signup form;
- existing singleton admin login and production data remain untouched;
- normal exact-head CI is green;
- merge/deploy health checks succeed.

Phase 2 must start from the resulting `main`; it must not silently revise these product decisions. Any necessary architectural correction should be explicit in its PR rather than hidden in implementation details.
