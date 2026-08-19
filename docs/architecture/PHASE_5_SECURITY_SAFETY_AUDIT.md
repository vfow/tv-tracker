# Phase 5 - Security and Safety Audit

Status: partial; repository/application controls mapped, external and release gates open

Evidence cutoff: 2026-08-19

Committed source audited: `75dc45f2d21c924533eb77f7653e425a8bb18bc9`

This is a defensive architecture audit, not a penetration test and not a claim that production is secure. It records controls visible in source and GitHub settings, identifies unknown host/account controls, and defines objective closure evidence without requesting secret values.

## Security model

**Observed state:** TV Tracker is a public source repository for a private single-admin application. Flask, PostgreSQL, TMDB, optional TVmaze, optional Web Push, GitHub Actions, and AlwaysData form the trust boundary.

**Locked product requirement:** security-sensitive failures fail closed. Invalid authentication, CSRF, backup data, sync records, route destinations, migrations, or authorization must be rejected rather than best-effort accepted.

**Locked product requirement:** optional enrichment fails open only toward safe core behavior. TVmaze or Push failure may reduce enrichment/delivery but cannot prevent tracker or in-app Notification correctness.

## Observed application controls

| Surface | Observed control | Exact evidence | Audit disposition |
|---|---|---|---|
| Required configuration | Missing required environment values raise before use | `app.py:206-212`; `.env.example` | Good fail-closed shape; production strength and rotation are unknown. |
| Passwords | Argon2 verification; new passwords require at least 16 characters | `app.py:140-153`, `app.py:2933-2977`, `app.py:3290-3413`; `tools/reset_admin.py`; `tools/generate_secrets.py` | Control present. Existing production hash parameters/value were not inspected. |
| Login throttling | Five failures per client key in 15 minutes, persisted in PostgreSQL | `app.py:150-153`, `app.py:603-675`, `app.py:2933-2970` | Present; correctness depends on trusted client IP handling. |
| Account-change throttling | Five attempts per client key per hour; current password required | `app.py:152-153`, `app.py:672-675`, `app.py:3290-3337` | Present; attempts include validation failures. |
| Session fixation/invalidation | Successful login clears the old session, creates a new CSRF token, and stores `session_version`; account change increments version | `app.py:560-600`, `app.py:2970-2984`, `app.py:3383-3413` | Strong baseline. Seven-day lifetime remains a product/security decision. |
| Session cookie | `Secure`, `HttpOnly`, `SameSite=Lax`, seven-day permanent lifetime | `app.py:2815-2823` | Present in production config. HTTPS/proxy behavior must be verified. |
| CSRF | Constant-time token comparison for mutating forms/APIs | `app.py:495-504`; mutating routes at `app.py:3290-3413`, `3428-3493`, `3609-3912`; Push routes at `tvtracker/notifications/push_and_movies.py:1258-1312` | Present on audited mutation routes; maintain route-level regression inventory. |
| Route authorization | Application and private APIs use `login_required`; invalid sessions are cleared | `app.py:582-600`; route declarations at `app.py:2904-4043` | Present. New routes must default private unless explicitly public. |
| Open redirect defense | Return paths are parsed against explicit app-route allowlists | `app.py:1828-2125`; `tests/test_route_contracts.py`; `tests/test_backend.py` | Characterized; route additions must update server and browser contracts together. |
| Request size | Flask body limit is 40 MiB | `app.py:58`, `app.py:2815-2818`, `app.py:4079-4085` | Present. A lower endpoint-specific backup limit may still be warranted after measurement. |
| JSON/backup validation | Depth, item, string, identifier, show/history/state, version, and date checks; future schemas fail closed | `app.py:196-203`, `app.py:840-1817`, `app.py:3838-3912` | Strong static boundary; full candidate tests are red. |
| SQL safety | Dynamic values use psycopg parameters; state keys are allowlisted | `app.py:188-195`, `app.py:1562-1574`, `app.py:3609-3827` | No string-built user SQL was identified in audited core paths. Database privilege scope is unknown. |
| Sync concurrency | Row lock, operation-id dedupe, revision conflict detection, transaction commit | `app.py:3609-3827`; `static/js/db.js:1213-1682` | Strong contract; current full suite is not green. |
| TMDB SSRF/secret boundary | Upstream host is fixed, path characters constrained, caller `api_key` removed, server key injected | `app.py:59`, `app.py:3993-4043` | Host is constrained; endpoint authority remains broader than product need. |
| TVmaze SSRF boundary | Fixed HTTPS API base and bounded transport | `tvtracker/integrations/tvmaze.py:18`; Phase 4 tests | Controlled optional provider. |
| Push authorization | Auth + CSRF; subscription tied to admin `session_version`; logout/account cleanup | `tvtracker/notifications/push_and_movies.py:611-743`, `1252-1332`; `tvtracker/notifications/runtime.py:46-125` | Present; Push device-cookie transport and host configuration remain open. |
| Push diagnostics | Browser responses strip dependency/private/validation details | `tvtracker/notifications/push_validation.py:117-145`, `190-209`; `tests/test_phase4_external_services.py` | Targeted tests passed in the red GitHub run. |
| Security headers | CSP, HSTS, frame denial, no-sniff, no-referrer, Permissions Policy | `app.py:2833-2858`; `tests/test_backend.py` | Present. CSP still allows inline styles and needs browser regression coverage. |
| Private response caching | `/api/`, `/app`, login, signup default to `no-store` | `app.py:2860-2872`; `tests/test_cache_headers.py` | Present. TMDB proxy intentionally permits private five-minute caching. |
| Public health | Optional token; public body exposes only `ok`; detailed health requires auth | `app.py:3259-3279` | Appropriate disclosure boundary; production token/use must be verified. |
| Generic errors | Browser API responses avoid raw traceback/database details | `app.py:4045-4095`; `static/js/feedback.js:13-129` | Present. Logs still contain diagnostics and require access/retention controls. |

