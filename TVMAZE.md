# TVmaze Release Timing

TVmaze is optional enrichment. TMDB remains the canonical TV Tracker identity and the permanent fallback. TVmaze IDs, mappings, episode payloads, and timing caches are disposable provider data and are not part of App Backup or core tracker state.

## Feature switches

All switches default to `false` and `TVMAZE_ENABLED` is the master gate.

- `TVMAZE_ENABLED` — permits the optional provider boundary to exist at runtime. When false, TV Tracker does not import/configure `tvmaze_integration.py`.
- `TVMAZE_SHADOW_ENABLED` — allows provider lookups/cache warming without granting visible timing authority.
- `TVMAZE_UPCOMING_ENABLED` — allows trusted TVmaze candidates to affect Upcoming and episode loggability.
- `TVMAZE_NOTIFICATIONS_ENABLED` — independently allows trusted TVmaze candidates to affect notification release boundaries.

Disabling `TVMAZE_ENABLED`, or removing `tvmaze_integration.py`, must immediately return the application to TMDB-only timing without changing routes, tracker identity, watched state, or history.

## Notification worker cadence

Exact release data can only produce timely alerts if `notification_worker.py` is scheduled frequently enough by the production host. Before enabling `TVMAZE_NOTIFICATIONS_ENABLED`, verify the external Alwaysdata scheduled job and its real cadence. A cadence of five minutes or less is recommended for near-release alerts. The repository cannot prove an external host schedule by itself, so this is a deployment acceptance check rather than a code assumption.

## Rollout acceptance

Before merge or production enablement: run `python tests/run_all.py`, the targeted TVmaze/notification tests, and the provider-removal/destruction acceptance gate. Keep the master switch off until those checks pass on the final commit.
