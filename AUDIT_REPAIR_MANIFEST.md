# TV Tracker v1.3.1 Audit Repair Manifest

This release is built from the approved v1.3.1 schedule-and-status-controls source. It preserves the database schema version, tracker data format, hero-image cover/crop behavior, hover appearance, silent save queue, Watchlist status controls, and episode progress. The timing update documented below removes location-specific assumptions without changing the design.

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
- TMDB-canonical dates, exact TVmaze clock extraction, browser-local conversion, and date-only end-of-day boundaries;
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

The changed-files archive is cumulative against:

```text
tv-tracker-v1.3.1-audit-repair-schedule-status-controls-full.zip
```

Overlay the changed files onto that exact approved source, preserving paths, then restart the Flask website. The new script cache version loads the timing update without changing database data.

## Silent background saving

The durable pending-save queue, reload recovery, server confirmation, and automatic retries remain enabled. All save-state banners and automatic save/synchronization toasts are intentionally disabled. Older cached `tv-unsaved-status` elements are removed when the new build initializes.

## Browser-local episode timing

- TMDB controls the official episode date for display, grouping, countdowns, and availability-day boundaries.
- TVmaze is matched by exact season and episode number and contributes only its clock time; its date never overrides a valid TMDB date.
- An offset-bearing TVmaze `airstamp` is required. The clock is attached to the TMDB date and converted by the browser to the device's current timezone.
- Only local 12-hour time is displayed. Source time and source timezone are never shown.
- No Malaysia-specific timezone, fixed UTC offset, invented fallback hour, manual timezone setting, or `~` marker remains.
- Without a trustworthy time, the website displays only the date and keeps the episode Upcoming through the end of that date in the device timezone.
- Successful metadata refreshes clear stale TVmaze timing fields before applying current exact-match data.
- The change preserves silent background saving, schema version 4, original image fit, hover styling, Watchlist status controls, and all approved audit repairs.

The changed-files patch is based on:

```text
tv-tracker-v1.3.1-audit-repair-schedule-status-controls-full.zip
```

## Watchlist status-control correction

- Paused, Plan To Watch, and Dropped cards use one empty circular control with no play or restore glyph.
- Activating the control changes the show to Watching while retaining watched-episode progress.
- Completed cards render only the green `✓ Completed` label and no trailing action circle.
- All modal status controls remain available from every filter.
- Browser-local episode timing, the silent save queue, original image fit, and all audit safeguards remain unchanged.

The Watchlist status-control work remains inherited from:

```text
tv-tracker-v1.3.1-audit-repair-schedule-status-controls-full.zip
```