## Concrete findings

### High - public repository controls are not release-ready

**Observed state from GitHub REST APIs on 2026-08-19:**

- repository visibility is public;
- `main` has no branch protection;
- secret scanning and push protection are disabled;
- Dependabot security updates and alerts are disabled;
- Actions are enabled for all actions and do not require SHA pinning;
- default workflow token permission is read and cannot approve pull requests;
- no GitHub deployment environment is configured.

Evidence endpoints:

- `GET /repos/vfow/tv-tracker`
- `GET /repos/vfow/tv-tracker/branches/main/protection`
- `GET /repos/vfow/tv-tracker/actions/permissions`
- `GET /repos/vfow/tv-tracker/actions/permissions/workflow`
- `GET /repos/vfow/tv-tracker/environments`

The read-only workflow token default is positive. The absent protection/scanning and unrestricted action policy increase malicious or accidental deployment and secret-commit risk.

### High - production trust and privilege boundaries are unknown

`TRUST_PROXY_HEADERS` enables one-hop `ProxyFix` for client IP, scheme, and host at `app.py:2813-2814`. Login and account throttling use `request.remote_addr` at `app.py:603-675`. The repository cannot prove the AlwaysData proxy topology, forwarded-header stripping, HTTPS redirect, HSTS delivery, PostgreSQL role privileges, or credential separation.

Wrong proxy trust can make rate limiting ineffective or make generated security attributes depend on spoofable headers. This gate requires redacted host evidence, not secret values.

### High - startup performs silent data mutation outside the migration ledger

`create_app()` calls `ensure_schema()` and then `cleanup_stored_tracker_data()` at `app.py:2825-2826`. The cleanup updates tracker JSON and suppresses every exception at `app.py:969-998`. The explicit migration registry is empty at `tvtracker/migrations/registry.py:5-7`.

This is both a data-safety and detectability risk. A startup cleanup that changes data but intentionally hides failure cannot be the final migration architecture. Do not remove it until its exact semantics, rollback, and data-integrity tests exist.

