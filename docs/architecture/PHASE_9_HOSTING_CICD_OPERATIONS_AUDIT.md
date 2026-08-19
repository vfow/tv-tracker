# Phase 9 - Hosting, CI/CD, and Operations Audit

Status: partial; repository automation mapped, production-shaped rollout and rollback unproved

Evidence cutoff: 2026-08-19

Committed source audited: `75dc45f2d21c924533eb77f7653e425a8bb18bc9`

Known-good reference: `d524c905c11101566c0493053e5414649ea6b105`

This audit authorizes no deployment, restart, migration, secret retrieval, merge, push, or Phase 24 activity.

## Operational decisions

**Observed state:** GitHub Actions tests pull requests and deploys pushes to `main`. The host is documented as AlwaysData and is updated over SSH, restarted through the AlwaysData API, and checked through `/healthz`.

**Locked product requirement:** production must run the exact accepted commit, after the exact required checks pass, with a documented and tested rollback path. A green check for one SHA cannot authorize deployment of another SHA.

**Transition decision:** preserve Flask, PostgreSQL, Tailwind, and the existing host while making CI, migration, application/worker rollout, verification, and rollback deterministic. Choose the host-supported atomic release mechanism only after the AlwaysData topology is verified.

**Future option:** another host, container platform, database service, or deployment system requires a separate cost, reliability, migration, and rollback proposal. It is not assumed here.

## Current operational control plane

| Layer | Observed owner/path | Observed behavior | Unknown or open gate |
|---|---|---|---|
| Source control | GitHub `vfow/tv-tracker`, default branch `main` | Public repository; PR #29 is draft and red | Owner/account MFA, audit-log review, and recovery controls not inspected. |
| Pull-request CI | `.github/workflows/ci.yml` | Python 3.12, Node 22, Python/npm installs, production npm audits, frontend/CSS builds, generated diff checks, full regression suite, diff hygiene | Mutable action tags; no Python vulnerability scan; final candidate red. |
| Main deployment | `.github/workflows/deploy.yml` | Repeats installs/audits/frontend build/tests, SSH pulls `main`, installs Python packages, runs migration CLI, restarts site, checks health | Moving branch target, no deployment environment/concurrency, no CSS build equality, no worker handling, no rollback. |
| Application runtime | `wsgi.py` and Flask app | WSGI app plus notification/static/backup composition | Server type/version, process count, timeout, memory, cwd, environment loading, restart semantics unknown. |
| Notification worker | `notification_worker.py` | Separate command intended for external scheduling | Production schedule, overlap lock, timeout, retry, timezone, output capture, alerting, and restart behavior unknown. |
| Reverse proxy/TLS | AlwaysData external boundary | Application can trust one proxy hop when configured | Actual proxy hops, forwarded-header stripping, HTTPS redirect, HSTS delivery, request/body/time limits unknown. |
| PostgreSQL | External PostgreSQL via environment | Application DDL, migrations, tracker/auth/sync/notification/provider state | Version, grants, connection limits, statement timeout, backup schedule, retention, restore result unknown. |
| External services | TMDB, optional TVmaze, optional Web Push | Bounded application/provider paths documented elsewhere | Production quotas, dashboards, alerting, credentials, and provider enablement not inspected. |
| Browser runtime | Versioned static URLs and no-store service worker route | Static SHA query caching; Push service worker has no fetch cache | Real proxy headers, stale worker upgrade, and rollback tests open. |
| Recovery material | Native App Backup and PostgreSQL backup outside Git | Existence owner-confirmed | Contents, age, access controls, and restoreability deliberately not inspected. |

## Live GitHub control evidence

GitHub API observations on 2026-08-19:

- repository visibility is public;
- `main` returns `404 Branch not protected` from the protection endpoint;
- secret scanning, non-provider-pattern scanning, validity checks, and push protection are disabled;
- Dependabot security updates are disabled;
- Actions allows all actions and does not require SHA pinning;
- default workflow token permission is read-only and cannot approve pull requests;
- no GitHub deployment environment exists.

Evidence endpoints:

