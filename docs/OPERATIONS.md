# Operations

This runbook describes the repository-owned operational signals for TV Tracker. It does not contain secret values, backup contents, host credentials, or provider tokens.

## Production release signal

The deployment workflow remains the authoritative release path. A successful deployment proves all of the following for one full Git SHA:

- CI, dependency audits, generated CSS verification, and the regression suite passed.
- The release SHA came from a merged pull request targeting `main`.
- The release SHA was still the current `main` target before production mutation.
- Production database migrations completed before activation.
- WSGI restart completed.
- `/healthz` returned `ok: true` and the exact activated `releaseSha`.

The separate **Production Smoke** workflow rechecks the live site every six hours and on manual dispatch. It checks the current `main` SHA against `/healthz`, then performs a non-authenticated `GET /login` and requires the expected no-store/security headers plus a request correlation ID. The smoke performs no writes and does not log the health token.

A failed scheduled smoke means the live release, availability, or public security boundary needs inspection. Do not automatically restore a database in response to a smoke failure.

## Request telemetry

Production WSGI installs privacy-safe structured request telemetry. Each dynamic request receives an `X-Request-ID` response header. Normal successful `/healthz` probes and static assets are excluded from request log noise.

`http_request` JSON events contain only:

- generated request ID;
- HTTP method;
- matched Flask route template, not the concrete path;
- HTTP status;
- request duration in milliseconds;
- deployed release SHA when available.

The request telemetry deliberately excludes query strings, request/response bodies, cookies, authorization headers, client IP addresses, session identifiers, usernames, media IDs from concrete paths, and other user-controlled request data. 5xx request events are logged at error level; other dynamic requests are informational.

`TVTRACKER_LOG_LEVEL` may be set to a standard Python logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL`). Invalid or absent values fall back to `INFO`.

## Notification worker

Run the background worker with:

```text
python notification_worker.py
```

When background Notifications are enabled, the scheduler cadence should remain consistent with the notification timing requirements documented in `docs/TVMAZE.md`; near-release timing expects a cadence of five minutes or less when that capability is enabled.

The worker now acquires a dedicated PostgreSQL session advisory lock before doing notification work. If another invocation is already running, the second invocation exits successfully with:

```json
{"ok":true,"skipped":true,"status":"skipped_overlap"}
```

This is a deliberate no-op, not a retryable failure. Occasional overlap skips are safe; frequent overlap skips indicate that worker runtime is approaching or exceeding the scheduler interval and should be investigated.

Worker stderr emits structured events:

- `notification_worker_started`
- `notification_worker_completed`
- `notification_worker_skipped`
- `notification_worker_failed`

Successful completion telemetry contains only aggregate notification/push counts, duration, a generated run ID, and release SHA when available. Exception messages, provider payloads, credentials, and notification contents are not logged by this wrapper. The final machine-readable worker result remains on stdout.

## Incident triage

For an application or deployment incident:

1. Identify the affected full release SHA from GitHub Actions, `/healthz`, and the request/worker log event.
2. Preserve relevant logs before changing the system.
3. Determine whether the failure is application-only, worker-only, provider-related, database/schema-related, or host-related.
4. Prefer the repository's exact-SHA source rollback for a demonstrated code regression.
5. Do not reverse additive migrations automatically.
6. Restore PostgreSQL only for demonstrated data/schema damage and only from a verified private backup.
7. Re-run production smoke after recovery and confirm the resulting full release SHA.

For a worker incident, first determine whether the latest event is `completed`, `skipped`, or `failed`. A skipped overlap does not imply data loss; a failed event should be correlated with the scheduler's captured stderr and the same release SHA.

## External controls still owned by the host/account

Repository code cannot prove or configure all provider controls. Periodically verify these outside Git:

- Alwaysdata WSGI process count, timeout, memory/CPU quota, log retention, and restart behavior;
- the actual notification scheduler cadence, timeout, timezone, and captured stdout/stderr;
- reverse-proxy/TLS behavior and the correctness of `TRUST_PROXY_HEADERS`;
- PostgreSQL capacity, grants, connection limits, backups, retention, and isolated restore drills;
- secret ownership, rotation, and emergency revocation procedures;
- TMDB/optional-provider quotas and dashboards.

Record results without committing secret values or private backup contents.

## Acceptance signals

A release is operationally healthy when the deployment workflow is green, scheduled production smoke is green, `/healthz` reports the deployed SHA, 5xx request events are absent or understood, and the notification worker completes at its expected cadence without sustained overlap or failures.

The repository still cannot substitute for an isolated PostgreSQL restore drill or provider/account-level monitoring. Those remain explicit operational tasks rather than assumptions.
