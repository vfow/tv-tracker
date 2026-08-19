# Phase 11 - Risk Register and Architecture Lock

Status: architecture decisions locked; release, merge, and production acceptance blocked

Evidence cutoff: 2026-08-19

Committed source audited: `75dc45f2d21c924533eb77f7653e425a8bb18bc9`

Known-good reference: `d524c905c11101566c0493053e5414649ea6b105`

This document consolidates Phase 1-10 risks and fixes the stabilization architecture. It does not authorize Phase 24, merge, push, deployment, migration, restart, secret access, or use of private backup contents.

## Evidence and decision language

| Label | Meaning |
|---|---|
| **Observed state** | Verified in a committed tree, test/check result, or live repository setting at the evidence cutoff. |
| **Locked product requirement** | Behavior/data outcome that must remain true regardless of internal organization. |
| **Transition decision** | Approved engineering direction for this stabilization, subject to all verification gates. |
| **Future option** | Explicitly outside this stabilization; requires a separate proposal and approval. |

Uncommitted concurrent work is not committed-head evidence and cannot close a risk. Phase-numbered filenames and commit messages are not acceptance evidence.

## Risk model

Likelihood:

- **High:** the hazardous condition is active or expected during ordinary transition/release work;
- **Medium:** a credible path exists but requires a failure, scale, timing, or configuration condition;
- **Low:** possible but exceptional under the locked private single-admin scope.

Impact:

- **Critical:** data loss/corruption, secret or account compromise, unauthorized production change, or unrecoverable core outage;
- **High:** release rollback, core tracker/History/route/Notification failure, or major inaccessible/unavailable functionality;
- **Medium:** bounded degradation, provider/Push/performance/documentation failure with safe core fallback;
- **Low:** minor reversible defect without data/security impact.

Status:

- **Open:** objective closure evidence is absent;
- **Controlled:** preventive/fallback controls exist, but residual risk and final verification remain;
- **Closed:** every listed closure condition passed for the final SHA and environment;
- **Accepted:** the accountable owner explicitly accepted bounded residual risk with rationale, mitigation, expiry/review date, and rollback. No risk below is currently accepted.

Owner entries name accountable roles, not inferred individuals. One person may fill several roles in a private project, but the responsibility must still be explicit.

## Consolidated risk register