- `GET /repos/vfow/tv-tracker`
- `GET /repos/vfow/tv-tracker/branches/main/protection`
- `GET /repos/vfow/tv-tracker/actions/permissions`
- `GET /repos/vfow/tv-tracker/actions/permissions/workflow`
- `GET /repos/vfow/tv-tracker/environments`

The read-only default token is a positive control. The remaining settings do not prevent an unreviewed, red, or accidentally pushed `main` commit from starting the deployment workflow.

## Workflow evidence

### Pull-request CI

`.github/workflows/ci.yml@75dc45f...` runs only for pull requests to `main` and manual dispatch. Its job has `contents: read` and a 30-minute timeout.

| Order | Step | Audit disposition |
|---:|---|---|
| 1 | `actions/checkout@v4` | Mutable major tag; repository policy does not require immutable SHA. |
| 2 | `actions/setup-python@v5`, Python 3.12 | Runtime is explicit, action reference mutable. |
| 3 | `actions/setup-node@v4`, Node 22, npm cache | Runtime explicit, action reference mutable. |
| 4 | Install exact direct Python requirements | Direct packages are pinned; transitive vulnerability/provenance gate absent. |
| 5 | `npm ci` in root and `frontend/` | Lockfile-based reproducibility; framework graph conflicts with Phase 7/11 lock. |
| 6 | Production npm audits at High threshold | Useful; dev/build dependencies are excluded and Python has no equivalent gate. |
| 7 | Build frontend and Tailwind; compare committed outputs | Strong checked-in-generated-output pattern, but it enforces the unapproved modern frontend too. |
| 8 | `python tests/run_all.py` | Correct full-suite gate; current head fails. |
| 9 | `git diff --check` | Good repository hygiene check after build/test. |

Current result: run `32222669913` failed for `75dc45f...`: `https://github.com/vfow/tv-tracker/actions/runs/32222669913`.

Known-good evidence: PR run `32024848159` succeeded for PR head `d2e7ad0962976609f99c30db260ca9b9f08eefa5`, which was then merged into known-good `main`: `https://github.com/vfow/tv-tracker/actions/runs/32024848159`.

### Main deployment workflow

`.github/workflows/deploy.yml@75dc45f...` starts on every push to `main`. It has read-only contents permission and a 20-minute timeout.

Positive controls:

- checkout, Python setup, Node setup, and SSH third-party actions use immutable commit SHAs;
- it repeats dependency installation, production npm audit, generated modern-frontend comparison, and the full regression suite before SSH;
- the remote shell uses `set -eu` and `git pull --ff-only`;
- `pywebpush` import is checked after installation;
- migration CLI runs before site restart;
- AlwaysData API and health `curl` calls fail on HTTP errors;
- health retries for approximately one minute.

Open controls:

- the SSH command runs `git pull --ff-only origin main`, so the deployed commit is whatever `main` references at SSH time, not necessarily `${{ github.sha }}` tested by that run;
- no post-pull assertion records or compares the remote SHA;
- there is no workflow `concurrency` group, so close pushes can race and a later run can overtake an earlier run;
- no GitHub environment, approval, wait timer, or scoped deployment secrets separate test from production;
- the job rebuilds/tests in CI but does not deploy a preserved artifact or provenance manifest;
- the remote host installs into the live Python environment and runs migrations in place before restart;
- the deploy workflow verifies `static/modern` but neither builds nor compares `static/css/tailwind.css`, unlike CI and README claims;
- no application drain, staged release, atomic switch, worker stop/start, worker smoke, or scheduled-job verification is present;
- no database preflight/version assertion, migration backup marker, migration result capture, or compatibility/rollback rule is recorded;
- `/healthz` proves only its implemented health contract; no authenticated product smoke, write/read check, asset hash, service-worker, Push, or provider smoke runs;
- no automatic or operator rollback command is defined.

Known-good deploy run `32025234154` succeeded for exact workflow head `d524c905...`: `https://github.com/vfow/tv-tracker/actions/runs/32025234154`. That is useful historical evidence, but the current workflow does not itself prove which SHA the remote checkout retained after the run.

