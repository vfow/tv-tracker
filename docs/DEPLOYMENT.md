# Deployment

1. Keep host environment values and GitHub secrets outside the repository. `ALWAYSDATA_APP_DIR` is an absolute path and `ALWAYSDATA_HEALTH_URL` is a base URL without `/healthz`.
2. Deploy only an accepted exact SHA that is still the tip of `main`; manual workflow runs are restricted to `main`.
3. After tests, release-provenance verification, and the current-`main` check pass, the workflow reads the target WSGI site's `environment` field through the official Alwaysdata Site API. It strictly extracts only `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`, masks those values in GitHub Actions, and passes them to the SSH deployment step. The Alwaysdata API token stays on the GitHub runner and is not forwarded to the production host.
4. Stage the exact SHA in a temporary detached worktree, install `requirements.txt`, and run `python -m tvtracker.migrations` with that provider-managed database environment. Database credentials remain authoritative in the Alwaysdata site configuration; do not duplicate them as GitHub repository secrets.
5. Only after migration succeeds, record the current live SHA in `.tvtracker-previous-sha`, check out the exact new SHA in the live worktree, and write it to `.tvtracker-release-sha`.
6. Production `wsgi.py` forces schema verification-only startup. A worker must fail closed if the migration ledger, schema version, or canonical schema contract does not match the activated release.
7. Restart WSGI and require `/healthz` to return `ok: true` with the exact process-captured `releaseSha`. The independent Production Smoke workflow periodically rechecks the live release and the public login/security boundary.
8. If activation succeeded but restart or health verification fails, the workflow restores `.tvtracker-previous-sha`, rewrites the release marker, and restarts the site. The workflow remains failed so the incident is visible.
9. Serve content-versioned committed `static/` assets and run the notification worker separately when background Notifications are enabled. The worker uses a PostgreSQL advisory lock so overlapping scheduler invocations cannot execute notification work concurrently.
10. Database migrations are additive and are never automatically reversed by source rollback. Database restoration is a separate incident decision using a verified private backup.

The GitHub deployment workflow is the executable rollout source of truth. It uses Alwaysdata's supported Site API as the environment handoff boundary instead of shell-sourcing files or copying database credentials into repository secrets. The provider environment is parsed without shell evaluation, only the database variables needed by migrations cross the SSH boundary, and those temporary runner values are cleared before restart/rollback steps.

Operational request/worker telemetry and the scheduled production smoke contract are documented in `docs/OPERATIONS.md`. They intentionally avoid secret values and private user data.

This document does not authorize a merge or deployment.