| ID | Risk event | Likelihood | Impact | Status | Accountable owner | Trigger/evidence | Current control | Objective closure |
|---|---|---|---|---|---|---|---|---|
| R-01 | A red or behaviorally unvalidated candidate is treated as complete, merged, or released. | High | Critical | Open | Release owner | Draft PR #29 at `75dc45f...` has failed CI run `32222669913`; no full current-head gate is green. | Recovery ledger marks acceptance blocked; Phase 23 says unmerged; known-good SHA retained. | Exact final SHA passes required Python, Node, browser, data, provider, Notifications, startup, build, audit, and hygiene gates; protected branch/environment prevent bypass; owner separately authorizes release. |
| R-02 | Automatic cleanup, import, sync, migration, or provider reconciliation corrupts deliberate tracker state or History. | Medium | Critical | Open | Data/backend owner | Startup runs `cleanup_stored_tracker_data()` and suppresses errors; current full Phase 3 revalidation is incomplete. | Conservative validation, transactional backup/sync paths, TMDB identity rules, private backups, targeted Phase 3 Python pass. | Silent startup rewrite is replaced by versioned migration/explicit repair with preview, idempotency, rollback evidence; all Phase 3/full tests and isolated restore/invariant checks pass. |
| R-03 | Code rollback or private backups cannot recover an outage or damaged data within the required window. | Medium | Critical | Open | Operations/database owner | Native App Backup and PostgreSQL backup existence is owner-confirmed, but neither restore nor timed rollback was inspected. | Exact known-good SHA and prior successful CI/deploy run are recorded; backups remain outside Git. | Timed exact-code rollback and isolated PostgreSQL/native-backup restore drills pass with counts/invariants, access controls, retention, and code/schema compatibility recorded without private contents. |
| R-04 | Vue/Vite/TypeScript and modular vanilla JavaScript coexist, creating duplicate runtime/build ownership and future framework lock-in. | High | High | Open | Architecture/frontend owner | Committed `frontend/`, root scripts/dependencies, CI/deploy steps, `static/modern/`, template mount/module conflict with the lock. | Conflict is explicit in ledger/Phase 7; CI verifies generated bundle consistency. | Conflicting source, dependencies, locks, scripts, workflow steps, generated output, runtime mount, tests, and docs are removed as one green change, or this lock is formally reopened and re-approved before implementation. |
| R-05 | Pending tracker saves or browser identifiers survive logout/session/account boundaries and replay, leak, or disappear. | High | Critical | Open | Persistence/frontend owner | `tv-tracker-pending-saves:v1`, Push device ID, session caches, PushSubscription, and click IndexedDB have incomplete logout/expiry policy. | Queue protects unsaved work and has storage fallbacks; app is currently private single-admin; server Push authority is removed on logout/account change. | Approved per-item TTL/cleanup/identity policy plus browser tests prove no silent loss, stale replay, or future account crossing for logout, password change, expiry, quota failure, malformed storage, and multi-tab use. |
| R-06 | Notifications are lost, duplicated, late, or incorrectly coupled to optional Push/provider delivery. | Medium | High | Open | Notifications owner | Notification contract is red; WSGI/worker startup tests error; runtime file retains layered aliases/owners. | Database Notification persistence precedes Push; Push and TVmaze are optional; targeted fallback/sanitization tests passed. | Persisted-first, idempotency, timing, Push-off/denied/failure, dead endpoint, worker retry/cadence, route/settings, migration, WSGI, and destruction tests pass on final SHA and production-shaped scheduler. |
| R-07 | Repository or dependency/workflow compromise causes unauthorized code, secret exposure, or production deployment. | High | Critical | Open | Repository/security owner | Public repo; unprotected `main`; scanning/Dependabot disabled; all Actions allowed; CI action tags mutable; no production environment. | Workflow token defaults read-only; deploy third-party actions are commit-pinned; secrets are not committed in audited tree. | MFA/recovery reviewed; protected `main`, reviews/checks, force-push/deletion restrictions, secret/push scanning, dependency policy, immutable/restricted Actions, production environment, rotation/revocation drill evidenced. |
| R-08 | Incorrect proxy trust, host access, secret handling, logging, or database privileges weaken authentication or expose production data. | Medium | Critical | Open | Operations/security owner | Actual AlwaysData topology, HTTPS/header stripping, account access, logs, role grants, network policy, secret storage/rotation are unknown. | Secure/HttpOnly/SameSite session cookie, HSTS/CSP, Argon2, CSRF, authorization, safe errors; proxy trust opt-in. | Redacted external checklist proves trusted hops/HTTPS/cookies, least-privilege roles, separate backup/admin authority, host MFA/access, secret ownership/rotation, log redaction/retention, and incident containment/recovery. |
| R-09 | Critical routes or controls fail for keyboard, screen-reader, zoom, reduced-motion, mobile, touch, or browser-history users. | High | High | Open | Product/accessibility owner | No complete automated/manual accessibility matrix; modal/combobox/focus gaps and multiple route owners remain. | Selected ARIA/live regions/focus/reduced-motion/mobile CSS and route tests exist. | Automated Critical/Serious target and manual supported browser/assistive-tech matrix pass all route families and error/loading/dialog/form states at 320px and 200% zoom with no keyboard trap/content loss. |
| R-10 | Unproven asset rights, missing provider attribution, or inaccurate Credits/Privacy/Terms create release/compliance risk. | High | High | Open | Product/asset-policy owner | Graphik references remain; League Gothic/local image/icon provenance incomplete; no root license/notice; runtime disclosure incomplete; privacy text drifts. | Graphik binaries removed; Credits/Privacy/Terms exist; repository warns against restricted assets; TMDB outbound links exist. | Qualified review records project/asset/dependency/provider rights and required notices/placement; approved visible accessible disclosures and accurate policy copy ship; release tests reject unknown/prohibited assets. |
| R-11 | Deployment runs a different SHA than tested or leaves mixed code/dependency/schema state with no safe rollback. | High | Critical | Open | Release/operations owner | SSH pulls moving `main`; no concurrency/environment; in-place install/migration; no remote SHA assertion, atomic switch, or rollback. | Pre-SSH tests/audits; `ff-only`; pinned deploy actions; migration command; restart and health retry. | Exact accepted SHA/artifact is staged, asserted, migration-classified, atomically/equivalently activated with app/worker, smoke/observed, recorded, and successfully rolled back in a timed drill. |
| R-12 | Notification worker schedule, overlap, failure, timezone, or stale code causes silent operational gaps. | Medium | High | Open | Operations/Notifications owner | Host scheduler/cadence/command/environment/logs/alerts/restart unknown; deployment omits worker. | Machine-readable worker path and provider feature switches exist; in-app persistence is primary. | Redacted host evidence and canary prove exact SHA, cadence/timezone, overlap lock, timeout/retry, logs/alerts, provider flags, app/worker coordinated rollout, and recent successful persisted Notification processing. |
| R-13 | Ambiguous ownership across global wrappers, renderers, router listeners, root app/entrypoints, and broad provider proxy causes order-dependent behavior or unsafe extraction. | High | High | Open | Architecture owner | Multiple `renderSettings`/Discover/route/Notification wrappers; root `app.py` owns most domains; WSGI tests error; broad TMDB proxy remains. | Phase 7/8 owner maps, package seams, route/provider contracts, source tests. | One permanent owner/interface per domain/surface/route/entrypoint/API; all callers migrated; endpoint allowlist derived from inventory; adapters/wrappers removed only after complete route/startup/provider regression passes. |
| R-14 | Optional TVmaze timing or provider failure overrides TMDB identity, changes tracker truth, or breaks core operation. | Medium | Critical | Controlled | Media/provider owner | Full candidate is red and production provider configuration is unverified. | TMDB canonical contract; provider-neutral release timing; TVmaze flags default off; targeted Phase 4/provider destruction/fallback tests establish safe direction. | Final full suite plus live failure/timeout/cache/identity/destruction tests pass; production switches/cadence documented; removing/disable TVmaze returns TMDB-only operation without data/route change. |
| R-15 | Unmeasured asset, browser, server, database, or worker regressions cause slow/unreliable operation or exceed host capacity. | Medium | High | Open | Performance/operations owner | No repeatable baseline or budget; eager classic scripts plus module; 2.23 MB 404 image; server/DB/worker capacity unknown. | Static version caching, browser/provider TTLs, incremental sync, bounded provider calls. | Known-good/final-candidate production-shaped measurements and owner-approved deterministic/timing budgets pass for critical routes, data scale, providers, sync, backup, worker, and supported devices. |
| R-16 | Empty migration authority plus startup DDL/data work makes fresh deploy, repeat deploy, rollback, and failure behavior nondeterministic. | High | Critical | Open | Database/release owner | Migration runner/ledger exists but registry is empty; app/Notifications prepare schema during startup; cleanup mutates data. | Transactions and advisory-lock migration machinery exist; deploy calls migration CLI before restart. | Existing schema is safely baselined; every change has ordered/checksummed/repeatable migration; fresh/current/repeat/failure/lock/rollback rehearsals pass; ordinary app/worker import performs no DDL or uncertain data repair. |
| R-17 | Phase labels, stale docs, compatibility code, or convenience exceptions erode the architecture/product lock and create another unfinished migration. | High | High | Open | Product/architecture owner | Later Phase 12-23 artifacts coexist with open Phase 1-11 gates; docs/workflows/source disagree; adapters/aliases remain. | Recovery ledger defines authority; this document defines exception process; Phase 23 denies automatic merge/Phase 24. | Final tree/docs/tests/workflows agree with every lock; no ownerless adapter or contradictory completion claim remains; any exception has written owner approval, scope, expiry/removal gate, tests, and rollback before implementation. |