### Medium - Push device cookie security depends on request scheme

The Push device cookie is `HttpOnly` and `SameSite=Lax`, but `secure=request.is_secure` at `tvtracker/notifications/push_and_movies.py:1272-1280`. It is not the login credential, but it is a long-lived device identifier. Correct `Secure` delivery depends on HTTPS and trusted proxy configuration.

### Medium - sync throttling is process-local

`SYNC_REQUESTS` is an in-memory map and permits 180 revision/change requests per minute per client key at `app.py:158-161` and `678-689`. Multiple WSGI workers have independent counters, and entries are not globally bounded by a persistent cleanup policy. This is not a confirmed exploit in the private single-admin deployment, but it is not a durable public multi-user rate limiter.

### Medium - TMDB proxy authority is broader than the product contract

`/api/tmdb/<path>` fixes the host and protects the key, but any authenticated path matching `TMDB_PATH_RE` can be proxied. Phase 4 correctly defers an allowlist until all live calls are characterized. Closure requires an endpoint/purpose inventory and tests, not a guessed blocklist.

### Medium - dynamic HTML sinks need a complete taint review

The frontend uses many `innerHTML` and `insertAdjacentHTML` sinks across `static/js/app.js`, `static/js/ui.js`, Settings, Notifications, Streaming, and episode helpers. `escapeHTML` and `safeExternalURL` are widely used, CSP excludes inline scripts, and source-contract tests cover selected unsafe URLs. There is no complete automated taint/XSS suite proving every provider/import/profile value is escaped at every sink.

### Medium - dependency and workflow assurance is incomplete

`requirements.txt` pins four direct Python packages exactly. Root and frontend npm locks exist at committed head. CI audits production npm dependencies but has no Python vulnerability scan. CI uses mutable action tags, while deploy pins its third-party actions to commit SHAs. GitHub does not require action SHA pinning.

### Controlled - optional providers remain subordinate

Targeted tests prove TVmaze fallback and Push response sanitization, and notification persistence precedes Push delivery in `tvtracker/notifications/runtime.py:157-180`. This control is valuable but cannot be called fully revalidated while the complete candidate suite is red.

## Secret and private-data boundary

The repository documents names, never production values:

- Flask signing secret;
- PostgreSQL host, port, database, user, and password;
- admin bootstrap username and password hash;
- TMDB API key;
- VAPID public/private key and subject;
- health-check token;
- AlwaysData API, account, site, SSH, directory, and health settings.

Evidence: `.env.example`, `app.py:206-242`, `.github/workflows/deploy.yml`, `tvtracker/notifications/push_and_movies.py:588-610`, and `tvtracker/notifications/push_validation.py`.

GitHub reports nine Actions secret names and three variable names, but their values were not and must not be retrieved or recorded. The workflow and README disagree about several names; Phase 9 owns that documentation correction.

## Prevent, detect, contain, recover

| Scenario | Prevent | Detect | Contain | Recover | Open evidence |
|---|---|---|---|---|---|
| GitHub compromise or malicious merge | MFA/passkey, protected `main`, required checks/reviews, restricted actions, push protection | GitHub audit log, secret scanning, deploy notifications | Disable workflow/deploy credentials; block main | Rotate credentials; redeploy exact known-good SHA | All account controls and response drill are unverified. |
| Host compromise | Least privilege, MFA, separate DB/deploy credentials, patched runtime | Host access/app logs and unexpected process/file alerts | Revoke sessions/keys, isolate site, stop worker | Clean host, restore exact code and verified DB backup | AlwaysData controls/log retention unknown. |
| Database credential leak | Dedicated least-privilege role, network restrictions, secret storage | PostgreSQL/host connection logs | Rotate password, terminate sessions, restrict ingress | Validate data and restore only if integrity failed | Privileges and network policy unknown. |
| VAPID private-key leak | Host-only secret, restricted logs/config | Delivery anomalies and secret scanning | Rotate VAPID pair; invalidate server subscriptions | Users re-enable Push; in-app Notifications continue | Rotation runbook and production configuration unknown. |
| TMDB key leak | Server proxy, no browser key, secret scanning | TMDB usage/rate anomalies | Rotate key and disable affected calls | Install new server value; core stored data remains | Provider dashboard alerting unknown. |
| Admin-password compromise | Argon2, throttling, strong unique password, session version | Login/security event review | Reset password; increment session version; clear Push subscriptions | Reauthenticate trusted devices; review data changes | GitHub/host MFA and incident drill unknown. |
| Bad deploy or service worker | Required green checks, exact-SHA artifact, no-store worker | health, browser smoke, asset hash checks | Stop deploy; serve known-good code/worker | Phase 1 rollback and hard refresh/unregister only if required | Exact-SHA/rollback drill open. |
| Corruption or accidental deletion | Transactional writes, conservative migrations, backups | invariant checks, row counts, backup validation | Stop writes/worker; snapshot current state | Restore isolated verified backup then cut over | Restore drills open. |

