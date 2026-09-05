# Multi-user Phase 4 — account creation and email flows

Phase 4 builds the account-creation and email-backed recovery surfaces required by the Phase 1 architecture lock. It does **not** open public registration, migrate tracker ownership, implement account deletion/deactivation, add TOTP, or remove the legacy singleton administrator.

## Registration remains closed

`tvtracker.auth.registration_policy.PUBLIC_REGISTRATION_ENABLED` remains source-controlled `False`.

The Phase 4 signup form and POST implementation now exist so they can be exercised before release, but the public template only renders the form when the source-controlled policy is open and `POST /signup` aborts before CSRF validation, database access, password hashing, or email delivery while the policy is closed. Phase 8 remains the only phase allowed to change that source-controlled rollout decision after acceptance.

New public accounts, when registration is eventually opened, are always created with:

- an immutable server-generated UUID;
- role `user`;
- status `unverified`;
- normalized unique email and username values;
- an Argon2 password hash;
- a 24-hour email-verification token.

They cannot enter the application until the verification token activates the account.

## Account tokens

Schema version 8 adds `tv_tracker_account_tokens` for three purposes:

- `verify_email` — 24-hour expiry;
- `password_reset` — 30-minute expiry;
- `email_change` — 24-hour expiry and carries the pending new address.

Only a SHA-256 hash of the random URL token is stored. Tokens are user-bound, purpose-bound, expiring, and superseded when another token of the same purpose is issued. Password reset and confirmation flows mark the token used atomically with the account mutation so links are single-use.

Password resets increment `session_version`, invalidating every existing browser generation. Username changes preserve the immutable UUID and increment `session_version`; the initiating browser adopts the new username/session generation while other browsers are invalidated. Confirmed email changes also increment `session_version`; the browser that confirms its own account adopts the new generation while other sessions are invalidated.

The old email remains the login email until the new-address confirmation token succeeds.

Issuance and consumption lock the account before its token rows. Concurrent
resends therefore leave only one usable link of that purpose. Password changes,
password resets, and confirmed email changes revoke outstanding password-reset
and email-change links in the same transaction. A request that resolved an old
email before an email switch cannot issue a fresh token to that old address.

## Email flows

Phase 4 adds:

- email verification and resend;
- forgot-password request and password reset;
- verified email change requiring the current password;
- UUID-user username changes through the existing account-settings API contract;
- a provider-neutral SMTP service.

The authentication UI does not hard-code a product name into email subjects. Mail uses `APP_DISPLAY_NAME` and `MAIL_FROM_NAME`, with a neutral fallback when no display name has been selected yet.

## SMTP configuration

The mail service reads:

- `APP_PUBLIC_URL` (the canonical HTTPS origin, with no path/query/credentials);
- `MAIL_HOST`;
- `MAIL_PORT`;
- `MAIL_SECURITY` (`ssl`, `starttls`, or `plain`);
- `MAIL_USERNAME` and `MAIL_PASSWORD` together when SMTP authentication is required;
- `MAIL_FROM_ADDRESS`;
- `MAIL_FROM_NAME`;
- `APP_DISPLAY_NAME`.

SMTP authentication is optional by design, matching the Phase 1 AlwaysData finding that services hosted on AlwaysData can use the account SMTP server without authentication. Port 465 can use `ssl`; port 587 can use `starttls`.

Email links use `APP_PUBLIC_URL`, never the request Host or forwarded host.
Mail is unavailable until this origin and the SMTP sender configuration are
valid. Authenticated SMTP requires TLS. `.env.example` lists all configuration
keys without supplying real credentials or enabling registration.

Account/email POSTs retain CSRF validation and use the existing database-backed
security-event store to limit requests to 30 per client and 5 per normalized
recipient in 15 minutes. Recipient keys are hashed. Reset-password hashing is
covered by the client limit; username-change password failures count toward the
existing account-change limit. Closed signup returns before CSRF, throttle
storage, account access, hashing, or delivery. Recovery/account pages use
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

Phase 4 code and tests deliberately do not claim that a production sender exists. Before email-backed signup can be accepted in production, the actual AlwaysData account must still be checked for a usable non-personal sender/address and for any restricted-profile SMTP limits. Registration remains closed regardless.

## Remaining production acceptance

- Confirm the available AlwaysData sender and sending limits in the actual account.
- Configure the canonical origin and SMTP values on the host.
- Apply migration 0008 through the normal accepted deployment process and verify
  the live release SHA and health response.
- With controlled test accounts, verify real inbox delivery for verification,
  resend, reset, and email change, including expired/reused links and recovery
  after a delivery failure. Mock SMTP tests do not certify inbox delivery.
- Keep the legacy owner login and registration lock intact. Account ownership
  migration and public signup remain later-phase work.

## Explicitly deferred

Phase 5 owns server-side data isolation for every tracker/state/history/notification/push/backup boundary. Phase 6 owns deactivate/reactivate and 30-day deletion recovery/purge. Phase 7 owns TOTP, owner UUID creation/promotion/data migration, and retirement of the singleton admin. Phase 8 owns final acceptance and is the only phase that may open registration.
