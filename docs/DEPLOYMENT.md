# Deployment

1. Configure required environment variables on the host without committing secret values.
2. Install `requirements.txt`.
3. Run `python -m tvtracker.migrations`.
4. Serve committed `static/modern/` assets.
5. Restart WSGI and verify `/healthz`.
6. Run the notification worker separately when background Notifications are enabled.

The GitHub deployment workflow is the executable rollout source of truth.
