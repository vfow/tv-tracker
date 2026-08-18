# TV Tracker Architecture Migration

This branch performs the whole-system stabilization and future-proofing batch.

## Safety order

1. Owner and user safety/security.
2. User-data integrity and recoverability.
3. Backward compatibility and production reliability.
4. UX/accessibility and product requirements.
5. Architecture and repository cleanliness.

## Wave 1 — canonical package boundaries

The first implementation wave is intentionally behavior-preserving. Notification, release-timing, integration and infrastructure implementations move under the `tvtracker` package. Temporary root compatibility shims preserve older imports while the remaining callers and tests move to canonical package paths.

No tracker-state schema, backup format, route, Push behavior, TMDB identity rule or notification behavior is intentionally changed in this wave.

Compatibility shims are transitional and must be removed only after every caller targets the canonical module and regression coverage proves equivalent behavior.
