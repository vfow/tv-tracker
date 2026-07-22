# TV Tracker v1.3.0 Stable

Private, single-admin TV tracking website built with Flask, PostgreSQL, HTML, CSS, and vanilla JavaScript.

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

The recovery tool checks database access before prompting, stores only an Argon2 password hash, and invalidates every existing browser session.

### Removing bootstrap environment credentials

Remove `APP_USERNAME` and `APP_PASSWORD_HASH` only after all of the following have passed on the stable build:

- normal login;
- username change;
- password change;
- session invalidation on another device;
- SSH recovery;
- a fresh source and data backup.

Keep `SECRET_KEY` and all database environment variables configured.

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

## Stable release checklist

- Login and logout work.
- Sign-in button becomes ready after four password characters; the server still verifies the complete credential.
- Admin username/password changes and SSH recovery work.
- Watching, Upcoming, History, Discover, Profile, and Settings work on desktop and mobile.
- Episode and season watch/unwatch rules update immediately.
- Watchlist ordering uses exact activity time.
- Cross-device synchronization works without losing updates.
- Show and episode details open centered and use the intended heading font.
- Valid backup import succeeds; malformed or unsupported backups are rejected without changing live data.
- `/api/health` reports schema version 4.
- A fresh JSON backup and complete source archive are stored safely.

## Release tag

The stable Git tag is:

```text
v1.3.0
```
