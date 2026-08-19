# Phase 1 - Known-Good Baseline and Recovery

Status: baseline frozen; disaster-recovery validation remains open

Evidence cutoff: 2026-08-19

Behavioral rollback SHA: `d524c905c11101566c0493053e5414649ea6b105`

Candidate comparison SHA: `75dc45f2d21c924533eb77f7653e425a8bb18bc9`

## Baseline decision

**Observed state:** PR #28 merged as `d524c905...` on 2026-08-17. Its `TV Tracker CI / test` check succeeded, and the subsequent `Deploy TV Tracker` workflow succeeded.

**Owner-confirmed fact:** the owner observed the merged `d524c905...` behavior as known-good.

**Locked product requirement:** if stabilization causes a regression, restore behavior to `d524c905...` before attempting speculative cleanup. User data and recovery evidence take priority over architecture cleanliness.

This baseline identifies a code destination. It does not assert that every external host setting or backup has been independently restored during this audit.

## Exact evidence

| Evidence | Location |
|---|---|
| Known-good commit | `d524c905c11101566c0493053e5414649ea6b105` |
| Merged change | `https://github.com/vfow/tv-tracker/pull/28` |
| Green PR check | `https://github.com/vfow/tv-tracker/actions/runs/32024848159` |
| Successful deploy workflow | `https://github.com/vfow/tv-tracker/actions/runs/32025234154` |
| Flask application and schema | `app.py@d524c905...` |
| WSGI entrypoint | `wsgi.py@d524c905...` |
| Notification worker entrypoint | `notification_worker.py@d524c905...` |
| Python dependencies | `requirements.txt@d524c905...` |
| Tailwind build | `package.json@d524c905...`, `tailwind.config.js@d524c905...` |
| SPA composition root | `templates/index.html@d524c905...` |
| Browser persistence/sync | `static/js/db.js@d524c905...` |
| Route parser | `static/js/app-router.js@d524c905...` |
| Provider authority | `docs/TVMAZE.md` at current head and provider tests retained from main |

## Baseline contract

| Area | Baseline value or behavior | Classification |
|---|---|---|
| Runtime | Flask served through `wsgi.py` | Observed state |
| Database | PostgreSQL via psycopg | Observed state |
| Schema version | 5 | Observed state |
| Native backup format | backup version 2; versions 1 and 2 accepted | Observed state |
| Frontend | Classic plain JavaScript plus Tailwind CSS | Observed state |
| Authentication | Single private admin, Argon2 password hash, signed Flask session | Observed state |
| Synchronization | Revision/change-log protocol with operation IDs and conflict/reset handling | Observed state |
| Media identity | TMDB ID is canonical after deterministic resolution | Locked product requirement |
| Optional timing | TVmaze may enrich timing and must fall back to TMDB | Locked product requirement |
| Notifications | In-app record is persisted independently of optional Push | Locked product requirement |
| PWA | Manifest, root Push service worker, no offline fetch cache | Observed state |
| Adult Filter | Default ON; hide-only, never destructive | Locked product requirement |

The baseline critical behavior is owner-observed as known-good and protected by the successful check/deploy records. This audit did not manually replay every UI flow against a live production database, so it does not fabricate per-flow observations.

## Private recovery assets

**Owner-confirmed fact:** a fresh native TV Tracker App Backup and a fresh PostgreSQL backup exist outside Git.

The following are intentionally not recorded:

- filenames or storage locations that could expose owner infrastructure;
- show titles, History, profile data, timestamps, Push endpoints, or other backup contents;
- database credentials, secret keys, API keys, password hashes, tokens, or cookie values.

Availability does not prove restoreability. Both restore paths need isolated drills before final release acceptance.

## Recovery hierarchy

1. **Code rollback:** deploy exact commit `d524c905...`; do not use a moving branch name as the rollback target.
2. **Database recovery:** use the owner-held PostgreSQL backup only when database state is damaged or an incompatible migration occurred.
3. **User-data recovery:** use the owner-held native App Backup for application-level restoration after its structure is validated.

The code at `d524c905...` and `75dc45f...` both declare schema version 5 and native backup version 2. That reduces format uncertainty but is not permission to overwrite a database or skip a restore rehearsal.

## Incident rollback procedure

