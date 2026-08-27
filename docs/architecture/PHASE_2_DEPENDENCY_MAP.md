# Phase 2 — Repository and Dependency Map

Status: complete audit map for the stabilization branch

Baseline main SHA: `d524c905c11101566c0493053e5414649ea6b105`

Audit branch: `architecture-futureproof-2026-08-18`

This document records runtime ownership, compatibility layers, load-order dependencies, historical fix layers, and the conditions that must be satisfied before code is moved or deleted. It is an audit artifact, not permission to remove a compatibility layer simply because it is listed here.

## Safety rules for dependency cleanup

1. A file is not removable until its behavior is understood, replacement ownership exists, all callers are migrated, and regression coverage proves the replacement.
2. User-state/data-integrity behavior has priority over architectural cleanup.
3. Compatibility shims remain until both runtime and tests use canonical package paths.
4. The branch must not permanently depend on CI rewriting source files before tests.
5. Optional providers must not become required dependencies of tracker state, Notifications, or startup.
6. Frontend migration must not leave two permanent owners for one DOM surface or state transition.
7. Existing route, WSGI, worker, backup, sync, and provider-fallback contracts are compatibility boundaries until explicitly migrated and tested.

## Runtime entrypoints

### Web application

`wsgi.py`

Current role:
- imports the Flask application from the root `app.py` entrypoint;
- installs Notifications/Push/runtime behavior through root compatibility modules;
- installs static-asset versioning;
- preserves an explicit startup/registration order because historical notification asset/runtime layers depend on Flask hook order.

Target role:
- thin production entrypoint that imports a constructed application from the canonical `tvtracker` package;
- no behavior that depends on historical `final`, `polish`, or reverse hook-order layering.

Do not remove/change until:
- WSGI startup contract has regression coverage;
- canonical application factory/registration order is established;
- Notifications/Push runtime ownership is consolidated;
- production deploy startup is proven against the new entrypoint.

### Background worker

`notification_worker.py`

Current role:
- production worker entrypoint;
- still reaches notification/release-timing behavior through compatibility/root imports.

Target role:
- thin worker entrypoint importing canonical `tvtracker.notifications` services directly.

Do not change until:
- worker startup/import test exists;
- notification engine and release-timing imports are canonical;
- provider-disabled/provider-failure paths are tested.

## Backend ownership map

### Root `app.py`

Current ownership is broad and includes application wiring plus significant domain/infrastructure behavior. It is the main backend concentration point and therefore a high-blast-radius file.

Known responsibility groups include:
- Flask application/configuration;
- database/schema access;
- authentication/session/security behavior;
- tracker/profile/sync APIs;
- TMDB-facing application APIs and media data flow;
- backup/import/export and other application routes;
- health/runtime behavior.

Target:
- gradually become a thin compatibility/bootstrap entry while responsibilities move to tested package domains.

Migration rule:
- characterize behavior first;
- extract one complete responsibility at a time;
- do not combine high-risk persistence rewrites with file moves.

### Notifications transition

Canonical package modules now present:
- `tvtracker/notifications/backend.py`
- `tvtracker/notifications/engine.py`
- `tvtracker/notifications/push_and_movies.py`
- `tvtracker/notifications/runtime.py`

Root compatibility modules still present:
- `notifications_backend.py`
- `notification_engine.py`
- `final_notifications.py`
- `final_notifications_runtime.py`
- `notification_polish_runtime.py`

Current graph is transitional rather than final. Some package modules still consume root compatibility names, while root modules re-export/delegate to package modules. This is intentionally temporary and must not become the permanent dependency direction.

Target direction:

```text
app / worker / routes
        |
        v
tvtracker.notifications.*
        |
        +--> release timing service
        +--> database/storage boundary
        +--> optional Push component
```

No canonical `tvtracker` notification module should ultimately need to import a historical root `final_*`, `polish_*`, or compatibility notification module.

