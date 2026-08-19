# Phase 13 — New foundations

Phase 13 establishes the permanent seams without replacing working TV Tracker behavior in one rewrite.

This is the Phase 13 boundary contract. The branch already contained later-phase commits before the recovery candidate; this work repairs the earlier boundary without reverting later code that remains factual source authority.

## Backend transition

- `tvtracker.application` is the package-owned seam to the current root Flask application.
- `tvtracker.database` provides a side-effect-free database connection for migration tooling.
- `tvtracker.migrations` now owns five ordered, additive migrations that adopt or create the current tracker, notification, final movie-notification, and Push tables. The registry is the mandatory core schema source of truth.
- `DATABASE_SCHEMA_VERSION` is owned by the migration package and is currently `5`. It is intentionally independent from `app.py`'s native-backup `SCHEMA_VERSION`, which also remains `5`; changing database DDL does not implicitly change the backup format.
- `app.ensure_schema()` delegates mandatory DDL and database versioning to the registry, then separately performs the existing environment-based admin singleton bootstrap and startup validation. Credentials are never migration data.
- `auth`, `backup`, `media`, `sync`, `tracker`, and `web` package homes define permanent destinations for characterized code.
- At the Phase 13 boundary, compatibility modules could be removed only after callers migrated and tests proved the canonical package owner. Later commits already present on this branch performed some of those removals; recovery does not recreate retired shims.

## Migration safety contract

`python -m tvtracker.migrations` applies the same registry used by application startup. The runner:

- validates unique, ascending migration IDs before opening a database connection;
- acquires `pg_advisory_xact_lock` before creating or reading the migration ledger;
- creates `tv_tracker_migrations` and applies all pending migrations in one transaction;
- treats the applied ledger as an ordered registry prefix and fails on unknown/ahead entries, gaps, duplicate IDs, or changed checksums;
- refuses to run when `tv_tracker_schema_meta` reports a version newer than this application;
- catalog-certifies supported pre-ledger schemas before adoption, fails closed on structural drift, and repairs only required conflict-safe singleton seeds;
- repairs missing or behind schema-version metadata only after a complete valid ledger or certified adoption, then verifies the final ledger and version;
- uses only additive `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and conflict-safe singleton initialization in the adoption registry.

Existing tracker and notification rows are not rewritten. Native backup version fields and payload shape are unchanged. A failed migration rolls back its schema changes and ledger insert together.

Real PostgreSQL integration tests are enabled by `TEST_DATABASE_URL`. They cover fresh and repeated application, certified version-4/version-5 adoption, singleton seed repair without overwriting existing values, malformed-schema rejection, partial/unknown/checksum/ahead ledger states, metadata repair, full rollback on failure, and two synchronized processes applying the registry exactly once. CI and the deploy test gate provide an ephemeral PostgreSQL 16 service with test-only credentials so this coverage cannot silently skip there. Catalog validation avoids PostgreSQL-15-only fields so supported older hosts fail on actual drift rather than a missing catalog column.

## Transitional ownership

`tvtracker.notifications.push_and_movies.ensure_final_schema()` remains as a directly callable compatibility guard for existing notification entry points, but delegates to the canonical migration registry and runner rather than maintaining duplicate DDL outside the advisory lock and checksum ledger. Application and notification entry points may both invoke the runner during composition; the ledger makes later calls verified no-ops, and request-time guards are replaced only after successful preparation. The optional TVmaze provider continues to own its lazy cache/mapping DDL and remains outside the mandatory core registry.

## Frontend transition

`static/js/core/foundation.js` is the permanent browser-native frontend seam. It is loaded once by `templates/index.html` after the existing feedback runtime and exposes the frozen `window.TVTrackerCore` namespace without mounting or rendering anything.

The namespace provides:

- `api`, a same-origin JSON client with CSRF support for unsafe methods;
- `errors`, the locked four-way error classification and API request error type;
- `feedback`, a delegation adapter to the existing `TVTrackerFeedback` renderer rather than a second feedback surface.

Existing browser domain owners remain authoritative unless a later commit already migrated and tested that ownership. Phase 13 introduces no second renderer or framework runtime.

## Build/deployment boundary

The browser core is committed source and requires no frontend package install, compiler, or bundler. Root npm tooling remains dedicated to Tailwind: CI and deploy install from the root lockfile, audit build dependencies, rebuild `static/css/tailwind.css`, and fail if the committed stylesheet differs. Deployment stages the exact accepted SHA, runs `python -m tvtracker.migrations` before changing the live checkout, restarts, and requires `/healthz` to report the same process-captured SHA. The ephemeral `TEST_DATABASE_URL` belongs only to workflow test containers; deployment still obtains production database configuration from the existing host environment and no production database secret is stored in the workflow.

## Phase-boundary removal conditions

- The package seam to root `app.py` remains until characterized extraction is complete.
- A legacy frontend global remains until its canonical owner and callers are migrated and tested.
- A historical shim or patch is deleted only after callers are gone and the full suite is green. Later-phase commits already present on this branch are evaluated by those conditions rather than rolled back by phase number.
