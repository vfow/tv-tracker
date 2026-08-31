# TV Tracker

Single-admin TV tracking website built with Flask, PostgreSQL, TMDB, Vue 3, TypeScript, Vite, and Tailwind CSS. The frontend is being migrated incrementally: Vue owns the completed product surfaces while proven legacy JavaScript state/composition services remain only where active bridges still depend on them.

## Features

- Tracks Watching, Paused, Completed, Plan To Watch, and Dropped shows.
- Stores watched episodes, progress, history, favourites, notes, profile details, posters, backdrops, and imported metadata in PostgreSQL.
- Uses TMDB for search, show and episode metadata, artwork, cast and crew, trailers, alternative titles, similar shows, and Where to Watch.
- Keeps TMDB credentials server-side. The browser only talks to authenticated application endpoints; the server adds the TMDB v3 API key to upstream TMDB request URLs where required by TMDB.
- Supports native App Backup JSON export/import and compatible external JSON/CSV imports.
- Uses revision-based optimistic synchronization for multiple tabs and devices.
- Supports refresh-safe app, show, and episode URLs.
- Uses content-derived static asset versions so long-lived immutable caching is safe across releases.

## Tech Stack

- Backend: Flask, psycopg, PostgreSQL, Argon2 password hashing.
- Frontend: Vue 3 + TypeScript + Vite for migrated surfaces, with retained legacy JavaScript services during the incremental migration.
- Styling: Tailwind CSS; `static/css/tailwind-input.css` compiles to `static/css/tailwind.css`.
- Tests: Python unittest plus Node/Vue frontend contract, type/build, and behavior checks, with PostgreSQL integration coverage in CI.
- Deployment: GitHub Actions deploy to Alwaysdata over SSH using exact commit SHAs, explicit migrations, health verification, and source rollback.

## Project Structure

```text
app.py                  Thin Flask bootstrap and compatibility seams
wsgi.py                 Production entrypoint; schema verification only
tvtracker/               Domain packages for auth, backup, database, media,
                         migrations, notifications, sync, tracker state and web routes
requirements.txt        Python runtime dependencies
package.json            Tailwind and Vue/TypeScript/Vite build scripts
frontend/               Vue 3 + TypeScript application source and Vite configuration
templates/              Login, error, and protected app templates
static/css/             Tailwind source and generated CSS
static/js/              Legacy/shared state, bridges, router, persistence and provider services
static/vue/             Committed production Vue build manifest/assets
tests/                  Backend, PostgreSQL, route, source-contract, and frontend checks
tools/                  Admin, repair, release and secret helper scripts
docs/                   Deployment, policy, architecture, and audit records
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

`wsgi.py` forces `TVTRACKER_SCHEMA_VERIFY_ONLY=1` before importing the application. Production workers therefore fail closed when migrations are missing or schema drift is detected instead of applying DDL while booting.

## Repository Safety

Runtime secrets and personal data must stay outside the source tree. Do not commit `.env`, real API keys, database dumps, App Backup exports, SSH keys, password hashes for real users, private deployment tokens, or redistributable-restricted font files. Keep production values in the hosting provider and GitHub Actions secrets/variables.

Dependency maintenance is covered by weekly Dependabot updates for Python, npm, and GitHub Actions. CI additionally audits Python runtime dependencies and npm dependencies and pins third-party GitHub Actions to exact commit SHAs.

## Local Development

Install Python dependencies:

```text
python -m pip install -r requirements.txt
```

Install frontend dependencies:

```text
npm ci
```

Build/type-check the Vue frontend when changing `frontend/`:

```text
npm run build:frontend
```

Set the required environment variables in your shell or host config, apply migrations explicitly, then run the same WSGI entrypoint used by production:

```text
python -m tvtracker.migrations
flask --app wsgi run --debug
```

The app expects a reachable PostgreSQL database and a valid TMDB API key for normal use.

Direct imports of `app.py` retain migration-on-start compatibility for legacy development/test tooling. Normal development and production should use `wsgi.py` so startup verifies rather than mutates the schema.

## Database Migrations

Database DDL is owned by the additive migration registry under `tvtracker/migrations/`.

```text
python -m tvtracker.migrations
```

The migration runner uses:

- an ordered migration ledger;
- checksums that fail closed if an applied migration changes;
- a PostgreSQL advisory transaction lock to prevent concurrent migration races;
- a canonical schema contract and schema-version verification;
- explicit adoption rules for supported legacy schemas.

The production WSGI process never applies pending migrations. Deployment runs migrations against the staged exact release before activating that release.

Legacy metadata cleanup is no longer a hidden web-startup mutation. Run it explicitly when needed:

```text
python -m tvtracker.maintenance cleanup-legacy
```

The command reports how many rows changed and surfaces failures to the operator.

## Tailwind CSS

Templates and migrated Vue surfaces use the committed Tailwind build at `static/css/tailwind.css`.

Build CSS after editing `static/css/tailwind-input.css` or changing Tailwind class usage:

```text
npm run css:build
```

Watch Tailwind during UI work:

```text
npm run css:watch
```

CI and deployment rebuild the CSS and fail if the committed generated file differs. CI also type-checks/builds the Vue frontend and verifies the committed Vue assets.

## Static Asset Caching

Static template URLs receive a content-derived `?v=<sha256-prefix>` version. A matching version may be cached for one year with `immutable`; unversioned or stale versions are served with revalidation instead.

This means normal releases do **not** require users to hard-refresh to receive updated JavaScript or CSS.

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
/app/person/<tmdb_id>-<slug>?media=movie
/app/genre/tv/<genre_slug>
/app/genre/movie/<genre_slug>
/app/theme/tv/<tmdb_keyword_id>-<slug>
/app/theme/movie/<tmdb_keyword_id>-<slug>
/app/network/<tmdb_id>-<slug>
/app/company/tv/<tmdb_id>-<slug>
/app/company/movie/<tmdb_id>-<slug>
/app/provider/tv/<tmdb_id>-<slug>
/app/provider/movie/<tmdb_id>-<slug>
/app/language/tv/<code>-<slug>
/app/language/movie/<code>-<slug>
/app/country/tv/<code>-<slug>
/app/country/movie/<code>-<slug>
/app/year/tv/<year>
/app/year/movie/<year>
/app/status/<status>
/app/certification/tv/<certification>
/app/certification/movie/<certification>
/app/profile
/app/settings
```

