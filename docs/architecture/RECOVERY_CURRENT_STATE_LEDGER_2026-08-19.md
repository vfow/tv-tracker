# Recovery and Current-State Ledger

Status: authoritative recovery-base ledger for Phases 1-11 with candidate addendum; release acceptance is blocked pending final CI

Evidence cutoff: 2026-08-19

Known-good main: `d524c905c11101566c0493053e5414649ea6b105`

Committed architecture PR head: `75dc45f2d21c924533eb77f7653e425a8bb18bc9`

Branch: `architecture-futureproof-2026-08-18`

This ledger is the concise authority for the audited recovery base and the implementation direction for Phases 1-11. Existing long Phase 2-4 files remain evidence of work performed at their original checkpoints. Where their recovery-base wording conflicts with this ledger, this ledger controls. A commit message or later-phase filename is not proof that an earlier exit gate passed.

This document authorizes no deployment, Phase 24 activity, merge, push, or production change.

## Evidence labels

| Label | Meaning |
|---|---|
| **Observed state** | Verified from a committed tree, test/check output, or a GitHub setting at the evidence cutoff. |
| **Locked product requirement** | Product behavior that must be preserved regardless of internal organization. |
| **Transition decision** | Engineering direction for this stabilization, subject to its stated verification gates. |
| **Future option** | Not part of this stabilization and not an assumed target. |
| **Owner-confirmed fact** | Reported by the owner but not inspected because it is private or outside repository access. |

Uncommitted concurrent work is not evidence of committed-head behavior. All source statements below refer to `75dc45f...` unless a different SHA is named explicitly.

## Recovery candidate addendum

The commit containing this addendum is a recovery implementation candidate layered on the audited PR head. It does not rewrite or remove pre-existing later-phase history merely because of a phase label. It removes Vue/Vite/TypeScript and `static/modern`, restores modular browser-native ownership, preserves regular/special episode identity across browser and backend persistence, establishes catalog-certified ordered migrations, and adds staged exact-SHA deployment verification. Required local regression/build/security gates must be green on the final worktree, and PostgreSQL 16 plus real-browser coverage must pass in GitHub Actions before this candidate can update release acceptance.

Local candidate evidence on Windows/Python 3.14: `python tests/run_all.py` passed all 295 Python tests that could run and every discovered JavaScript contract; 17 live-PostgreSQL cases skipped because `TEST_DATABASE_URL` is intentionally unavailable locally. The real Chromium contract passed with installed Microsoft Edge, `npm audit --audit-level=high` reported zero vulnerabilities, the Tailwind rebuild was byte-identical, Python compilation passed, both workflows passed `actionlint`, and `git diff --check` passed. This local evidence does not replace Linux/Python 3.12/PostgreSQL 16 GitHub Actions.

This addendum authorizes no merge, production migration, restart, or deployment. The excluded private chat/roadmap/tool files remain outside Git.

## Recovery anchors

| Anchor | Classification | Evidence | Current conclusion |
|---|---|---|---|
| Known-good code | Observed state plus owner-confirmed fact | Git commit `d524c905...`; merged PR #28; successful PR check `https://github.com/vfow/tv-tracker/actions/runs/32024848159`; successful deploy workflow `https://github.com/vfow/tv-tracker/actions/runs/32025234154` | This is the behavioral rollback reference. The owner observed it as known-good behavior. |
| Native App Backup | Owner-confirmed fact | Owner confirms a fresh private native backup exists outside Git | Availability is confirmed; contents and restoreability were not inspected in this audit. |
| PostgreSQL backup | Owner-confirmed fact | Owner confirms a fresh PostgreSQL backup exists outside Git | Availability is confirmed; restoreability, retention, encryption, and location were not inspected. |
| Backup/schema compatibility | Observed state | `app.py@d524c905...` and `app.py@75dc45f...` both declare `BACKUP_VERSION = 2`, `SCHEMA_VERSION = 5`, and support native backup versions 1 and 2 | Code rollback does not require an automatic database rollback merely because these constants match. A database restore remains a separate, evidence-based incident decision. |
| Private material exclusion | Observed state | Git status at audit start contained no tracked backup or database dump; `.gitignore:157-165`; `README.md:63-65` | No backup contents, secret values, password hashes, or production credentials belong in these documents. |

The detailed recovery procedure and its open restore-drill gate are in `docs/architecture/PHASE_1_BASELINE_AND_RECOVERY.md`.

## Recovery-base head and gate state

**Observed state:** PR #29 is open and draft, with base `d524c905...` and head `75dc45f...`: `https://github.com/vfow/tv-tracker/pull/29`.