## Critical and high findings

### Critical - deployment target is not bound to the tested SHA

A second push can move `main` after a workflow checks out commit A but before its SSH step. `git pull origin main` can then deploy commit B even though run A tested A. With no concurrency control, run order can also differ from commit order.

Required invariant: the remote release identifier, application health evidence, and GitHub deployment record all name the same accepted full SHA. The workflow must fail before mutation if they do not.

### High - an unprotected push can start production deployment

`main` has no required PR review/check, force-push/deletion protection, or deployment environment. A public source repository is not itself a problem; an unprotected production trigger is an avoidable operational risk.

Required controls: protected `main`, required exact CI check, deliberate review/bypass policy, force-push/deletion disabled, restricted Actions, immutable third-party actions, and a production environment with appropriately scoped approval/secrets.

### High - rollout is in-place rather than staged or atomic

The host checkout, virtual environment, schema, and running site are changed in place. A failed package install or migration can leave a mixed release. A successful migration followed by failed restart can leave old process/new schema or an unavailable site.

The audit does not assume AlwaysData supports symlinked release directories, blue/green sites, or another mechanism. Host verification must select a supported mechanism that stages code/dependencies, verifies them, and changes the active application pointer/process only after preflight succeeds.

### High - database ownership and rollback compatibility are not ready

The deploy calls `python -m tvtracker.migrations`, but the committed migration registry is empty. Application startup still performs schema DDL and silent data cleanup. Therefore a successful migration command is not evidence that the schema is prepared, reversible, or compatible with a rollback.

Required sequence: baseline existing production schema, move DDL to explicit migrations, classify migrations as backward compatible or requiring a coordinated stop, rehearse on a private restored copy, and document whether code-only rollback is safe for each release.

### High - the background worker is outside the deployment transaction

The workflow does not stop, update, restart, or verify `notification_worker.py` or its scheduler. `docs/DEPLOYMENT.md` merely says to run it separately. `docs/TVMAZE.md` states that near-release notification timing depends on external cadence and recommends five minutes or less when the capability is enabled.

Required evidence: exact command/environment, scheduler type, timezone, cadence, overlap prevention, timeout, output destination, retry behavior, enabled provider switches, and a canary proving persisted in-app Notification creation independently of Push.

### High - recovery artifacts exist but rollback is unproved

Owner-confirmed native and PostgreSQL backups are valuable. Neither restore has been rehearsed in isolation, and no timed application rollback exists. Do not make a production database restore the default response to a code regression. First stop writes/worker, preserve the current state, identify the affected boundary, and choose code rollback versus data restore from evidence.

## Medium findings

### CI and supply-chain coverage is asymmetric

CI action tags are mutable while deploy action references are immutable. Root and frontend production npm dependencies receive an audit; Python dependencies do not. No SBOM, dependency license inventory, artifact digest manifest, or provenance attestation is retained. These controls should remain proportionate to a private single-admin application, but the current public/deploying repository needs a documented minimum.

### Observability and resource limits are unknown

The source logs startup and worker information, but repository access cannot establish host log collection, retention, timestamps/timezone, redaction, alert destinations, WSGI worker counts, memory/CPU quotas, PostgreSQL saturation, disk quota, or process health. No SLO, synthetic login/read smoke, error-rate alarm, or worker freshness signal is defined.

### Production proxy behavior is unverified

`TRUST_PROXY_HEADERS` affects `request.remote_addr`, request scheme, host, cookie security, throttling, and HSTS behavior. The correct setting depends on the real proxy topology and cannot be inferred from provider name. Verify redacted headers through the production boundary.

### Operational documentation conflicts with executable workflow

`README.md@75dc45f...` lists different deployment secret names/scopes, says deploy builds and verifies Tailwind CSS, and describes only a plain-JavaScript/Tailwind structure despite the committed modern frontend. `docs/DEPLOYMENT.md` says to serve `static/modern/`, which conflicts with the locked modular-vanilla architecture.

## Configuration-name reconciliation

No value was retrieved. The following are names referenced by committed documentation/workflow only.

