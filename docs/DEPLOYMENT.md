# Deployment

1. Keep host environment values and GitHub secrets outside the repository. `ALWAYSDATA_APP_DIR` is an absolute path and `ALWAYSDATA_HEALTH_URL` is a base URL without `/healthz`.
2. Deploy only an accepted exact SHA that is still the tip of `main`; manual workflow runs are restricted to `main`.
3. Install `requirements.txt` and run `python -m tvtracker.migrations` from a temporary detached checkout of that SHA.
4. Only after migration succeeds, check out the exact SHA in the live worktree and write it to `.tvtracker-release-sha`.
5. Restart WSGI and require `/healthz` to return `ok: true` with that process-captured `releaseSha`.
6. Serve committed `static/` assets and run the notification worker separately when background Notifications are enabled.
7. Roll source back only to a known accepted SHA. Additive database migrations are not automatically reversed; database restoration is a separate incident decision using the private backup.

The GitHub deployment workflow is the executable rollout source of truth. Its staged migration and exact-SHA checks reduce partial-rollout risk, but the live worktree switch is not a symlink-based atomic activation. This document does not authorize a merge or deployment.
