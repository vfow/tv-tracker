# TVmaze Release Timing

TVmaze is optional enrichment. TMDB remains the canonical TV Tracker identity and the permanent fallback. TVmaze IDs, mappings, episode payloads, and timing caches are disposable provider data and are not part of App Backup or core tracker state.

## Feature switches

All switches default to `false` and `TVMAZE_ENABLED` is the master gate.

- `TVMAZE_ENABLED` — permits the optional provider boundary to exist at runtime. When false, TV Tracker does not import/configure `tvmaze_integration.py`.
- `TVMAZE_SHADOW_ENABLED` — allows provider lookups/cache warming without granting visible timing authority.
- `TVMAZE_UPCOMING_ENABLED` — allows trusted TVmaze candidates to affect Upcoming and episode loggability.
- `TVMAZE_NOTIFICATIONS_ENABLED` — independently allows trusted TVmaze candidates to affect notification release boundaries.

There are no additional TVmaze environment switches. Exact/date authority inside the resolver is derived from the approved Upcoming or Notifications capability rather than from hidden provider flags.

Disabling `TVMAZE_ENABLED`, or removing `tvmaze_integration.py`, must immediately return the application to TMDB-only timing without changing routes, tracker identity, watched state, or history.

## Canonical release contract

The browser receives provider-neutral timing. Provider IDs and raw TVmaze fields never cross this boundary.

```json
{
  "releaseAt": "2026-08-16T01:00:00+00:00",
  "releaseDate": "2026-08-16",
  "eligibleAt": "2026-08-16T01:00:00+00:00",
  "displayDate": "2026-08-16",
  "precision": "exact",
  "confidence": "verified",
  "providerUsed": true
}
```

`releaseAt` is `null` for date-only timing. `precision` is `exact` or `date`; `confidence` is `verified` or `fallback`. `eligibleAt` is the absolute boundary TV Tracker uses for loggability/date-only availability in the effective timezone.

## Exact-time validation and freshness

An exact TVmaze candidate requires all of the following: a verified show mapping, an exact ordinary season/episode match, a valid announced `HH:MM` airtime, a timezone-aware `airstamp`, country-backed timezone context, and agreement between the announced wall-clock date/time and the timestamp after conversion into that timezone. Global web channels without country/timezone context remain date-only even if TVmaze supplies an `airstamp`.

Near-term exact releases are cached for about one hour around the release boundary so schedule changes can be picked up promptly. Farther successful timing remains cached for about six hours; negative episode results are cached temporarily. Mapping cache remains longer-lived but is rejected when current TMDB IMDb/TVDB external IDs no longer match the stored mapping.


## Notification worker cadence

Exact release data can only produce timely alerts if `notification_worker.py` is scheduled frequently enough by the production host. Before enabling `TVMAZE_NOTIFICATIONS_ENABLED`, verify the external Alwaysdata scheduled job and its real cadence. A cadence of five minutes or less is recommended for near-release alerts. The repository cannot prove an external host schedule by itself, so this is a deployment acceptance check rather than a code assumption.

## Rollout acceptance

Before merge or production enablement: run `python tests/run_all.py`, the targeted TVmaze/notification tests, and the provider-removal/destruction acceptance gate. Keep the master switch off until those checks pass on the final commit.
