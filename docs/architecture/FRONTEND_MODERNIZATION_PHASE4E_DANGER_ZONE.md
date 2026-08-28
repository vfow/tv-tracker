# Frontend Modernization Phase 4E — Danger Zone

## Scope

Phase 4E migrates `/app/settings/danger-zone` to the guarded Vue Settings owner.

This is a UI-ownership migration only. It does not redesign destructive tracker actions or enable account-management features that are currently unavailable.

## Ownership

Vue now owns the Danger Zone Settings markup and lifecycle through `frontend/src/settings/SettingsDanger.vue`.

The existing browser service boundary remains authoritative:

- `resetTrackerData()` owns tracker-reset confirmation and execution.
- The existing destructive confirmation policy remains outside Vue.
- Existing tracker persistence, sync/revision behavior, and client cleanup remain unchanged.
- Account deactivation remains unavailable and disabled.
- Account deletion remains unavailable and disabled.

The legacy `renderDanger()` and `bindDanger()` implementation remains loaded as the lazy-load/fail-safe Settings fallback during the guarded migration.

## Safety constraints

Phase 4E must not:

- duplicate `resetTrackerData()` state mutation in Vue;
- add a new reset endpoint or API contract;
- move destructive confirmation policy into Vue;
- replace the existing app confirmation flow with browser-native `confirm()`;
- enable account deactivation;
- enable account deletion;
- introduce account deletion/deactivation transport;
- change tracker schemas, backup formats, persistence semantics, or database behavior;
- modify `static/js/app.js` or `static/js/ui.js` for the migration.

## UI contracts preserved

The Vue surface preserves:

- `/app/settings/danger-zone` routing;
- the `reset-data-button` element contract;
- the `Reset Tracker Data` action;
- the disabled `Deactivate account` placeholder and availability note;
- the disabled `Delete account` placeholder and availability note;
- the existing Account Settings tab navigation.

## Validation

Phase 4E adds:

- a source/ownership contract proving direct delegation to `resetTrackerData()`;
- assertions that Vue does not duplicate destructive confirmation, transport, storage cleanup, or tracker mutation;
- a real-browser `/app/settings/danger-zone` Vue ownership canary;
- Phase 14 ownership coverage for all six current Settings sections;
- historical Phase 4D coverage that remains valid without freezing later canaries.

The deterministic Vue bundle must be rebuilt with strict type checking before review, and the temporary write-enabled asset-generation workflow must be removed from the final diff.

## Next phase

Phase 4F completes the Settings migration and addresses the remaining transitional legacy ownership/fallback structure after all six current Settings surfaces have proven Vue owners.
