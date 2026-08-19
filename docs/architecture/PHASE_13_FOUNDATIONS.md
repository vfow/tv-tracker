# Phase 13 — New foundations

Phase 13 establishes the permanent seams without replacing working TV Tracker behavior in one rewrite.

## Backend transition

- `tvtracker.application` is the package-owned seam to the current root Flask application.
- `tvtracker.database` provides a side-effect-free database connection for migration tooling.
- `tvtracker.migrations` owns ordered additive migrations, a checksum-protected ledger, and a PostgreSQL advisory transaction lock.
- `auth`, `backup`, `media`, `sync`, `tracker`, and `web` package homes now exist so Phase 18 can move characterized code into permanent owners rather than inventing destinations during extraction.
- Root compatibility modules remain until their callers are migrated and proven. Phase 19, not Phase 13, removes obsolete compatibility layers.

## Frontend transition

`frontend/` is the Vue 3 + Vite + TypeScript source tree. Its Phase 13 entry is deliberately non-visual: it mounts only a hidden compatibility marker and exposes `window.TVTrackerModern`.

The bridge provides:

- one shared same-origin API client with CSRF support;
- the locked four-way error classification;
- an adapter to the existing `TVTrackerFeedback` renderer rather than a second feedback surface.

The legacy frontend remains authoritative until each later product domain is migrated and tested.

## Build/deployment boundary

The compiled modern bundle is committed under `static/modern/`. CI rebuilds it and fails if generated output differs, so source and deployed assets cannot drift. Production deployment uses that committed output and runs `python -m tvtracker.migrations` before restart; the AlwaysData host does not need Node just to serve the modern bundle.

## Removal conditions

- The package seam to root `app.py` remains until Phase 18 extraction is complete.
- Legacy frontend globals remain until Phase 17 migrates their owners.
- Historical shims and patches are deleted only in Phase 19 after callers are gone and tests are green.
