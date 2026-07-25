# TV Tracker v1.3.1 Audit Repair Manifest

This release is built from the approved v1.3.1 schedule-date-corrected Audit Repair source. It preserves the database schema version, tracker data format, hero-image cover/crop behavior, hover appearance, schedule correction, silent save queue, and episode progress. The only visual interaction change is the user-approved Watchlist status-control correction documented below.

## Reliability repairs included

1. Durable browser save queue with automatic retry, reload recovery, and idempotent operation IDs. Save and synchronization status run silently in the background.
2. Strict validation of ordinary synchronization writes for shows, History records, profile/state records, identifiers, dates, timestamps, numbers, arrays, watched episodes, and supported state keys.
3. Backup-export validation that blocks malformed stored records rather than producing a poisoned backup.
4. Reduced-motion-aware watched confirmation with no invisible 560 ms delay.
5. Strict real-calendar date validation in Python and JavaScript.
6. SSH administrator recovery that can recreate the missing singleton row only after explicit `RECREATE` confirmation.
7. Removal of the obsolete localhost-only `POST /api/backup` frontend code.
8. Conflict-safe first-time administrator creation using `ON CONFLICT DO NOTHING`.
9. Stored Python and Node regression tests plus a GitHub Actions workflow.

## Regression coverage

The stored suite covers:

- authentication and CSRF enforcement;
- malformed synchronization writes and conflict detection;
- malformed backup import and poisoned backup export;
- impossible dates and leap-day handling;
- the 9:00 AM Kuala Lumpur estimated-release boundary;
- reduced-motion behavior;
- persistent pending-save survival across reload and removal only after confirmation;
- conflict-safe administrator bootstrap and explicit administrator recreation;
- removal of the obsolete backup POST contract.

Run before deployment:

```bash
python -m pip install -r requirements.txt
python tests/run_all.py
```

The same command runs in `.github/workflows/audit-tests.yml`.

## Patch installation

The patch archive is cumulative against:

```text
tv-tracker-v1.3.1-audit-repair-status-hotfix-full.zip
```

Overlay the patch files onto that exact approved source, preserving paths, then restart the Flask website and hard-refresh browsers.

## Silent background saving

The durable pending-save queue, reload recovery, server confirmation, and automatic retries remain enabled. All save-state banners and automatic save/synchronization toasts are intentionally disabled. Older cached `tv-unsaved-status` elements are removed when the new build initializes.

## Schedule calendar-date correction

- The official episode `air_date` is now canonical for display, grouping, countdowns, and availability-day boundaries.
- TVmaze dates are fallback-only and no longer override a valid primary date by one day.
- Exact timestamps are accepted only when their `Asia/Kuala_Lumpur` calendar date matches the canonical episode date.
- Conflicting timestamps fall back to the existing estimated `~9:00 AM` policy.
- The change preserves silent background saving, schema version 4, original image fit, hover styling, and all approved audit repairs.

The cumulative patch is based on:

```text
tv-tracker-v1.3.1-audit-repair-silent-background-full.zip
```

## Watchlist status-control correction

- Paused, Plan To Watch, and Dropped cards use one empty circular control with no play or restore glyph.
- Activating the control changes the show to Watching while retaining watched-episode progress.
- Completed cards render only the green `✓ Completed` label and no trailing action circle.
- All modal status controls remain available from every filter.
- The schedule calendar-date correction, silent save queue, original image fit, and all audit safeguards remain unchanged.

The cumulative patch is based on:

```text
tv-tracker-v1.3.1-audit-repair-schedule-date-full.zip
```
