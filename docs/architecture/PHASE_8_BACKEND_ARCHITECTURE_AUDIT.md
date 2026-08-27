# Phase 8 - Backend Architecture Audit

Status: domain/extraction map complete; target implementation and startup gates incomplete

Evidence cutoff: 2026-08-19

Committed source audited: `75dc45f2d21c924533eb77f7653e425a8bb18bc9`

## Architecture decision

**Locked product requirement:** Flask and PostgreSQL remain the backend and persistent-store foundations.

**Transition decision:** extract complete responsibilities behind explicit package interfaces. Characterize behavior first, move mostly unchanged, prove parity, then improve internals. Do not split by file size and do not combine a high-risk persistence move with a behavioral rewrite.

**Future option:** an ORM, another backend framework, or microservices require a separate measured proposal. None is part of this stabilization.

## Current backend graph

```text
WSGI
wsgi.py
  -> root app.py (constructs Flask app at import)
  -> notification runtime/schema preparation
  -> static-asset and backup response hardeners
  -> Push validation and final notification route installation

Worker
notification_worker.py
  -> root app.py helpers and application import side effects
  -> tvtracker.notifications.runtime

Root application
app.py
  -> config/environment
  -> PostgreSQL connection and startup schema
  -> data cleanup/validation
  -> auth/session/CSRF/rate limits
  -> tracker/sync/backup
  -> web and API routes
  -> TMDB transport/cache/index
  -> notification route integration
  -> release-timing route installation

Package seams
tvtracker.notifications.*       substantial implementation
tvtracker.release_timing.*      substantial implementation
tvtracker.integrations.tvmaze   optional provider implementation
tvtracker.infrastructure.*      static-asset implementation
tvtracker.data_integrity        backup response transition hardener
tvtracker.migrations.*          runner/ledger; registry empty
tvtracker.application           legacy app import seam
auth/backup/media/sync/tracker/web  package homes only
```

Exact evidence: `wsgi.py`, `notification_worker.py`, `app.py:1-4113`, and `tvtracker/`.

## Current ownership inventory

| Responsibility | Current owner | Current interface/callers | State/transaction boundary | Target owner | Current state |
|---|---|---|---|---|---|
| Application construction/config | `app.py:create_app`; global `app` at import | Flask CLI, `wsgi.py`, tests, worker imports | Calls DB schema and cleanup during construction | `tvtracker.application` plus explicit config object | `tvtracker/application.py` only imports the legacy app. |
| WSGI composition | `wsgi.py` | Production WSGI server | Calls notification schema prep before serving | Thin package application factory/export | Load-order comments reference retired filenames; startup safety tests error. |
| Worker composition | `notification_worker.py` | External scheduler/process | Imports root app, then runs Notifications/Push | Thin package worker entrypoint | Machine-readable output exists; hermetic test errors. |
| Environment/config | `app.py`, package DB helper, notification/provider modules | Every runtime | Process environment | One validated settings boundary with domain-specific optional config | Required values fail closed; validation is distributed. |
| DB connection | `app.py:database_connection`; duplicate `tvtracker/database/connection.py` | App routes/services and migration CLI | One psycopg connection per call, caller-managed transactions | `tvtracker.database` | Duplicate helpers can drift. |
| Schema/bootstrap | `app.py:ensure_schema`; Notifications schema functions; migration runner | App import, WSGI prep, deploy migration command | DDL transactions plus advisory-lock migration ledger | `tvtracker.migrations` | Registry empty; startup DDL remains load-bearing. |
| Historical data cleanup | `app.py:cleanup_stored_tracker_data` | App construction | Updates show/state JSON, catches all errors | Versioned migration or explicit repair service | Silent startup mutation remains. |
| Auth/session/security | `app.py:495-689`, auth routes | Flask routes, Push decorators | Admin/security tables and signed session | `tvtracker.auth` | Package contains only a placeholder docstring. |
| Tracker validation/state | `app.py` | state/backup/sync routes and frontend | show/history/state JSONB | `tvtracker.tracker` | Package contains only a placeholder docstring. |
| Sync | `app.py:692-839`, `1666-1817`, `3495-3836` | `static/js/db.js` | revision row lock, change log, operation IDs | `tvtracker.sync` | Package contains only a placeholder docstring. |
| Backup/import | `app.py:840-1817`, routes `3838-3912`; `tvtracker.data_integrity` WSGI shim | Settings/browser | Transactional full replacement; native schema 5/version 2 | `tvtracker.backup` | Package contains only a placeholder docstring; WSGI response hardener remains. |
| Media/TMDB | `app.py:2153-2800`, routes `3914-4043`; browser clients | UI, Notifications, release timing | External HTTP, in-memory/disk caches | `tvtracker.media` plus integration transport | Package contains only a placeholder docstring; proxy is broad. |
| Notifications | `tvtracker.notifications.backend`, `engine`, `push_and_movies`, `runtime`, `push_validation`; route shells in `app.py` | App, WSGI, worker, frontend | Notification/settings/baseline/event/Push tables | `tvtracker.notifications` | Most code moved; startup/tests and naming still transitional. |
| Release timing | `tvtracker.release_timing.service/routes` | App route install, Notifications/UI | Provider cache plus provider-neutral contract | Same package | Good seam; stale root import remains in one test. |
| TVmaze | `tvtracker.integrations.tvmaze` | release timing | Separate provider tables/caches | Same optional integration | Canonical package path; optionality tests targeted green. |
| Static assets | `tvtracker.infrastructure.static_assets` | WSGI/Jinja/static responses | In-memory version cache, file hashes | Same package | Package-owned and tested. |
| Web routes/error/health | `app.py:create_app` | Browser/operations | Flask request/session/DB | `tvtracker.web` blueprints/composition | Package contains only a placeholder docstring. |

