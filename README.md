# TV Tracker v1.7 Candidate

Private Flask and PostgreSQL TV tracking website. TV Tracker uses TMDB for show search, show metadata, posters, backdrops, seasons, episodes, release dates, and upcoming schedule data.

## What this project does

- Tracks shows across Watching, Paused, Completed, Plan To Watch, and Dropped.
- Stores watched episodes, watch history, favorites, profile details, notes, posters, backdrops, and imported progress.
- Imports native TV Tracker backups and compatible external JSON/CSV exports.
- Exports a native App Backup JSON that can restore the tracker state.
- Exports a readable HTML report of the current tracker data.
- Uses optimistic server synchronization so multiple tabs/devices can work safely.

## Data safety

Native App Backup JSON import is an exact restore. It validates the full backup before replacing the current tracker data and does not recalculate statuses during restore.

The cleanup in this candidate removes only unused legacy metadata from imported data, saved data, and future exports. It does not remove shows, watched history, statuses, favorites, profile data, notes, TMDB identifiers, posters, backdrops, or manual user data.

`import_info` remains supported as harmless import history. It is kept in exports only when it already exists or when an import actually creates it.

## Episode release behavior

TMDB `air_date` is treated as the official calendar date. If there is no trusted exact release time, the episode remains Upcoming until that local calendar date ends, then becomes available after local midnight on the browser/device.

No release-time setting is exposed in the interface.

## Project structure

```text
app.py                 Flask backend, authentication, backup import/export, TMDB proxy, PostgreSQL sync
wsgi.py                WSGI entrypoint
requirements.txt       Python dependencies
templates/             Flask templates
static/js/             Frontend application code
static/css/            Stylesheets
static/assets/         Icons, favicon, local assets
tests/                 Syntax, backend contract, and frontend regression checks
tools/                 Admin/secret helper scripts
```

## Environment variables

Required backend variables:

```text
SECRET_KEY
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
ADMIN_USERNAME
ADMIN_PASSWORD_HASH
TMDB_API_KEY
```

`ADMIN_PASSWORD_HASH` should be generated with the helper tool in `tools/`.

## Local/deployment notes

1. Install Python dependencies from `requirements.txt`.
2. Configure the required environment variables.
3. Start the Flask app through the WSGI entrypoint or your hosting provider.
4. Open the site and confirm `/api/health` responds after signing in.
5. Export an App Backup JSON before major updates.

## Preferred install for this candidate

Use the full ZIP as the new project source when possible. This produces the cleanest baseline for future work.

Alternative manual patch install:

1. Export a fresh App Backup JSON.
2. Extract the patch ZIP over the current project.
3. Compare with the full ZIP and delete any obsolete files that are no longer part of the clean baseline.
4. Commit, deploy, restart the website, and hard-refresh the browser.

## Testing

Before using this candidate as the final baseline, verify:

- Settings no longer contains a Source section.
- Native App Backup JSON import works.
- Show statuses do not change during native backup restore.
- Watched history, favorites, profile, and notes remain intact.
- New App Backup JSON exports are clean and importable.
- Show search, show details, season loading, Upcoming, and artwork work through TMDB.
- `/api/health` reports the expected schema version.

Future patches should be based on this cleaned TMDB-only baseline once it is confirmed live.
