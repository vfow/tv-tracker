# Frontend Modernization Phase 4D — Data / Backup Settings

## Scope

Phase 4D makes `/app/settings/data` the fifth guarded Vue-owned Settings surface, after Streaming, Notifications, Profile, and Auth.

This phase changes frontend rendering ownership only. It does not redesign backup formats, import validation, tracker persistence, report generation, sync, or the Flask API.

## Ownership boundary

Vue owns:

- the Data Settings shell and tabs;
- the three summary counters;
- the export/import/report button markup;
- mount/unmount lifecycle for `/app/settings/data`.

Existing legacy services remain authoritative for:

- backup summary generation (`getBackupSummary`);
- native App Backup JSON creation/download (`exportNativeBackupJSON`);
- native App Backup JSON file selection, parsing, validation, compatibility handling, confirmation, and import (`importNativeBackupJSON`);
- readable HTML report creation/download (`exportHTMLReport`);
- tracker-data persistence and revision/sync behavior behind those services.

## Data-safety invariants

The Vue component does not parse, validate, serialize, transform, or persist backup data.

It does not call `fetch`, does not introduce a new `/api/` route, does not use `FileReader`, and does not create its own file input. The existing backup/import service functions retain all data-sensitive behavior.

No native backup schema/version or tracker-data format changes are introduced by this phase.

## Fallback

`static/js/settings.js` remains the legacy Data renderer while the guarded canary is active. If the manifest-driven Vue bundle cannot load or attach, the bridge falls back to the legacy renderer and bindings.

## Explicitly out of scope

- Danger Zone remains legacy-owned.
- `static/js/app.js` is not modified for this phase.
- `static/js/ui.js` is not modified for this phase.
- No backend, database, schema, sync, tracker-data, or backup-format migration is introduced.

## Exit gate

Phase 4D is ready only when:

1. strict Vue/TypeScript build passes;
2. the real-browser Data canary proves Vue ownership on `/app/settings/data`;
3. source contracts prove backup/import/report logic remains behind existing services;
4. existing backup compatibility, import validation, persistence, and security tests remain green;
5. the full regression suite passes;
6. the temporary asset-generation workflow is removed before PR review;
7. `app.js` and `ui.js` are absent from the final branch diff.