**Observed state:** its current `TV Tracker CI / test` check failed in run `32222669913`: `https://github.com/vfow/tv-tracker/actions/runs/32222669913/job/95976034186`.

The GitHub run recorded these unresolved categories:

| Failure category | Exact evidence | Disposition |
|---|---|---|
| Stale notification frontend contract | `tests/test_notification_contract.py:33` rejected `saveData(` in the consolidated frontend | Unresolved. Determine the required Notifications persistence boundary; do not delete the assertion merely for green CI. |
| Removed compatibility import still required by a test | `tests/test_notification_tvmaze_authority.py:8` imports removed root module `release_timing` | Unresolved. Migrate the test/caller to the canonical package only after confirming the intended public boundary. |
| WSGI and worker safety harness errors | `tests/test_phase12_safety_harness.py:208,244`; `wsgi.py:14`; `notification_worker.py:10`; `tvtracker/notifications/runtime.py:150` | Unresolved. Startup test doubles no longer isolate schema preparation; both entrypoint contracts must pass. |
| Font/release assertion | `tests/test_phase20_repository_release.py:6`; `static/css/tailwind-input.css` contains Graphik family references | Unresolved licensing/release cleanup. |
| Generated CSS assertions | `tests/test_source_contracts.py:450,627,853,967`; `static/css/tailwind.css` | Unresolved. Verify behavior and make source/generated checks robust without weakening product coverage. |

A local revalidation on 2026-08-19 ran `python tests/run_all.py` under Python 3.14 and stopped in the Python suite after 250 tests with 5 failures, 14 errors, and 1 skipped test. It reproduced the committed-head failures and also encountered local-environment-only issues: missing `cryptography`, Windows default text decoding, and no local Chromium. Those local-only issues do not replace the authoritative Linux/Python 3.12 GitHub failure record.

At audited head `75dc45f...`, no full-suite, release, or merge gate was green. Candidate remediation is not accepted until the final pushed SHA passes its required checks.

## Architecture authority

| Area | Classification | Authoritative statement |
|---|---|---|
| Backend/runtime | Locked product requirement | Flask remains the web/runtime foundation. |
| Persistent store | Locked product requirement | PostgreSQL remains the primary server-side system of record. |
| Styling | Locked product requirement | Tailwind remains the compiled styling system. |
| Frontend | Transition decision | Stabilize on modular vanilla JavaScript and browser-native APIs. No Vue, Vite, TypeScript, React, Next.js, or other framework migration belongs in this stabilization. |
| Framework migration | Future option | It may be evaluated only as an independent future proposal with measured benefit and a migration/rollback plan. |
| Media identity | Locked product requirement | TMDB ID is canonical for shows and movies after deterministic resolution. |
| Timing enrichment | Locked product requirement | TVmaze is optional timing enrichment. It cannot own media identity, routing, tracker state, History, or backup truth. |
| Notifications | Locked product requirement | Persisted in-app Notifications are primary. Push is an optional subordinate delivery channel and may fail or be removed without preventing notification persistence. |
| Data truth | Locked product requirement | Deliberate user state and History outrank provider metadata. Adult Filter hides; it never deletes tracked data. |
| Ownership | Transition decision | One domain has one permanent owner; one UI surface has one renderer; compatibility adapters require explicit removal gates. |
| Deployment | Transition decision | CI tests checked-in source, and production must deploy the exact accepted commit with a documented rollback. |

At committed `75dc45f...`, `frontend/`, `static/modern/tvtracker-modern.js`, root frontend build scripts, and CI/deploy frontend build steps contradict the locked frontend decision. Their presence is observed drift, not an accepted architecture and not evidence that the framework migration is complete.

## Phase ledger