Removal conditions for root shims:
- all application/worker/test imports use canonical package paths;
- WSGI registration no longer depends on shim ordering;
- Push-off and Push-broken tests prove Notifications continue;
- notification schema/migration ownership is explicit;
- existing notification contracts pass end-to-end.

### Release timing

Canonical package modules:
- `tvtracker/release_timing/service.py`
- `tvtracker/release_timing/routes.py`

Compatibility modules:
- `release_timing.py`
- `release_timing_routes.py`

`tvtracker/release_timing/service.py` is a valuable architectural seam: release timing is resolved behind a provider-neutral contract, with optional TVmaze enrichment and TMDB fallback.

Preserve:
- TV Tracker owns release-timing behavior;
- providers submit timing candidates/enrichment;
- provider failure does not prevent core behavior;
- external provider IDs do not become canonical tracker identity.

Remove root shims only after every caller/test is package-native and route/startup contracts pass.

### TVmaze integration

Canonical module:
- `tvtracker/integrations/tvmaze.py`

Compatibility module:
- `tvmaze_integration.py`

Current provider-specific responsibilities include mapping, cache/schema, diagnostics, network behavior, and timing enrichment.

Target:
- remain a removable optional provider boundary under `tvtracker/integrations/`;
- no TVmaze-specific field becomes part of canonical tracker/user state;
- provider cache can be rebuilt/removed without user-data loss.

### Static asset versioning

Canonical module:
- `tvtracker/infrastructure/static_assets.py`

Compatibility module:
- `static_asset_versioning.py`

Target:
- infrastructure ownership under the package;
- root shim removed only after WSGI/application startup imports are canonical and tests cover asset URL/version behavior.

## Frontend ownership map

The current frontend remains a classic-script application with substantial global-state and load-order coupling. This is the primary reason future frontend migration must be incremental and ownership-based rather than a big-bang rewrite.

### `static/js/app.js`

Current role:
- primary global application state owner;
- contains `DATA` and large amounts of page/search/discover/upcoming/media/cache state;
- exposes and consumes global functions used by other scripts.

Target:
- shrink domain-by-domain as canonical frontend modules/components take ownership;
- tracker user state must not be rewritten merely to modernize file structure.

### `static/js/ui.js`

Current role:
- large renderer/controller layer;
- directly coupled to global state and global functions from other classic scripts.

Target:
- migrate one UI domain at a time;
- never allow legacy renderer and Vue component to permanently own the same DOM surface.

### `static/js/db.js`

Current role:
- browser persistence/cache/sync boundary;
- participates in IndexedDB/browser persistence and sync behavior;
- high data-integrity blast radius.

Target:
- treat as a protected persistence boundary until Phase 3 data-integrity invariants and characterization tests are complete;
- refactor sequence must be characterize -> move/encapsulate -> prove -> improve.

### Router

`static/js/app-router.js`

Current role:
- SPA route parsing/navigation/render dispatch;
- branch already contains canonical `/app/settings/...` route work.

Target:
- one canonical router/navigation owner;
- `search-navigation-fix.js` behavior absorbed into router/search ownership before the fix file disappears;
- direct URL, refresh, Back/Forward, auth redirect, mobile navigation, and old alias compatibility are regression-tested.

## Historical integrity/fix layers

These files are evidence of behaviors that must be preserved, not dead-code candidates.

### `static/js/duplicate-show-integrity.js`

Current behavior:
- wraps duplicate-show cleanup and stored-data loading;
- protects watched/progress information during duplicate normalization;
- historical template loading relies on repeated load count/readiness behavior.

Permanent owner:
- canonical tracker persistence/import normalization.

Removal condition:
- duplicate merge semantics captured in regression tests;
- canonical persistence/import path performs the repair safely;
- no duplicate script import is required;
- watched/history/favorite/status information survives normalization tests.

### `static/js/show-removal-integrity.js`

Current behavior:
- replaces/wraps show removal to preserve tracker/history/favorite integrity expectations.