1. Stop new writes and the notification worker if continued processing could worsen the incident.
2. Record the failing deployed commit, UTC time, health result, migration output, and non-secret symptom summary.
3. Capture a new forensic PostgreSQL snapshot before changing code or data when the host permits it.
4. Determine whether the incident is code-only, data-only, or both.
5. For a code-only incident, deploy exact `d524c905...` while retaining the current database.
6. Restart WSGI and verify `/healthz`; verify authenticated `/api/health` without publishing its details.
7. Run the critical behavior checks below against the rolled-back code.
8. Restore PostgreSQL only if the data itself is invalid and an isolated restore has proved the selected backup.
9. Import the native App Backup only as an explicit application-level replacement after validation and a fresh pre-import snapshot.
10. Preserve incident evidence and document which recovery layer was used.

Never run two restore paths reflexively. A code regression does not justify discarding newer valid user data.

## Critical recovery checks

| Check | Objective acceptance |
|---|---|
| Health | `/healthz` returns 200 and `{"ok":true}` through the real proxy; authenticated `/api/health` reports database available and schema 5. |
| Authentication | Valid login succeeds; invalid login fails; logout invalidates the current session; old sessions fail after credential rotation. |
| Tracker | Existing shows/movies, statuses, progress, favorites, notes, profile, and History counts match the pre-incident record. |
| Mutations | One watched/unwatched operation and one status change persist after reload without duplicate History. |
| Sync | A second tab/device receives a revision update; a stale conflicting write cannot silently replace newer state. |
| Backup | Export succeeds and validates as native backup version 2/schema 5 without committing the file. |
| Routes | Direct, refresh, Back, and Forward work for list, show, episode, movie, Search, Settings, Upcoming, and History. |
| Providers | TMDB core works; TVmaze disabled/failing still yields core timing; provider state does not change tracker identity. |
| Notifications | In-app notifications load and persist with Push disabled or unavailable. |
| Push | If configured for the recovery environment, failure remains isolated and no secret diagnostics reach normal browser responses. |

## Restore-drill protocol

The PostgreSQL drill must use an isolated database and non-production credentials. Record only non-sensitive results:

- backup timestamp and checksum stored privately by the owner;
- restore command exit status;
- schema version;
- table presence and aggregate row counts;
- application health and critical invariant results;
- elapsed recovery time;
- rollback/cleanup result for the isolated environment.

The native App Backup drill must use an isolated database, validate before mutation, import transactionally, and compare aggregate counts plus representative synthetic or privately reviewed invariants. Do not commit the backup or drill output containing personal data.

## Known limits carried forward

| Limit | Carried to | Required closure |
|---|---|---|
| Current production SHA was not independently read from the host | Phase 9 | Record the deployed exact SHA through a redacted host command or release marker. |
| PostgreSQL restore has not been demonstrated | Phases 5, 9, 11 | Complete the isolated drill above. |
| Native App Backup restore has not been demonstrated with the private file | Phases 3, 9, 11 | Complete a private isolated round trip and record only aggregate/invariant results. |
| Host backup retention/encryption/access are unknown | Phases 5 and 9 | Owner verifies policy and access controls without sharing secret values. |
| Recovery time objective is unset | Phases 9 and 11 | Owner sets an acceptable recovery time and the drill meets it. |
| Candidate `75dc45f...` is red | Phase 11 | No release or merge until the final candidate is green. |

## Phase 1 exit criteria

| Criterion | State |
|---|---|
| Exact known-good code SHA is recorded | Met |
| Known-good PR check and deploy workflow are recorded | Met |
| Owner confirms known-good behavior | Met |
| Fresh native and PostgreSQL backups exist outside Git | Met — native backup verified 2026-08-19 (schemaVersion 4, 328 shows; SHA-256 + counts recorded in the recovery ledger addendum, file outside the worktree); PostgreSQL backup owner-confirmed |
| Recovery behavior and rollback ordering are documented | Met |
| Current production SHA can be independently identified | Open |
| PostgreSQL restore succeeds in isolation | Open |
| Native App Backup restore succeeds in isolation | Open |
| Critical recovery checks pass after a timed drill | Open |

Phase 1 provides a usable code and recovery baseline. The broader disaster-recovery gate remains open and is a release blocker, not a reason to expose or commit private recovery material. The candidate head for all Phase 1-11 evidence advanced to `e137e7b1...` (CI green, 295 tests) on 2026-08-19; see the ledger addendum.