## Architecture lock

The following decisions are fixed for this stabilization even where committed head currently conflicts with them.

| Lock | Classification | Locked decision | Current conflict or transition | Reopen threshold |
|---|---|---|---|---|
| L-01 Runtime | Locked product requirement | Flask remains the application/web runtime. | Root composition and domain ownership must become explicit; framework replacement is not a remedy. | Separate proposal proves user/operational benefit, migration/rollback, data/API compatibility, skills/cost, and owner approval. |
| L-02 Persistent store | Locked product requirement | PostgreSQL remains the primary server-side system of record. | Connection/schema ownership is duplicated and startup-coupled. | Separate evidence-based database proposal; no replacement or ORM migration in this stabilization. |
| L-03 Styling | Locked product requirement | Tailwind remains the compiled styling foundation and checked-in generated CSS remains reproducible. | Generated assertions are red; legacy domain CSS and stale font references need controlled cleanup. | Separate design/build proposal with visual/accessibility/performance rollback proof. |
| L-04 Frontend | Transition decision | Use modular vanilla JavaScript, browser-native APIs, explicit domain interfaces, and one declared owner per surface. Classic namespaced modules remain valid while ordered global-script dependencies exist; native ES modules are not a release prerequisite. | Vue/Vite/TypeScript source/build/runtime exists at the audited committed head and must not become the target by inertia. | Framework evaluation only after stabilization, with measured need, prototype, incremental migration, full route/data/a11y/ops cost, rollback, and owner approval. |
| L-05 Data truth | Locked product requirement | Deliberate user state and History outrank provider metadata. Adult Filter hides; it never deletes tracked data. Backup/import/sync preserve unknown/suspicious history rather than guessing. | Silent startup cleanup remains; Phase 3 full candidate gate is open. | Product-data rule changes require explicit examples, migration/backup/rollback plan, compatibility tests, and owner approval. |
| L-06 Media identity | Locked product requirement | TMDB ID is canonical after deterministic resolution; TVmaze is optional release-timing enrichment only. | Broad TMDB proxy and external worker configuration remain open. | Canonical-provider changes require separate data/route/backup migration and destruction/fallback proof. |
| L-07 Notifications | Locked product requirement | Persisted in-app Notifications are primary. Push is an optional subordinate delivery channel and cannot gate persistence. | Runtime/frontend consolidation and entrypoint tests are incomplete. | No delivery channel may become product truth without a separately approved persisted-state design. |
| L-08 Ownership | Transition decision | One domain has one permanent backend owner; one UI surface has one renderer; one router owns history; one API boundary owns provider transport. | Root monolith, global wrappers, aliases, observers, and compatibility seams remain. | Temporary adapter requires named owner, exact callers, behavior tests, removal condition, and bounded lifetime. |
| L-09 Schema/change | Transition decision | Explicit ordered migrations own schema evolution; imports/construction are side-effect free; repairs are explicit and observable. | Migration registry empty; startup DDL and cleanup remain. | Emergency exception requires owner approval, private backup, exact scope, monitoring, rollback, and immediate follow-up migration; not a normal path. |
| L-10 Delivery | Transition decision | CI tests checked-in approved source; production deploys the exact accepted full SHA with app/worker verification and rollback. | Current deploy pulls moving `main` in place. | A different mechanism is allowed only if it proves the same SHA/provenance/atomicity/rollback invariants. |
| L-11 Scope/release | Locked process requirement | PR #29 remains unmerged while gates are red. Phase 24 and production rollout require separate explicit owner authorization. | Later phase documents exist but do not close earlier gates. | Only live objective evidence plus explicit owner decision may change release status. |

