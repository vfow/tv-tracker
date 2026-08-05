# TV Tracker V2 — Flask/PostgreSQL Integration

Private, single-admin TV tracking website. This build integrates the V2.9 interface and dedicated show/episode pages into the real Flask and PostgreSQL application.

## Core capabilities

- Tracks Watching, Paused, Completed, Plan To Watch, and Dropped shows.
- Stores watched episodes, progress, history, favourites, profile details, notes, posters, backdrops, and imported data in PostgreSQL.
- Uses TMDB for search, show/episode metadata, artwork, cast and crew, trailers, alternative titles, recommendations, similar shows, and Where to Watch.
- Keeps the TMDB API key on the Flask server. It is never sent to the browser or placed in a URL.
- Supports native App Backup JSON export/import and compatible external JSON/CSV imports.
- Uses revision-based optimistic synchronization for multiple tabs/devices.

## Protected application routes

All application pages require a valid authenticated session:

```text
/app/watchlist
/app/upcoming
/app/history
/app/discover
/app/profile
/app/settings
/app/show/<tmdb_id>
/app/show/<tmdb_id>/season/<season_number>/episode/<episode_number>
```

`/app` redirects to `/app/watchlist`. Direct refresh, browser back/forward navigation, show pages, and episode pages use real server-supported paths rather than hash-only routes.

Show and episode URLs contain only public TMDB routing identifiers and numeric season/episode positions. Personal statuses, watched progress, notes, profile data, tokens, credentials, and API keys are never included in generated URLs.

## Authentication

- `/login` opens the public authentication page with the Login tab selected.
- `/signup` redirects to the same page with the Sign Up tab selected.
- Sign Up currently displays **Registration coming soon**.
- Logged-out users cannot load `/app/...` pages or private API data.
- A protected path requested before login is validated and stored in the server session. After a successful login, the user returns to that path; otherwise the destination is `/app/watchlist`.

## Data safety

This integration keeps the existing schema version and PostgreSQL tables. V2 metadata is stored inside the existing JSONB show records, so no destructive database migration is required.

Existing data remains authoritative, including:

- shows and statuses
- watched episodes and progress
- history
- favourites
- notes
- profile details
- manual/imported metadata
- native backup compatibility

Export a fresh App Backup JSON before deployment, as with every major update.

## Project structure

```text
app.py                 Flask backend, authentication, protected routes, backup/import, TMDB proxy, PostgreSQL sync
wsgi.py                WSGI entrypoint
requirements.txt       Python dependencies
templates/             Authentication and protected application templates
static/js/             V2 UI, real-path router, TMDB client, persistence and synchronization
static/css/            V2 and foundation styles
static/assets/         Local fonts, favicon, UI and profile icons
tests/                 Backend, route-security, source-contract and frontend checks
tools/                 Admin and secret helper scripts
```

## Environment variables

```text
SECRET_KEY
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
APP_USERNAME (or ADMIN_USERNAME fallback)
APP_PASSWORD_HASH (or ADMIN_PASSWORD_HASH fallback)
TMDB_API_KEY
```

Generate `APP_PASSWORD_HASH` with the helper under `tools/`. Existing deployments that already use `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` are also supported. Do not place secrets in this project ZIP or commit them to source control.

## Deployment

Pushing to `main` triggers the GitHub Actions deploy workflow in `.github/workflows/deploy.yml`. The workflow connects to Alwaysdata with the `ALWAYSDATA_SSH_KEY` repository secret and runs only:

```text
cd ~/www/tv-tracker
git pull --ff-only origin main
```

Use the same command manually over SSH if the workflow is unavailable or if you want to deploy by hand. Dependency installs, WSGI restarts, and health checks are still manual unless the workflow is expanded later.

1. Export a fresh App Backup JSON from the currently deployed tracker.
2. Keep the existing environment variables and PostgreSQL database.
3. Replace the application source with this complete project copy.
4. Install dependencies from `requirements.txt` if needed.
5. Restart the WSGI application.
6. Sign in and open `/api/health`.
7. Hard-refresh the browser to clear older cached frontend assets.
8. Test existing shows, episode progress, history, profile, backups, Discover, direct show URLs, and direct episode URLs.

## Tests

Run:

```text
python tests/run_all.py
```

The suite checks Python/backend contracts when Flask and psycopg are installed, JavaScript syntax/contracts through Node.js, protected route rules, server-side login return routing, V2 page containers, TMDB proxy use, and the absence of the standalone static adapter.