## Critical architecture findings

### Critical - startup is not a side-effect-free composition boundary

Importing `app.py` executes `app = create_app()` at `app.py:4100`. Construction requires secrets/database access, performs schema DDL at `app.py:245-408`, and mutates stored JSON through `cleanup_stored_tracker_data()` at `app.py:969-998` and `2825-2826`.

Consequences:

- importing helpers can connect to and mutate PostgreSQL;
- WSGI and worker tests need extensive module patching;
- migrations, application creation, and business cleanup have overlapping ownership;
- cleanup errors are intentionally hidden from startup.

Do not fix this with a large rewrite. First move configuration/connection construction, then explicit migrations, then isolate cleanup behind a versioned/tested command.

### High - the migration foundation is not yet the schema authority

`tvtracker/migrations/runner.py` has ordered IDs, checksums, a transaction, and PostgreSQL advisory lock. `tvtracker/migrations/registry.py` is empty. Deploy runs the empty registry, while `app.py` and Notifications still issue DDL at startup.

The target is one schema history. Existing production schema must be baselined safely without pretending prior startup DDL never occurred.

### High - package presence overstates extraction progress

`tvtracker/auth/__init__.py`, `backup/__init__.py`, `media/__init__.py`, `sync/__init__.py`, `tracker/__init__.py`, and `web/__init__.py` contain only destination docstrings. Tests that merely assert these paths exist do not prove domain ownership. Root `app.py` remains the actual owner.

### High - entrypoint contracts are red

The GitHub run at committed head errors in both `test_wsgi_startup_exports_application_and_installs_each_boundary_once` and `test_notification_worker_main_path_is_hermetic_and_machine_readable`. The failure reaches real schema preparation because the patched connection object is no longer intercepted by the consolidated import path.

This may include stale test wiring, but WSGI/worker behavior is not accepted until the intended boundary is clear and the tests pass without suppressing real startup work.

### Medium - database connection/config is duplicated

`app.py:234-242` and `tvtracker/database/connection.py:9-33` independently read the same environment and construct psycopg connections. They currently match. Keeping both permanently risks timeout, TLS, pooling, application-name, or credential behavior drift.

### Medium - transaction ownership is implicit

Core write functions open and commit their own connections. Full backup replacement, incremental sync, schema setup, notifications, Push, and provider caches each define local transaction behavior. Extraction must preserve atomic boundaries and must not create nested or split commits around one user action.

### Controlled - provider and notification seams are directionally correct

TMDB identity and TVmaze timing remain separated, and Notifications persist independently of Push. The package paths are appropriate target owners. Current red tests and WSGI registration order prevent a final-complete claim.

## Target backend architecture

```text
wsgi.py / notification_worker.py / migration CLI
                |
                v
tvtracker.application (validated configuration + explicit construction)
                |
                +--> tvtracker.web (Flask routes/error/health)
                +--> tvtracker.auth
                +--> tvtracker.tracker
                +--> tvtracker.sync
                +--> tvtracker.backup
                +--> tvtracker.media
                +--> tvtracker.notifications
                +--> tvtracker.release_timing
                +--> tvtracker.integrations (optional providers)
                +--> tvtracker.infrastructure
                |
                v
tvtracker.database + tvtracker.migrations -> PostgreSQL
```

Target rules:

- constructing/importing service modules is side-effect free;
- the application factory receives validated config and service dependencies;
- migrations run explicitly before application restart and fail closed;
- no ordinary request or helper import performs schema DDL;
- transactions are owned by application services, not hidden across adapters;
- Flask routes validate HTTP shape and delegate domain behavior;
- optional providers implement interfaces and cannot import/own tracker persistence;
- error translation occurs at the web/worker boundary;
- WSGI and worker remain thin and hermetically testable.

## Extraction contracts and order