| Phase | Artifact/evidence | Authoritative status at cutoff | Open gate |
|---:|---|---|---|
| 1 | `PHASE_1_BASELINE_AND_RECOVERY.md` | Baseline frozen; recovery validation open | Confirm deployed SHA when recovery is needed and complete isolated PostgreSQL/native-backup restore drills. |
| 2 | `PHASE_2_DEPENDENCY_MAP.md`, `PHASE_2_RECHECK_2026-08-18.md`, this ledger | Historical map retained; current-head delta recorded | Reconcile framework drift and update tests/callers that still assume removed compatibility modules. |
| 3 | `PHASE_3_DATA_INTEGRITY_AUDIT.md`, Phase 3 tests | Prior audit exists; current-head full revalidation blocked | Phase 3 targeted tests passed in the red GitHub run, but the required full suite did not. |
| 4 | `phase-4-api-external-service-audit.md`, Phase 4 tests | Boundary audit retained; release blockers open | Targeted provider/Push tests passed in the red run; broad TMDB proxy authority and visible attribution remain open. |
| 5 | `PHASE_5_SECURITY_SAFETY_AUDIT.md` | Partial | Repository security settings and production security/restore checks are unresolved; full suite is red. |
| 6 | `PHASE_6_BROWSER_STORAGE_PWA_AUDIT.md` | Repository inventory complete; remediation open | Logout/retention policy, stale-worker checks, and sensitive pending-save cleanup require implementation and browser proof. |
| 7 | `PHASE_7_FRONTEND_UI_UX_ACCESSIBILITY_ROUTING_AUDIT.md` | Partial | Full real-browser route, keyboard, screen-reader, contrast, and responsive acceptance is missing. |
| 8 | `PHASE_8_BACKEND_ARCHITECTURE_AUDIT.md` | Audit map complete; extraction incomplete | Root `app.py` still owns most domains; startup DDL/data cleanup and empty package homes remain. |
| 9 | `PHASE_9_HOSTING_CICD_OPERATIONS_AUDIT.md` | Partial | AlwaysData runtime, proxy, worker, backup restore, logging, exact-SHA rollout, and rollback are not proven. |
| 10 | `PHASE_10_PERFORMANCE_ASSETS_LEGAL_DOCS_AUDIT.md` | Partial | No performance baseline; font provenance, visible attribution, legal copy review, and documentation drift remain. |
| 11 | `PHASE_11_RISK_REGISTER_ARCHITECTURE_LOCK.md` | Architecture decisions locked; acceptance blocked | Risks R-01 through R-17 remain open or controlled as listed; prior phase gates are not all satisfied. |

## Phase 2-4 current-head addenda

### Phase 2

**Observed state:** `.github/workflows/ci.yml@75dc45f...` tests checked-in source and contains no source-transform step. This preserves the Phase 2 recheck invariant.

**Observed state:** root Python compatibility modules were removed in favor of `tvtracker/notifications/`, `tvtracker/release_timing/`, `tvtracker/integrations/tvmaze.py`, and `tvtracker/infrastructure/static_assets.py`. The red import in `tests/test_notification_tvmaze_authority.py:8` proves caller migration is not fully closed.

**Observed state:** `app.py`, `wsgi.py`, and `notification_worker.py` still make the root application a load-bearing bootstrap. `templates/index.html@75dc45f...` loads 26 classic scripts plus one modern module bundle. Global wrappers and load-order behavior remain in `static/js/tracker-integrity.js`, `static/js/streaming-region.js`, `static/js/provider-freshness.js`, `static/js/discover-runtime.js`, `static/js/trending.js`, and `static/js/notifications-runtime.js`.

### Phase 3

**Observed state:** current head and known-good main both declare schema version 5 and native backup version 2. `tests/test_phase3_backend_data_integrity.py` passed in the red GitHub run. `tests/test_phase3_data_integrity.js` did not run because `tests/run_all.py` stopped after the failed Python suite.

**Locked product requirement:** no unresolved or suspicious historical record may be automatically rewritten from provider metadata. The private recovery files remain outside Git.

**Gate decision:** do not repeat the prior document's current-head completion claim until all Phase 3 tests and the full suite pass on the final candidate.

### Phase 4

**Observed state:** all five tests in `tests/test_phase4_external_services.py` passed in the red GitHub run. The broader run still failed, so this is targeted evidence only.

**Locked product requirement:** TMDB identity, optional TVmaze timing, and Push subordinate to persisted Notifications remain unchanged.

**Open release blockers:** `app.py:3993-4043` exposes a host-constrained but broad TMDB path proxy; visible JustWatch/TMDB/TVmaze attribution is absent from templates and runtime UI; the current full provider/notification suite is red.

## Blocker handoff

