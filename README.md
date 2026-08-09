# TV Tracker

Single-admin TV tracking website built with Flask, PostgreSQL, TMDB, and a Tailwind-only frontend.

## Features

- Tracks Watching, Paused, Completed, Plan To Watch, and Dropped shows.
- Stores watched episodes, progress, history, favourites, notes, profile details, posters, backdrops, and imported metadata in PostgreSQL.
- Uses TMDB for search, show and episode metadata, artwork, cast and crew, trailers, alternative titles, similar shows, and Where to Watch.
- Keeps the TMDB API key on the Flask server. It is never sent to the browser or placed in a URL.
- Supports native App Backup JSON export/import and compatible external JSON/CSV imports.
- Uses revision-based optimistic synchronization for multiple tabs and devices.
- Supports refresh-safe app, show, and episode URLs.

## Tech Stack

- Backend: Flask, psycopg, PostgreSQL, Argon2 password hashing.
- Frontend: plain JavaScript and Tailwind CSS.
- Styling: `static/css/tailwind-input.css` compiled to `static/css/tailwind.css`.
- Tests: Python unittest plus Node-based frontend contract checks.
- Deployment: GitHub Actions deploy to Alwaysdata over SSH.

## Project Structure

```text
app.py                 Flask app, auth, routes, backup/import, TMDB proxy, PostgreSQL sync
wsgi.py                WSGI entrypoint
requirements.txt       Python dependencies
package.json           Tailwind build scripts
templates/             Login, error, and protected app templates
static/css/            Tailwind source and generated CSS
static/js/             UI, router, TMDB client, persistence, and sync logic
static/assets/         Local font and UI icons
tests/                 Backend, route, source-contract, and frontend checks
tools/                 Admin and secret helper scripts
```

## Environment

Required variables are listed in `.env.example`:

```text
SECRET_KEY
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
APP_USERNAME
APP_PASSWORD_HASH
TMDB_API_KEY
```

Optional production hardening variables:

```text
TRUST_PROXY_HEADERS=1       # Set only behind a trusted reverse proxy such as Alwaysdata.
HEALTHZ_SECRET=<token>      # When set, /healthz requires X-Healthcheck-Token.
```

Existing deployments may still use `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` as fallbacks. Generate `APP_PASSWORD_HASH` with the helper under `tools/`. New admin passwords must contain at least 16 characters. Do not commit `.env`, database dumps, API keys, password hashes for real users, SSH keys, or deployment credentials.

## Public Repository Safety

This repository can be public because runtime secrets and personal data must stay outside the source tree. Do not commit `.env`, real API keys, database dumps, App Backup exports, SSH keys, password hashes for real users, private deployment tokens, or redistributable-restricted font files. Keep production values in the hosting provider and GitHub Actions secrets/variables.

## Local Development

Install Python dependencies:

```text
python -m pip install -r requirements.txt
```

Install frontend dependencies:

```text
npm ci
```

Set the required environment variables in your shell or host config, then run Flask:

```text
flask --app app run --debug
```

The app expects a reachable PostgreSQL database and a valid TMDB API key for normal use.

## Tailwind CSS

Templates load only `static/css/tailwind.css` for application styling.

Build CSS after editing `static/css/tailwind-input.css` or changing Tailwind class usage:

```text
npm run css:build
```

Watch Tailwind during UI work:

```text
npm run css:watch
```

On Windows PowerShell, use `npm.cmd run css:build` or `npm.cmd run css:watch` if script execution policy blocks `npm`.

## Routes And Authentication

All application pages require a valid authenticated session. The client uses one shared route parser for startup, normal SPA navigation, browser history, and direct links.

Canonical route families include:

```text
/app/list/watching
/app/list/paused
/app/list/completed
/app/list/plan-to-watch
/app/list/dropped
/app/upcoming
/app/history
/app/discover
/app/discover/tv/<category>
/app/discover/movie/<category>
/app/search?q=<query>&type=tv|movie|person
/app/show/<tmdb_id>-<slug>
/app/show/<tmdb_id>-<slug>/season/<season_number>/episode/<episode_number>
/app/movie/<tmdb_id>-<slug>
/app/person/<tmdb_id>-<slug>
/app/genre/tv/<genre_slug>
/app/genre/movie/<genre_slug>
/app/theme/<tmdb_keyword_id>-<slug>
/app/theme/movie/<tmdb_keyword_id>-<slug>
/app/network/<tmdb_id>-<slug>
/app/company/<tmdb_id>-<slug>
/app/provider/<tmdb_id>-<slug>
/app/language/<code>-<slug>
/app/country/<code>-<slug>
/app/year/<year>
/app/status/<status>
/app/certification/tv/<certification>
/app/certification/movie/<certification>
/app/profile
/app/settings
```

`/app` redirects to `/app/list/watching`. Obsolete aliases such as `/app/watchlist`, bare `/app/list`, role-specific person routes, and untyped genre routes are not part of the routing system. ID-based detail routes may be accepted without a slug long enough to load the referenced TMDB entity; the client then replaces the address with the canonical readable URL without adding a browser-history entry.

`/login` opens the public authentication page. `/signup` redirects to the same page with the Sign Up tab selected, where registration currently displays `Registration coming soon`.

Protected paths requested before login are validated and stored in the server session. After login, the user returns to the validated application path; otherwise the destination is `/app/list/watching`.

Route URLs contain only public TMDB identifiers, route slugs, filter values, and numeric season/episode positions. Personal statuses, watched progress, notes, profile data, tokens, credentials, and API keys are never included in generated URLs.

## Data Safety

The app keeps metadata in existing JSONB show records and preserves native backup compatibility. Existing data remains authoritative for shows, statuses, watched progress, history, favourites, notes, profile details, and imported metadata.

Export a fresh App Backup JSON before deploying major changes.

## Tests

Run the full local regression suite:

```text
python tests/run_all.py
```

The suite checks backend contracts, route protection, source contracts, JavaScript syntax, frontend behavior, synchronization reliability, TMDB proxy usage, asset references, and the Tailwind-only frontend contract.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`. The workflow installs Python and frontend dependencies, builds Tailwind CSS, confirms the generated CSS is committed, runs `python tests/run_all.py`, connects to Alwaysdata with repository secrets, pulls the latest code, and verifies the live health endpoint.

Configure these GitHub Actions **Secrets**:

```text
ALWAYSDATA_HOST
ALWAYSDATA_USER
ALWAYSDATA_SSH_KEY
ALWAYSDATA_HEALTH_TOKEN    # Only required if HEALTHZ_SECRET is set in production.
```

Configure these GitHub Actions **Variables**:

```text
ALWAYSDATA_APP_DIR         # Example: ~/www/tv-tracker
ALWAYSDATA_HEALTH_URL      # Example: https://your-site.alwaysdata.net/healthz
```

The SSH deploy step runs:

```text
cd "$ALWAYSDATA_APP_DIR"
git pull --ff-only origin main
```

Use the same `git pull --ff-only origin main` command manually over SSH if the workflow is unavailable. After a manual pull, open `/healthz` to confirm the health check returns `{"ok":true}`. If `HEALTHZ_SECRET` is set, include the `X-Healthcheck-Token` header. Then sign in and open `/api/health` for the detailed private check.

Deployment checklist:

1. Export a fresh App Backup JSON from the currently deployed tracker.
2. Keep the existing environment variables and PostgreSQL database.
3. Pull or deploy the latest source.
4. Install dependencies from `requirements.txt` if needed.
5. Rebuild and commit Tailwind CSS before deployment if frontend classes changed.
6. Restart the WSGI application.
7. Hard-refresh the browser to clear older cached frontend assets.
8. Test login, existing shows, episode progress, history, profile, backups, Discover, direct show URLs, and direct episode URLs.