## Product invariants

Every transition must preserve these unless an independently approved product change explicitly supersedes one:

- existing shows, movies, statuses, episode progress, History, favourites, notes, profile, imported records, and supported backup versions;
- TMDB identifier/route identity and deterministic imported-record resolution;
- TVmaze removal/disable returns safe TMDB-only behavior without changing stored user truth;
- Push unavailable/denied/removed still permits in-app Notification persistence and use;
- Adult Filter hides TMDB-classified adult content without deleting tracker data;
- unknown or suspicious historical records are quarantined/preserved for review rather than auto-guessed;
- pending writes never report saved before durable acknowledgement and never silently cross an account boundary;
- direct links, refresh, Back/Forward, login return paths, canonical slugs, and explicit invalid-route behavior;
- native App Backup version 2/schema 5 and deliberately supported older imports until a separately approved compatibility change;
- no production secret, private backup, password hash, Push key, or personal tracker payload enters Git or diagnostics.

## Ownership and adapter rules

An extraction or compatibility adapter is acceptable only when its change record states:

1. permanent owner and public interface;
2. current callers and state/transaction boundary;
3. exact behavior intentionally preserved;
4. failure/fallback behavior;
5. characterization and acceptance tests;
6. temporary adapter/wrapper and load-order effect;
7. objective removal condition and accountable owner;
8. rollback point and data compatibility.

Forbidden completion shortcuts:

- creating an empty package and calling a domain extracted;
- concatenating files and calling ownership consolidated;
- adding a framework compatibility root and calling the frontend migrated;
- deleting a failing test, adapter, repair, or provider without proving its behavior is obsolete/replaced;
- relying on import order, global reassignment, `MutationObserver`, or broad exception suppression as the permanent interface;
- treating generated-file equality, a health response, or a targeted test as proof that the full release is safe;
- treating a later phase filename as evidence that an earlier objective gate passed.

## Architecture-change procedure

Any request to reopen L-01 through L-11 must occur before implementation and include:

1. problem statement tied to measured user/operational evidence;
2. alternatives, including remaining on the locked design;
3. affected product/data/route/provider/Notification/security invariants;
4. full source/build/dependency/hosting/skills/maintenance cost;
5. incremental migration, compatibility window, and removal gates;
6. private-data-safe test and migration fixtures;
7. rollback/recovery plan and performance/accessibility/security evidence;
8. risks added/changed in this register;
9. explicit owner decision and scope.

Approval of an experiment is not approval of migration or release. Future options must not leave dormant dependencies, generated output, runtime mounts, tables, flags, or documentation in the stabilization tree.

## Phase 1-11 acceptance matrix

