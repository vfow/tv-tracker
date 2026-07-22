# TV Tracker

Private Flask and PostgreSQL TV tracking website.

## Deployment

1. Commit changes to the private GitHub repository.
2. Connect to alwaysdata with SSH.
3. Run:

```bash
cd ~/www/tv-tracker
git pull --ff-only origin main
```

4. When `requirements.txt` changes, run:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

5. Restart the website from the alwaysdata dashboard.

Secrets and exported TV Tracker data must not be committed to GitHub.

## Phase 4 admin account

On the first Phase 4 startup, `APP_USERNAME` and `APP_PASSWORD_HASH` are copied once into PostgreSQL. After the database admin record exists, normal logins and account changes use PostgreSQL rather than the environment variables.

Keep the two environment variables during Phase 4 testing so a Phase 3 rollback still has credentials. After Phase 4 is verified, they may be removed. The application will not silently fall back to them after the database account exists.

### Emergency admin reset over SSH

Run this from the application directory:

```bash
cd ~/www/tv-tracker
.venv/bin/python tools/reset_admin.py
```

The command prompts securely for a new username and password, stores only an Argon2 hash, and invalidates every existing browser session.

## Phase 4 backups

Native backups use `backupVersion: 2` and `schemaVersion: 4`. Version 1 native backups remain supported. Native imports are validated before any live data changes and are committed as a single PostgreSQL transaction.

Tracker backups contain shows, History, profile, favorites, and tracker settings. They do not contain the admin password hash, login sessions, or security-attempt records.
