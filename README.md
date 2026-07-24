# TV Tracker v1.3.1

Private, single-admin TV tracking website built with Flask, PostgreSQL, HTML, CSS, and vanilla JavaScript.

## v1.3.1 Audit Repair

- Date-only episodes use a fixed 9:00 AM Kuala Lumpur fallback when no trustworthy timestamp exists.
- The unsolicited Release Time settings and per-show override controls have been removed.
- Upcoming uses the same shared row hover as Watchlist and History.
- Watched confirmation animations finish before the affected row or modal is redrawn.
- Show, Discover, and episode detail hero images use the original centered cover/crop fit with the original dark gradients.
- Failed saves are written to a persistent browser queue before network transmission, visibly marked as unsaved, replayed after reload, and removed only after server confirmation.
- Ordinary synchronization writes now receive strict per-record validation for shows, History, profile/state values, identifiers, arrays, numbers, and real calendar dates.
- Backup export validates stored records and refuses to export poisoned data.
- Reduced-motion users no longer wait through an invisible 560 ms confirmation delay.
- Impossible dates such as `2026-02-31` and invalid leap days are rejected instead of normalized.
- SSH administrator recovery can explicitly recreate a missing singleton admin row.
- First-time administrator insertion is conflict-safe when multiple workers start together.
- The obsolete localhost `POST /api/backup` client code has been removed.
- Permanent Python and Node regression tests, plus a GitHub Actions workflow, cover authentication, CSRF, malformed synchronization, conflict detection, backups, release-date boundaries, impossible dates, reduced motion, and durable failed saves.

## Production deployment

1. Commit the release files to the private GitHub repository.
2. Connect to alwaysdata over SSH.
3. Pull the release:

```bash
cd ~/www/tv-tracker
git pull --ff-only origin main
```

4. Install requirements only when `requirements.txt` changes:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

5. Restart the website from the alwaysdata dashboard.
6. Hard-refresh desktop and mobile browsers after a frontend release.

Do not commit secrets, database credentials, exported tracker backups, or user data to GitHub.

Source archives distributed outside the private repository may omit the League Gothic font binary. Preserve the existing `static/assets/league-gothic.regular.ttf` file when restoring from such an archive.

## Normal updates

The live application directory is:

```text
/home/broghgf7/www/tv-tracker
```

The normal update command is:

```bash
cd ~/www/tv-tracker
git pull --ff-only origin main
```

Restart the site after changes to Python, templates, or environment configuration.

## Admin account

TV Tracker has one private admin account. The username and password can be changed from **Settings → Admin Account**. The current password is required. A successful change invalidates every existing browser session.

On the first Phase 4-or-later startup, `APP_USERNAME` and `APP_PASSWORD_HASH` are copied once into PostgreSQL. After the database admin record exists, PostgreSQL is the authoritative login source and the application does not silently fall back to the environment credentials.

### Emergency admin recovery over SSH

```bash
cd ~/www/tv-tracker
.venv/bin/python tools/reset_admin.py
```

The recovery tool checks database access before prompting, stores only an Argon2 password hash, and invalidates every existing browser session. If the singleton administrator row is missing, it can recreate it only after you type `RECREATE` explicitly.

### Removing bootstrap environment credentials

Remove `APP_USERNAME` and `APP_PASSWORD_HASH` only after all of the following have passed on the stable build:

- normal login;
- username change;
- password change;
- session invalidation on another device;
- SSH recovery;
- a fresh source and data backup.

Keep `SECRET_KEY` and all database environment variables configured.

## Episode release-time rules

TV Tracker separates the episode calendar date from the instant when the episode becomes available.

1. A valid exact timestamp is authoritative and is displayed in the browser timezone.
2. A date without a trustworthy exact timestamp uses the fixed `09:00` fallback in `Asia/Kuala_Lumpur`.
3. Estimated fallback times are displayed with `~`.
4. A bare `air_time` value is ignored unless a trustworthy source timezone is available.

The fallback is internal and is not exposed as a Settings or per-show control.

## Backups and restore

Native exports use:

```json
{
  "backupVersion": 2,
  "schemaVersion": 4
}
```

Version 1 native backups remain supported. Imports are validated before live data changes and are committed as a single PostgreSQL transaction: either the complete import succeeds or the existing tracker remains unchanged.

Tracker backups contain shows, History, profile, favorites, and tracker settings. They do not contain the admin password hash, login sessions, failed-login records, API keys, or database credentials.

Before a deployment or large import:

1. Export a fresh App Backup JSON.
2. Keep a complete source ZIP for the currently working release.
3. Confirm the backup summary counts for shows, History, and favorites.

## Emergency rollback

1. Restore the complete source files from the last known-good release in the private GitHub repository.
2. Pull them on alwaysdata:

```bash
cd ~/www/tv-tracker
git pull --ff-only origin main
```

3. Restart the website.
4. Hard-refresh the browser.

A code rollback does not delete PostgreSQL tracker data. Be aware that releases older than Phase 4 use `APP_USERNAME` and `APP_PASSWORD_HASH` for login, so those values are required if rolling back to such a release.

## Health check

While logged in, open:

```text
/api/health
```

A healthy stable installation reports an available database and `schemaVersion` 4 without exposing credentials.

## Regression tests

Run the stored backend and frontend suite before deployment:

```bash
python tests/run_all.py
```

The same suite runs automatically through `.github/workflows/audit-tests.yml`.

## Stable release checklist

- Login and logout work.
- Sign-in button becomes ready after four password characters; the server still verifies the complete credential.
- Admin username/password changes and SSH recovery work.
- Watching, Upcoming, History, Discover, Profile, and Settings work on desktop and mobile.
- Episode and season watch/unwatch rules update immediately.
- Watchlist ordering uses exact activity time.
- Cross-device synchronization works without losing updates.
- Show and episode details open centered and use the intended heading font.
- Date-only episodes default to approximately 9:00 AM in Asia/Kuala_Lumpur; exact timestamps remain authoritative.
- Bare source times without a trustworthy timezone are not treated as Malaysian local time.
- Upcoming rows show the standard hover highlight on pointer devices.
- Valid backup import succeeds; malformed or unsupported backups are rejected without changing live data.
- `/api/health` reports schema version 4.
- A fresh JSON backup and complete source archive are stored safely.

## Release tag

The stable Git tag is:

```text
v1.3.1
```