| Purpose | Workflow reference | README reference | Disposition |
|---|---|---|---|
| SSH host | secret `ALWAYSDATA_SSH_HOST` | secret `ALWAYSDATA_HOST` | Mismatch; select one documented name. |
| SSH user | secret `ALWAYSDATA_SSH_USER` | secret `ALWAYSDATA_USER` | Mismatch. |
| SSH key | secret `ALWAYSDATA_SSH_KEY` | same secret name | Consistent. |
| Application directory | secret `ALWAYSDATA_APP_DIR` | variable `ALWAYSDATA_APP_DIR` | Scope mismatch. |
| Restart API | secrets `ALWAYSDATA_API_KEY`, `ALWAYSDATA_ACCOUNT`, `ALWAYSDATA_SITE_ID` | not listed | Documentation incomplete. |
| Health URL | secret `ALWAYSDATA_HEALTH_URL` | variable `ALWAYSDATA_HEALTH_URL` | Scope mismatch. |
| Health token | secret `HEALTHZ_SECRET` | secret `ALWAYSDATA_HEALTH_TOKEN` | Mismatch. |

GitHub reported nine secret names and three variable names at the audit cutoff. Their values and production contents are outside this audit and must remain undisclosed.

## Required target pipeline

### Pull request

1. Check out the exact PR SHA with immutable action references.
2. Install from committed locks/pins in clean Python 3.12 and Node 22 environments.
3. Run Python and npm vulnerability policy gates, secret scanning, generated-asset equality, syntax/lint/type checks that match the approved architecture, and `git diff --check`.
4. Run the complete Python/Node/browser/data/provider/Notifications/startup test gate.
5. Record exact SHA, dependency/asset manifests, test URLs, and generated diffs as immutable evidence.

### Merge and release selection

1. Require protected-branch PR review and the exact required check.
2. Treat merge to `main` as source acceptance, not automatic proof of production readiness if external gates remain.
3. Select one full release SHA and bind any production approval/environment to that SHA.
4. Cancel superseded deployment runs safely with a concurrency policy.

### Production preflight

1. Confirm the currently deployed full SHA and known rollback SHA.
2. Confirm private backup timestamps and prior restore-drill status without exposing location/content.
3. Confirm host capacity, proxy/TLS, required configuration-name presence, PostgreSQL connectivity/version/grants, and app/worker commands.
4. Rehearse pending migrations on a private restored production-shaped copy and record compatibility/rollback classification.
5. Verify external provider/Push switches and expected degradation behavior.

### Rollout

1. Fetch or transfer the exact accepted SHA/artifact; never resolve a moving branch as the deployment target.
2. Stage code and dependencies outside the active process using a verified host-supported mechanism.
3. Assert source, generated assets, dependency manifest, and migration set match release evidence.
4. Pause writes/worker only when the migration classification requires it.
5. Run explicit migrations once, capture migration IDs/results, and fail closed.
6. Switch/restart the WSGI application and worker/scheduler as one documented release operation.

### Verification

1. Assert the remote full SHA/release identifier equals the approved SHA.
2. Verify public and authenticated health, login, existing tracker read, safe reversible write/read, History, backup export validation, core routes, asset versions, and service-worker compatibility.
3. Verify Notification persistence with Push unavailable, then optional Push separately when enabled.
4. Verify worker freshness/cadence and TMDB core fallback with TVmaze disabled/unavailable.
5. Observe error rate, latency, database connections, worker result, and host resources for a defined window before closing rollout.

### Rollback

1. Stop additional rollout and contain writes/worker if data integrity may be involved.
2. Preserve logs and a current database snapshot before destructive recovery.
3. Switch to the exact known compatible code release and restart app/worker.
4. Run the same health/product/browser checks and record resulting full SHA.
5. Restore PostgreSQL only for demonstrated data/schema damage and only from a verified isolated restore; never use it as an automatic code rollback.
6. Validate native App Backup only through the product import contract on an isolated target before any production decision.

## Monitoring and operations acceptance matrix