| Order | Domain | Public interface to establish | Required regression proof | Compatibility/removal gate |
|---:|---|---|---|---|
| 1 | Config/database | Validated config; one connection factory | Missing/invalid env, connection timeout, test injection | Remove duplicate root connection only when every caller uses package factory. |
| 2 | Migrations | Explicit `run_migrations`; baseline schema migration strategy | Fresh DB, current DB, run twice, checksum mismatch, lock contention, failure rollback | Remove startup DDL only after all existing tables/indexes are represented and production rehearsal passes. |
| 3 | Application/web shell | Side-effect-free factory; route registration functions | Import without DB, WSGI startup, public/private health, 404/500, security headers | Root global app becomes thin compatibility export, then disappears after all callers move. |
| 4 | Media transport | Provider-neutral TMDB client with endpoint contracts/timeouts/cache | Required live path inventory, errors/429/timeout/malformed response, key secrecy | Remove broad proxy/helper duplication only after every caller is mapped. |
| 5 | Auth | Authenticate/session/account service and route adapter | rate limits, CSRF, fixation, version invalidation, logout, malformed input | Move mostly unchanged; no public registration introduced. |
| 6 | Notifications/release/integrations | Package-owned app/worker installers or blueprints/services | persisted-before-Push, provider disabled/missing/failure, WSGI/worker startup | Remove historical aliases and order patches only after full suite green. |
| 7 | Backup | Versioned validate/export/import service | v1/v2/current, future reject, round trip, transaction rollback, private fixture policy | Remove WSGI backup response hardener after canonical service owns summary. |
| 8 | Tracker | Show/movie/history/profile repository/service | Phase 3 invariants, duplicate/removal/special/movie identity | Move high-risk logic unchanged first; improve only in later isolated work. |
| 9 | Sync | Delta validation, conflict, revision/change-log service | concurrent/nonoverlap/overlap, duplicate operation, reset/gap, stale client | Preserve browser protocol until both sides migrate and compatibility window closes. |
| 10 | Historical cleanup | Explicit diagnostic/repair or versioned migration | preview, deterministic change set, rollback/export, idempotency | Remove silent startup cleanup only after exact prior behavior is understood and safely replaced. |

## API and failure boundaries

| Boundary | Required failure behavior |
|---|---|
| Web validation/auth/CSRF | Reject before domain mutation; return stable safe code/message. |
| Database write | One explicit transaction; failure rolls back and surfaces operational diagnostics only. |
| Backup import | Validate fully before replacement; transaction failure reports no data changed. |
| Migration | Advisory lock, transaction, checksum history, fail closed before restart. |
| TMDB core request | Bounded timeout and safe product failure; never expose key. |
| TVmaze optional request | Bounded retry/cache; provider-neutral TMDB fallback. |
| Notification worker | Persist notification first; isolate per-provider/per-device failure; machine-readable result and nonzero failure policy documented. |
| Push | Optional; server/browser failures never delete or block in-app Notification. |
| Health | Public minimal status; authenticated operational detail; no secrets. |

## Database/data boundaries to preserve

- canonical tracker state: `tv_tracker_shows`, `tv_tracker_history`, allowed `tv_tracker_state` keys;
- sync protocol: `tv_tracker_meta`, `tv_tracker_changes`, operation IDs and revision semantics;
- auth/security: `tv_tracker_admin`, `tv_tracker_security_events`;
- Notifications and Push tables: product notification state separated from delivery state;
- optional TVmaze tables/caches: removable without tracker changes;
- browser pending saves: replay/conflict semantics must remain compatible through extraction;
- native backup version 2/schema 5 and supported older versions remain deliberate contracts.

Exact schema evidence: `app.py:245-408`, `tvtracker/notifications/push_and_movies.py:44-119`, and `tvtracker/integrations/tvmaze.py`.

## Blockers carried forward

| Blocker | Destination |
|---|---|
| WSGI and worker tests error | Phase 11 risk R-01/R-13 |
| Startup DDL and silent cleanup | Phase 11 risk R-02/R-16 |
| Empty migration registry | Phase 9 rollout and risk R-16 |
| Placeholder package homes | Later domain extraction; no completion claim |
| Broad TMDB proxy and split media clients | Phase 4 blocker and risk R-13 |
| Duplicate database helpers | First backend transition step |
| Production transaction/migration rehearsal absent | Phases 1, 9, 11 |

## Phase 8 exit criteria

The audit-map deliverable is complete when every planned extraction above has a public interface, callers, state owner, transaction boundary, failure behavior, tests, adapter, and adapter removal condition. This document supplies that map.

Backend architecture implementation is not complete until:

- WSGI, worker, and service imports are side-effect free and tests pass;
- one database/config boundary serves app, worker, and migrations;
- explicit migrations are the only schema authority and pass fresh/current/repeat/failure tests;
- startup no longer silently rewrites uncertain tracker state;
- auth, backup, tracker, sync, media, and web package owners contain the actual implementation;
- routes are thin adapters and transaction ownership is explicit;
- optional providers remain removable and Push remains subordinate;
- all compatibility adapters have no callers and their removal gates pass;
- the complete candidate suite and production-shaped migration rehearsal are green.

Those implementation gates remain open. File moves or package placeholders must not be reported as completed extraction.