Permanent owner:
- tracker state/persistence domain.

Removal condition:
- canonical remove operation has equivalent data-integrity behavior and regression coverage.

### `static/js/search-navigation-fix.js`

Current behavior:
- corrective search-navigation ownership in global scope.

Permanent owner:
- canonical router/search domain.

Removal condition:
- search result navigation, direct route, Back/Forward, and related regressions pass without the patch.

### `static/js/discover-stability.js`

Current behavior:
- wraps/replaces Discover rendering with stability guards.

Permanent owner:
- canonical Discover domain.

Removal condition:
- guard behavior is represented inside Discover ownership and regression-tested without monkey-patching `renderDiscoverHub`.

## Settings transition map

New branch modules:
- `static/js/settings.js`
- `static/js/adult-filter.js`
- `static/js/feedback.js`

`settings.js` is the transition toward one first-class Settings owner and the canonical routes:
- `/app/settings/profile`
- `/app/settings/auth`
- `/app/settings/notifications`
- `/app/settings/streaming`
- `/app/settings/data`
- `/app/settings/danger-zone`

During transition it still delegates some behavior to legacy/global functions. That delegation is temporary.

`adult-filter.js` is an initial central-policy layer. It must be audited in Phase 4 against every TMDB/media ingestion/display/cache path so adult titles cannot leak through alternate surfaces and existing tracked titles are hidden rather than deleted.

`feedback.js` is the initial shared user-feedback owner. Callers remain to be consolidated later; normal-user messages must never expose infrastructure/VAPID/server/crypto details.

### Streaming settings

`static/js/streaming-region.js`

Current role:
- owns region selection and provider-cache refresh/invalidation behavior;
- historically injects Settings UI behavior.

Permanent owner:
- Settings/Streaming UI plus a provider/cache service boundary.

Removal/absorption condition:
- canonical Settings renderer owns the UI;
- region changes preserve provider cache invalidation/refresh semantics;
- no MutationObserver/dynamic Settings ownership remains.

## Notifications frontend transition

Relevant layers:
- `static/js/notifications.js`
- `static/js/notifications-final.js`
- `static/js/notifications-polish.js`

Current state:
- notification behavior/UI is spread across base/final/polish historical layers;
- runtime patching and compatibility behavior still exist.

Target:
- one canonical Notifications frontend owner;
- one canonical Notification Settings UI under Settings;
- Push is a subordinate optional capability, not a dependency of Notifications.

Removal conditions for final/polish layers:
- every behavior is mapped to canonical ownership;
- Push on/off/broken paths pass;
- in-app Notifications work independently;
- notification Settings route/UI tests pass;
- no runtime injection/MutationObserver is required for ownership.

## Provider/release frontend helpers

### `static/js/release-timing.js`

Role:
- frontend release-timing client/helper.

Target:
- remain provider-neutral; UI should consume TV Tracker release timing, not know TVmaze internals.

### `static/js/provider-freshness.js`

Role:
- freshness/cache behavior around provider-derived information.

Target:
- move toward explicit media/provider service ownership instead of global patching.

### `static/js/discover-browse.js`

Role:
- Discover browsing behavior.

Target:
- consolidate with Discover renderer/stability behavior under one Discover domain.

## Template and script-load ownership

`templates/index.html` is currently both the main SPA shell and the classic-script composition root.

Risk:
- behavior can depend on script order, repeated imports, and globals becoming available before later scripts execute.

Target:
- during migration, keep explicit compatibility order stable;
- Vite/Vue assets must be introduced behind an explicit compatibility boundary;
- legacy script imports are removed only after the owning domain migrates;
- final application must not depend on duplicate imports or historical patch ordering.

## Build, test, and CI ownership

### `tests/run_all.py`

Current role:
- full regression orchestrator;
- discovers Python `test_*.py` tests and Node-based JS `test_*.js` tests.

Preserve until:
- any future test runner provides equal or stronger coverage;
- CI continues to run backend/frontend/architecture/data-integrity contracts.