| Signal | Required evidence/alert | Current state |
|---|---|---|
| Deployed version | Full SHA/release ID exposed to authenticated operations and deployment record | Not proven. |
| WSGI availability | Health plus authenticated product smoke; restart duration/error rate | Public health exists; production observation unavailable. |
| Worker freshness | Last successful run, duration, created notifications, isolated delivery failures, overlap/timeout | Machine-readable worker output exists; host capture/alert unknown. |
| PostgreSQL | Connection/error/lock/storage trends, migration ledger, backup success and restore drill | Repository contracts exist; production controls unknown. |
| TMDB/TVmaze | Request failure/rate/latency by provider without credentials or private payloads | Application fallback exists; operational dashboard unknown. |
| Push | Success/dead endpoint/retry counts separate from persisted Notifications | Runtime records statuses; alerting/retention unknown. |
| Browser release | Asset hashes, stale-worker protocol, representative browser smoke | Static versioning exists; production/browser proof open. |
| Security | Login/account events, deployment changes, secret/scanning alerts | Security event table exists; GitHub scanning disabled and host review unknown. |
| Capacity/performance | Agreed browser/API/worker budgets and regression trend | No baseline or budget; Phase 10 owns definition. |

Logs must exclude passwords, password hashes, session/CSRF tokens, database credentials, TMDB keys, VAPID private keys, Push cryptographic subscription keys, backup contents, and private tracker payloads. Retention and access must be documented without publishing sensitive production details.

## External verification checklist

Acceptable evidence is redacted configuration, command/output metadata, or owner attestation that does not expose values.

| Area | Required evidence |
|---|---|
| AlwaysData runtime | Python version, WSGI server/command, process count, timeout, working directory/release mechanism, resource quotas, restart behavior. |
| Worker | Scheduler/command, cadence, timezone, overlap/timeout, environment, logs, last successful run, disabled/enabled provider switches. |
| Proxy/TLS | Trusted hop count, forwarded-header stripping, HTTPS redirect, HSTS/cookie delivery, body/time limits. |
| PostgreSQL | Version, application/migration/backup grants, connection limit/timeouts, backup schedule/retention/encryption/access. |
| GitHub | Protected `main`, required checks/reviews, immutable/restricted Actions, scanning/alerts, production environment/secrets policy. |
| Secrets | Name-to-owner mapping, storage system, last rotation/rehearsal, emergency revocation; never values. |
| Recovery | Isolated PostgreSQL and native App Backup restore results plus timed code rollback. |
| Production smoke | Exact SHA and timestamp with health, tracker, route, notification, provider fallback, asset/service-worker evidence. |

## Blockers carried forward

| Blocker | Phase 11 destination |
|---|---|
| Current PR/full suite red | R-01 |
| Restore and rollback drills absent | R-03 |
| Unprotected repository and incomplete supply-chain controls | R-07 |
| Proxy, host, privilege, secrets, and log controls unknown | R-08 |
| Moving-main, in-place deploy | R-11 |
| Worker cadence/restart/observability unknown | R-12 |
| Empty migration registry and startup schema work | R-16 |
| No performance/capacity baseline | R-15 |

## Phase 9 exit criteria

Phase 9 is complete only when:

- protected `main`, required checks/review, scanning/dependency policy, restricted immutable Actions, and a production environment are evidenced;
- CI is green for the exact final SHA and tests only the approved architecture;
- the release binds tested SHA, deployed SHA, generated assets, migration set, and evidence record;
- the host uses a staged/atomic or equivalently safe verified rollout rather than a moving in-place pull;
- migrations are explicit, rehearsed, recorded, and compatibility-classified;
- app and worker/scheduler rollout, restart, smoke, cadence, and alerting are one runbook;
- proxy/TLS, WSGI, PostgreSQL, secrets, logging, resource, and provider controls pass the external checklist;
- production smoke and observation windows have objective pass/fail conditions;
- code rollback and isolated PostgreSQL/native-backup restore drills pass;
- README and deployment documents match the executable workflow and architecture lock;
- no secret value or private backup content enters Git.

These criteria are not met. A prior successful deployment is a recovery anchor, not authorization to deploy this red candidate.