`/app` redirects to `/app/list/watching`. Obsolete aliases such as `/app/watchlist`, bare `/app/list`, role-specific person routes, and untyped genre routes are not part of the routing system. ID-based detail routes may be accepted without a slug long enough to load the referenced TMDB entity; the client then replaces the address with the canonical readable URL without adding a browser-history entry.

`/login` opens the public authentication page. `/signup` redirects to the same page with the Sign Up tab selected, where registration currently displays `Registration coming soon`.

Protected paths requested before login are validated and stored in the server session. After login, the user returns to the validated application path; otherwise the destination is `/app/list/watching`.

Route URLs contain only public TMDB identifiers, route slugs, filter values, and numeric season/episode positions. Personal statuses, watched progress, notes, profile data, tokens, credentials, and API keys are never included in browser-generated application URLs.

## Data Safety

The app keeps metadata in existing JSONB show records and preserves native backup compatibility. Existing data remains authoritative for shows, statuses, watched progress, history, favourites, notes, profile details, and imported metadata.

Export a fresh App Backup JSON before deploying major changes.

Backup import and sync inputs are validated and bounded, and tracker replacement is transactional. Database migrations are additive; automatic source rollback does not attempt destructive schema rollback.

## Tests

Run the full local regression suite:

```text
python tests/run_all.py
```

The suite checks backend contracts, route protection, source contracts, JavaScript syntax, Vue/TypeScript frontend ownership and behavior, synchronization reliability, TMDB proxy usage, asset references, migration behavior, and committed Tailwind/Vue build contracts.

CI provisions PostgreSQL 16 and passes `TEST_DATABASE_URL` so migration and database-sensitive integration paths are exercised against a real PostgreSQL service rather than only mocks.

## Deployment

Pushing an accepted commit to `main` triggers `.github/workflows/deploy.yml`. Manual runs are also restricted to `main`. The workflow:

1. tests the exact commit with PostgreSQL;
2. audits Python/npm dependencies;
3. rebuilds and verifies committed frontend assets through the repository regression/build gates;
4. confirms the requested SHA is still the tip of `main`;
5. stages that exact SHA in a temporary worktree on Alwaysdata;
6. installs dependencies and runs additive migrations from the staged release;
7. records the previous live SHA;
8. activates the exact tested SHA and release marker;
9. restarts the site and verifies `/healthz` serves the same release SHA;
10. if restart or health verification fails after activation, restores the previous source SHA and restarts the site while leaving the workflow failed for investigation.

The fixed production concurrency group prevents overlapping production deployments. Database migrations are intentionally **not** automatically rolled back: they are additive, and database restoration is a separate incident decision requiring an explicit backup/recovery action.

Configure these GitHub Actions **Secrets**:

```text
ALWAYSDATA_SSH_HOST
ALWAYSDATA_SSH_USER
ALWAYSDATA_SSH_KEY
ALWAYSDATA_APP_DIR         # Absolute host path, for example /home/account/www/tv-tracker
ALWAYSDATA_API_KEY
ALWAYSDATA_ACCOUNT
ALWAYSDATA_SITE_ID
ALWAYSDATA_HEALTH_URL      # Base URL only, for example https://your-site.alwaysdata.net
HEALTHZ_SECRET             # Must match HEALTHZ_SECRET on the host when configured.
```

Do not substitute a moving `git pull` for the workflow. An emergency manual rollout must identify an accepted 40-character commit SHA, confirm it is still `origin/main`, run `python -m tvtracker.migrations` from a detached staged checkout before changing the live worktree, write that SHA to `.tvtracker-release-sha`, restart, and verify the authenticated `/healthz` response reports the same `releaseSha`. Prefer rerunning the workflow so these checks remain executable and auditable.

Deployment checklist:

1. Export a fresh App Backup JSON from the currently deployed tracker.
2. Keep the existing environment variables and PostgreSQL database.
3. Select an accepted exact SHA that is still the tip of `main`; never deploy a moving branch name.
4. Install dependencies and run migrations from a staged checkout of that SHA.
5. Activate the exact SHA only after migration succeeds, record the prior SHA, then record the new release marker.
6. Restart the WSGI application and verify `/healthz` returns `ok: true` and the exact `releaseSha`.
7. Test login, existing shows, episode progress, history, profile, backups, Discover, direct show URLs, and direct episode URLs.
8. If activation fails health checks, source rollback is automatic. Because migrations are additive, database restoration remains a separate incident decision using a verified backup.

These instructions do not authorize a production merge; merging to `main` triggers the production deployment workflow.

## Architecture and policy documents

- `docs/DEPLOYMENT.md`
- `docs/PRIVACY.md`
- `docs/TERMS.md`
- `docs/CREDITS.md`
- `docs/architecture/`
