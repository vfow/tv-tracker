# Frontend Modernization Phase 3 — Settings Canary

## Scope

Phase 3 begins user-facing Vue migration with one deliberately narrow canary: **Settings → Streaming** (`/app/settings/streaming`).

The other Settings sections remain on the proven legacy Settings renderer during this phase:

- Profile
- Auth
- Notifications
- Data
- Danger Zone

This is not a whole-Settings rewrite and it is not a general `app.js` / `ui.js` refactor.

## Ownership boundary

`static/js/settings.js` remains the legacy Settings route/state/fallback owner. `static/js/settings-vue-bridge.js` is the single guarded handoff consumed by the existing router and global `renderSettings()` callers.

The bridge allowlists only `streaming` for Vue. When the Vue owner is attached, Streaming rendering moves to `frontend/src/settings/SettingsStreaming.vue`. When any other Settings section is active, Vue is unmounted before the legacy renderer runs.

The Vue bundle is loaded lazily through `static/js/settings-vue-loader.js` and `static/vue/manifest.json`. The Flask template does not pin a generated Vue filename.

## Fail-safe behavior

Vue loading is optional to the immediate availability of Settings during this canary:

1. the legacy Settings renderer is installed first;
2. the bridge requests Vue only for Streaming;
3. if the manifest or Vue bundle cannot load, the existing Streaming renderer continues to work;
4. load failure is reported through the privacy-safe client runtime telemetry;
5. a later request may retry loading Vue.

This gives the canary an application-level fallback in addition to normal deployment rollback.

## Data and API invariants

Phase 3 does not introduce a database migration, API route change, tracker schema change, backup format change, or sync format change.

Streaming Settings continues to persist through the existing profile state boundary:

`TVTrackerStreamingRegion.setStreamingRegion(...)` → `saveData({stateKeys:["profile"]})`

A failed save restores the previously selected region. Provider runtime caches are reset only after a successfully persisted region change.

## Sensitive-file rule

`static/js/app.js` and `static/js/ui.js` are load-bearing and remain protected. Phase 3 does not broadly edit, split, or clean either file. Existing calls to global `renderSettings()` continue through the guarded bridge.

Any future migration touching those files must characterize the specific dependency first and use the smallest possible handoff.

## Accessibility and lifecycle

The Vue Streaming combobox preserves keyboard-complete behavior for Arrow Up/Down, Home, End, Enter, Escape, and Tab, and exposes combobox/listbox ARIA state. Document listeners are removed when the Vue component unmounts.

## Exit gate

Phase 3 is ready to merge only when the exact PR head proves:

- Python and npm security audits are clean;
- Vue strict type-check and deterministic Vite build pass;
- the full regression suite passes;
- the real authenticated browser shell passes;
- all six Settings routes remain valid;
- the guarded canary tests prove fallback/attach/unmount behavior;
- `app.js` and `ui.js` are unchanged from the production base;
- generated Vue assets are committed and reproducible;
- no temporary write-enabled helper workflow remains.

Production rollout still requires a separate explicit merge authorization and the normal exact-SHA deployment/health gates.