### `.github/workflows/ci.yml`

Current branch concern:
- CI contains an `Apply architecture wave 2` step that runs `tools/apply_architecture_wave2.py` before the test suite.

This is transitional machinery only.

Permanent rule:
- CI should test the checked-in source tree, not silently transform source into the version that is tested.

Removal condition:
- all intended Wave 2 source changes are checked in directly;
- tests pass without the transform step;
- transformation script is no longer used by development/deployment.

### `tools/apply_architecture_wave2.py`

Classification: temporary branch migration utility.

Do not keep as permanent architecture.

Remove when:
- transformed output is the checked-in source of truth;
- CI no longer runs it;
- branch tests pass directly against repository contents.

### `package.json`

Current role:
- Tailwind/DaisyUI build tooling.

Current architecture does not yet contain the final Vue/Vite/TypeScript toolchain. That toolchain belongs to the later foundation phase and must first prove build/deploy compatibility.

### `.github/workflows/deploy.yml`

Current role:
- production deployment contract: test/build/install/pull/restart/health flow against AlwaysData.

Compatibility boundary:
- any Vite production build must become explicit and reproducible here (or via a CI artifact strategy) before frontend migration depends on it;
- production must not require a long-running Node process simply to serve the frontend.

## Current dependency graph summary

```text
Production web
wsgi.py
  -> app.py
  -> root compatibility modules
       -> tvtracker.notifications.*
       -> tvtracker.release_timing.*
       -> tvtracker.integrations.tvmaze
       -> tvtracker.infrastructure.*

Notification worker
notification_worker.py
  -> compatibility notification/release modules
  -> canonical package modules underneath

Browser
index.html
  -> classic scripts in ordered global scope
       -> app.js (global state)
       -> db.js (persistence/sync/cache)
       -> ui.js (render/control)
       -> router
       -> domain helpers
       -> historical integrity/fix/final/polish layers
       -> new Settings/adult-filter/feedback transition layers

Tests/CI
ci.yml
  -> temporary Wave 2 source transform [must disappear]
  -> tests/run_all.py
       -> Python regression tests
       -> Node JS regression tests
```

## High-risk dependency hotspots for later phases

1. `app.py`: high blast radius across auth, data, APIs, and runtime wiring.
2. `db.js`: user-data persistence/sync; must be governed by Phase 3 invariants before structural changes.
3. `app.js` / `ui.js`: extensive global coupling and implicit ownership.
4. `wsgi.py`: historical registration/load-order behavior around Notifications/Push.
5. Notifications base/final/polish/runtime layers: cross-cutting UI/backend/schema/runtime behavior.
6. Duplicate/removal integrity patches: directly protect user-state semantics.
7. `index.html` script order: implicit runtime dependency graph.
8. Temporary CI source transformation: test environment can differ from checked-in source.
9. Root-package compatibility imports: useful migration bridge but dangerous if they become circular/permanent.
10. Settings transition: new canonical ownership exists while legacy renderers/injection helpers still remain.

## Phase 3 inputs established by this map

The Data Integrity Audit must trace, at minimum:
- `app.py` database/schema/profile/tracker/sync/import/export writers;
- `static/js/db.js` persistence and pending-save behavior;
- global `DATA` mutation paths in `app.js`;
- duplicate-show repair;
- show removal;
- history/favorite/status/watch-progress semantics;
- notification/push/provider tables separately from core user state;
- backup schema and round-trip behavior;
- streaming/provider cache invalidation without user-state mutation;
- Adult Filter as a visibility preference only, never a deletion path.

## Phase 2 completion statement

The repository/runtime ownership and dependency map is now explicit enough to proceed to the data-integrity audit without guessing which layers own persistence, notification runtime, release timing, provider integration, routing, Settings, or historical repair behavior.

No file listed as transitional is authorized for deletion solely by this document. Every removal still requires its stated replacement and test gate.
