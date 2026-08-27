# Deployment

1. Keep host environment values and GitHub secrets outside the repository. `ALWAYSDATA_APP_DIR` is an absolute path and `ALWAYSDATA_HEALTH_URL` is a base URL without `/healthz`.
2. Deploy only an accepted exact SHA that is still the tip of `main`; manual workflow runs are restricted to `main`.
3. Install `requirements.txt` and run `python -m tvtracker.migrations` from a temporary detached checkout of that SHA.
4. Only after migration succeeds, record the current live SHA in `.tvtracker-previous-sha`, check out the exact new SHA in the live worktree, and write it to `.tvtracker-release-sha`.
5. Production `wsgi.py` forces schema verification-only startup. A worker must fail closed if the migration ledger, schema version, or canonical schema contract does not match the activated release.
6. Restart WSGI and require `/healthz` to return `ok: true` with the exact process-captured `releaseSha`.
7. If activation succeeded but restart or health verification fails, the workflow restores `.tvtracker-previous-sha`, rewrites the release marker, and restarts the site. The workflow remains failed so the incident is visible.
8. Serve content-versioned committed `static/` assets and run the notification worker separately when background Notifications are enabled.
9. Database migrations are additive and are never automatically reversed by source rollback. Database restoration is a separate incident decision using a verified private backup.

The GitHub deployment workflow is the executable rollout source of truth. It stages and tests an exact SHA, applies migrations before activation, verifies the live process release marker, serializes production deploys, and provides automatic source rollback after a failed activation health check. This document does not authorize a merge or deployment.