## External verification checklist

No item below requires disclosing a value.

| Check | Acceptable evidence |
|---|---|
| GitHub owner security | Owner records that MFA/passkey and recovery codes are configured; no screenshots containing codes. |
| Branch protection | API output shows protected `main`, required PR/check policy, force-push/deletion disabled, and owner bypass policy understood. |
| Repository scanning | API/settings show secret scanning, push protection, and dependency alerts enabled where available. |
| Actions policy | Only required actions are allowed; third-party actions use immutable SHAs; workflow permissions remain read unless a job proves need. |
| AlwaysData account | Owner records MFA/access review and removes stale users/keys. |
| Proxy/HTTPS | Redacted headers/config prove one trusted proxy hop, HTTPS redirect, correct `request.is_secure`, HSTS, and no untrusted forwarded-header path. |
| PostgreSQL | Redacted grants show an application role limited to required database/schema operations; admin/backup roles are separate. |
| Secrets | Owner records generation date, storage system, and rotation owner for each secret, without values. |
| Logs | Retention/access/redaction are documented; no session cookies, passwords, VAPID private key, DB password, or API key appears. |
| Backups | Private native and PostgreSQL backups pass isolated restore drills and access controls are reviewed. |

## Blockers carried forward

| Blocker | Destination |
|---|---|
| Red full candidate suite | Phase 11 release gate |
| Unprotected main and disabled scanning/dependency alerts | Phase 9 operations and Phase 11 risk R-07 |
| Proxy, HTTPS, host access, DB privileges, and secret rotation unknown | Phase 9 and Phase 11 |
| Startup DDL/silent data cleanup | Phase 8 and Phase 11 risk R-02/R-16 |
| Push cookie conditional `Secure` | Phase 6/9 browser-host acceptance |
| Broad TMDB proxy | Later media/API extraction; Phase 11 risk R-13 |
| Incomplete XSS/HTML-sink proof | Phase 7 safety harness and Phase 11 |
| No Python vulnerability gate | Phase 9 CI hardening |
| Recovery drills absent | Phases 1, 9, and 11 |

## Phase 5 exit criteria

Phase 5 is complete only when all of the following are objectively true:

- the exact final candidate passes authentication, CSRF, route authorization, malicious backup/import, sync conflict, Push authorization, security-header, error-leak, and startup tests;
- no Critical application finding remains open;
- every High finding above is resolved or explicitly accepted by the owner with a bounded mitigation and review date;
- GitHub `main`, scanning, dependency alerts, and Actions policy meet the external checklist;
- AlwaysData proxy/HTTPS/access/logging and PostgreSQL least privilege are verified with redacted evidence;
- Push device cookies are always secure in production or an equivalent verified transport control is documented;
- secret rotation and incident procedures exist without containing secret values;
- PostgreSQL and native-backup recovery drills pass;
- the risk register in Phase 11 reflects all residual risks.

These criteria are not currently met. Phase 5 remains partial.
