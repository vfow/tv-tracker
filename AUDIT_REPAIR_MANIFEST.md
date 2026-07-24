# TV Tracker v1.3.1 Audit Repair Manifest

This release is built from the approved `v1.3.1 Audit Repair + original image fit` full source and preserves the existing visual design, database schema version, tracker data format, hero-image cover/crop behavior, hover appearance, and episode interactions.

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