| ID | Blocker | Carried to | Objective closure |
|---|---|---|---|
| B-01 | PR head is red | Phases 5, 7, 8, 9, 11 | Final candidate passes the exact CI workflow and all required local targeted gates without test weakening. |
| B-02 | Frontend framework artifacts contradict the lock | Phases 7, 9, 10, 11 | Vue/Vite/TypeScript source, generated bundle, dependencies, workflow steps, and runtime mount are absent, or Phase 11 is explicitly re-opened and re-approved. |
| B-03 | Pending saves and browser identifiers survive normal logout | Phases 5, 6, 11 | Written cleanup/retention policy plus browser tests for logout, password change, session expiry, and future account switching. |
| B-04 | Security operations are not verified | Phases 5, 9, 11 | Branch protection, scanning, dependency policy, proxy trust, HTTPS, DB privileges, secret rotation, and host access controls are evidenced without revealing values. |
| B-05 | Accessibility/responsive acceptance is incomplete | Phases 7, 11 | Automated accessibility checks and manual keyboard/screen-reader/mobile matrix pass on supported browsers. |
| B-06 | Root startup still performs schema/data work | Phases 8, 9, 11 | Explicit migrations own schema changes; startup is repeatable and does not silently mutate uncertain user data. |
| B-07 | Deployment is not exact-SHA/atomic and has no proved rollback | Phases 1, 9, 11 | Staging/preflight, exact artifact/SHA deployment, worker handling, health/smoke verification, and timed rollback drill pass. |
| B-08 | Font licensing and provider attribution are unresolved | Phases 10, 11 | Proven asset licenses/provenance and required visible provider attribution are present and reviewed. |
| B-09 | No performance baseline or budget exists | Phases 7, 9, 10, 11 | Repeatable browser/server/worker measurements and agreed regression budgets are recorded. |
| B-10 | Host worker cadence and production configuration are unknown | Phases 5, 9, 11 | Redacted AlwaysData evidence confirms runtime, proxy, schedule, timezone, logs, resources, backups, and restart behavior. |
| B-11 | Backups exist but restores are unproved | Phases 1, 5, 9, 11 | Isolated PostgreSQL and native App Backup restore drills pass with counts/invariants, without exposing private content. |

## Non-authorization boundary

The branch contains commits and documents labeled for Phases 12-23. Those labels do not supersede this ledger and do not close Phases 1-11. Phase 24 is not in scope. PR #29 must remain unmerged until the owner separately authorizes a later release process after all objective blockers are closed.

## Ledger exit criteria

This ledger itself is current when all of the following remain true:

- both recovery SHAs are exact and resolvable;
- the live PR/check state is recorded without calling a red gate green;
- private backup existence is recorded without recording contents or locations;
- every Phase 1-11 status links to an evidence artifact;
- architecture statements use the four evidence categories above;
- unresolved blockers have objective closure conditions;
- no deployment, Phase 24, merge, secret disclosure, or private-data commit is implied.

## Addendum 2026-08-19 (Batch 2 Step 0, head e137e7b1)

**Observed state:** PR #29 head advanced `75dc45f...` → `e137e7b1ffd8686043f4a57a85306433a90aea22` (commits `d6fb73c`, `e137e7b`). The `test` check passed in run `32262721884`: Python + JavaScript regression, 295 tests, OK, against a PostgreSQL 16 service; Tailwind build-equality and diff-hygiene steps also passed. This is the first green full-suite gate on the branch and the new recovery base for Phase 1-11 evidence.

**Native App Backup — verified evidence (was owner-confirmed only):**

| Item | Value |
|---|---|
| File | `tv-tracker-app-backup-2026-08-18--- fresh copy.json` (owner-held, outside the repo) |
| Location | Owner's documents folder, outside the Git worktree |
| SHA-256 | `A1126EFB942B3D1D85C9EC0F9BC6B8DABC535CF78E0216AD6E6B5BC67E7944CB` |
| schemaVersion | 4 |
| exportTimestamp | 2026-08-18T08:28:43.653Z |
| Content counts | 328 shows; movies and History present |
| Companion HTML export | `tv-tracker-app-backup-2026-08-18--- fresh copy.html`, same folder |

Contents are recorded at count level only; no private content is reproduced here. Restoreability remains unproved (blocker B-11): an isolated restore drill is still required before Phase 22/24.

**PostgreSQL backup:** owner re-confirmed a fresh PostgreSQL backup exists outside Git at AlwaysData on 2026-08-19. Restoreability/retention/encryption remain unverified (B-11).

**Private material exclusion — hardened:** `.gitignore` now excludes `tv-tracker-app-backup*`, `*app-backup*.json`, `*app-backup*.html`, `backups/`, `*.sql`, `*.dump`, `*.pg_dump`, `Chat history *.html`, `chat history *.html`, `TV-Tracker-Original-24-Phase-Roadmap-for-Codex.md`, and `opencode.cmd`. `git status` at this addendum is clean of all private/chat/helper material.

**Phase 1 gate update:** baseline SHA + deployed SHA + backup existence are now evidenced (code SHAs `d524c905...`/`e137e7b1...`, verified backup record above, PG backup owner-confirmed). The remaining Phase 1 open item is the restore drill (B-11), which the roadmap schedules at the Phase 22 boundary.
