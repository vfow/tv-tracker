# Recovery State Ledger — 2026-08-24

> Continuation of `RECOVERY_CURRENT_STATE_LEDGER_2026-08-19.md`. Authoritative for the
> current architecture-cleanup campaign.

## Baselines

| Item | Value |
|---|---|
| Production `main` SHA | `d524c905c11101566c0493053e5414649ea6b105` (deployed, Push verified working) |
| Architecture branch (remote) | `architecture-cleanup` |
| Baseline SHA (branch start) | `208c7dc5699ab6db3a071dbd45265094bb26a8b5` ("Phase 17: single-owner frontend consolidation") |
| Current branch head | `c0953dc674dfc27363cd1e689489e750ad773166` ("Phase 3: scrub hosting account identifier from test fixtures") |
| CI at baseline | `32709723743` — success (TV Tracker CI, Postgres 16, Python 3.12, Node 22) |
| CI at current head | `32710604813` — success |
| Repo visibility | **PRIVATE** (changed 2026-08-24, was public) |
| Local working tree | clean, on `architecture-futureproof-2026-08-18`, tracking `origin/architecture-cleanup` |

## Rollback layers (confirmed 2026-08-24)

1. **Code**: `d524c905` = production; `208c7dc` = last known-good architecture state (both on GitHub).
2. **Database**: AlwaysData PostgreSQL automatic backups enabled (owner-confirmed).
3. **User data**: fresh native App Backup exists (owner-confirmed). Backups must never be committed (repo gitignores them).

## GitHub hardening state

| Control | State |
|---|---|
| Repo visibility | Private ✅ |
| Dependabot vulnerability alerts | Enabled ✅ |
| Dependabot automated security fixes | Enabled ✅ |
| Actions allowed actions | Selected — verified creators only ✅ |
| Default workflow permissions | Read ✅ |
| Branch protection / rulesets on `main` | NOT possible on GitHub Free private repos (403). Mitigations: exact-SHA deploy gate in `deploy.yml` + CI secret-scan step (Phase 7) + push discipline. Owner decision: stay on Free. |
| Secret scanning (native) | NOT possible on GitHub Free private repos (422). Mitigated by CI secret scan (Phase 7). |

Dependabot note: the single open HIGH alert (`nanoid` >=4.0.0 <5.1.6) applies to `main`'s old lockfile only;
`architecture-cleanup` resolves `nanoid@3.3.18` (not vulnerable). Alert auto-resolves at merge.

## Secret hygiene

- `broghgf7` (AlwaysData account name) removed from all tracked files — commit `c0953dc`:
  `tests/test_final_notifications.py`, `tests/test_notification_polish_runtime.py`,
  `tests/test_source_contracts.py`.
- Chat-history exports (contained account/site IDs and a VAPID public key) moved out of the repo
  folder to `C:\Users\Ibrahim\Documents\tv-tracker-chat-exports`. Gitignore entry retained defensively.
- Verified: no secrets in tracked files or git history (regex scan, 2026-08-24).

## 2026-08-24 full audit

A five-domain deep audit (security, data integrity, frontend, external dependencies, ops/CI/CD/legal)
was completed against branch head. Full findings: `docs/architecture/FULL_AUDIT_2026-08-24.md`.
Summary: no CRITICAL code vulnerability; hardening well above average (CSRF, Argon2, CSP, cookie
flags, session-version invalidation, fail-closed migration runner, atomic backup import, single-
transaction sync). Release gate for this campaign: all CRITICAL + HIGH findings fixed before merge
(see audit doc); MEDIUM backlog tracked post-merge.

## Phase 4 approved production data repairs (owner-authorized 2026-08-24)

Evidence collected by `tools/data_repair_report.py` via the temporary read-only report workflow
(production DB, schema v5):
- 17 Monster history rows confirmed: `S2E1-S2E9` (imported 2024-09-22) and `S3E1-S3E8`
  (imported 2025-10-10+) attached to TMDB 30981 (show has `number_of_seasons=1`).
- 4 special progress collisions confirmed: Black Mirror S2E1, Euphoria S1E1 + S2E2,
  Invincible S2E1.

Approved actions (run immediately AFTER Phase 9 deploy, because the repair tool fail-closes
until the production schema reaches v6):

1. `python tools/data_repair_report.py --repair-monster 2=225634,3=286801 --confirm yes --backup-verified`
   - S2 rows → TMDB 225634 ("Monsters: The Lyle and Erik Menendez Story")
   - S3 rows → TMDB 286801 ("Monster: The Ed Gein Story")
2. `python tools/data_repair_report.py --repair-specials --confirm yes --backup-verified`
   - removes the 4 colliding coordinates from regular `episodes_watched`; history rows stay intact.

Post-repair verification: re-run report (suspects = 0, collisions = 0), then verify critical flows.

## Open blockers (carried into current campaign)| ID | Blocker | Phase |
|---|---|---|
| B-01 | Data fixes: 17 mis-imported Monster records, 4 specials collisions, schemaVersion bookkeeping | 4 |
| B-02 | Logout does not clear client storage (localStorage/sessionStorage/pending-save queue) | 5 |
| B-03 | Duplicate `renderHistory` owners (ui.js vs history-activity.js) | 5 |
| B-04 | Dual router layers (`trending.js` capture-phase + `stopImmediatePropagation`) | 5 |
| B-05 | TMDB proxy too broad (no endpoint/param allowlist, no server cache) | 5 |
| B-06 | `ci.yml` actions not SHA-pinned; no Python vulnerability scan; no CI secret scan | 7 |
| B-07 | Restore drill (PG restore + App Backup restore) not yet executed | 7 |
| B-08 | `pywebpush==2.3.0` unmaintained since 2023 — assess CVEs, pin, document | 7 |
| B-09 | Docs/legal: OFL text missing for bundled fonts; Privacy/Terms thin; legacy test names | 6 |
| B-10 | MEDIUM backlog from full audit (see FULL_AUDIT doc) | post-merge |

Production rollout (old Phase 24) remains unauthorized until the campaign's Phase 8 gate passes
and the owner issues an explicit merge.