| Phase | Required final evidence | State at cutoff |
|---:|---|---|
| 1 | Exact deployed/rollback SHAs, isolated PostgreSQL/native-backup restore, timed recovery | Baseline frozen; restore/rollback drills open. |
| 2 | Current dependency/caller/load-order map with no stale compatibility caller or architecture drift | Historical/current map exists; stale import/framework drift open. |
| 3 | All data-integrity/backup/sync tests and production-shaped invariant/restore checks | Targeted Python evidence only; full candidate red. |
| 4 | TMDB/TVmaze/Push endpoint, failure, removal, attribution, and production-config gates | Targeted tests passed; broad proxy/attribution/full suite open. |
| 5 | Application, GitHub, host, proxy, DB privilege, secret, logging, incident controls | Partial; major external controls open. |
| 6 | Approved browser storage/logout/retention policy and real-browser worker/pending-save proof | Inventory complete; remediation open. |
| 7 | Locked frontend, single route/render ownership, complete route/a11y/responsive browser matrix | Static map complete; implementation/browser proof open. |
| 8 | Side-effect-free app/worker, explicit migrations, actual package domain ownership | Extraction map complete; implementation open. |
| 9 | Exact-SHA staged rollout, app/worker operations, production checks, rollback/restores | Workflow audit complete; production proof open. |
| 10 | Baselines/budgets, asset/dependency provenance, approved disclosures/policies, aligned docs | Inventory/drift complete; all acceptance areas open. |
| 11 | All risks closed or explicitly accepted and every lock reflected in final tree/evidence | Decisions locked; no release acceptance. |

## Release stop conditions

Any one of the following stops merge/release until resolved or explicitly handled under the risk-acceptance process:

- required check is missing, skipped, cancelled, stale, or red;
- tested, approved, deployed, and reported full SHAs differ;
- worktree/generated assets/dependencies do not match committed release evidence;
- a schema/data mutation is unregistered, unrehearsed, non-observable, or rollback compatibility is unknown;
- current private backups lack successful isolated restore evidence for a data-affecting release;
- protected-branch/environment or production trust controls can be bypassed unintentionally;
- app, worker, proxy, database, browser/service-worker, provider, or Push critical checks lack production-shaped evidence;
- a Critical/High data, security, accessibility, licensing/attribution, or operational risk has no bounded owner-approved disposition;
- architecture lock conflict or temporary adapter has no removal gate;
- rollback cannot name and restore an exact compatible code release.

## Residual-risk acceptance

Risk acceptance is exceptional and cannot be inferred from silence, a merge, a deadline, or prior production behavior. A valid record must name:

- risk ID, exact SHA/environment, owner, and date;
- concrete residual scenario and maximum affected scope;
- why closure is not currently proportionate/possible;
- preventive/detective controls and monitoring;
- rollback/containment trigger and responsible operator;
- review/expiry date and objective closure plan.

No acceptance may disclose secrets/private backup contents or redefine the locked product-data truth indirectly. Critical data-recovery uncertainty cannot be treated as closed merely because backups exist.

## Final evidence pack

Before any separate release authorization, retain or link without private values:

- exact final, known-good, and deployed full SHAs;
- protected branch/environment and repository security settings evidence;
- green CI, targeted browser/data/provider/Notifications/security/startup reports;
- dependency audit, lockfile, generated asset, asset provenance/license/notice, and artifact digest records;
- migration IDs/checksums plus fresh/current/repeat/failure/lock rehearsal results;
- private-safe PostgreSQL/native-backup restore and timed code rollback records;
- accessibility/route/responsive and service-worker upgrade/rollback matrices;
- performance/capacity baseline and budget comparison;
- redacted host/proxy/TLS/WSGI/worker/PostgreSQL/logging/secret-control checklist;
- production smoke/observation result bound to deployed SHA;
- final R-01 through R-17 status and any explicit residual acceptance.

## Phase 11 exit criteria

The architecture lock portion of Phase 11 is complete: the stabilization target and change process are explicit.

Phase 11 release acceptance is complete only when:

- every Phase 1-10 objective gate in the matrix is green for the exact final candidate/environment;
- R-01 through R-17 are Closed or have valid, bounded, unexpired owner acceptance;
- no Critical risk remains Open;
- source, generated assets, dependencies, tests, workflows, runbooks, and user-facing documents match L-01 through L-11;
- all temporary adapters have owners and removal evidence, with none remaining merely for phase-label compatibility;
- recovery, exact-SHA rollout, worker operations, and rollback are proven;
- the owner issues separate explicit authorization for the next release activity.

Those conditions are not met. PR #29 must remain unmerged and no Phase 24 or production action is authorized by this document.
