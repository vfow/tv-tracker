# Full Audit — 2026-08-24

Five-domain deep read-only audit of branch `architecture-cleanup` (`c0953dc`), plus direct
scans (tracked-file inventory, secret regex, GitHub controls). Release gate for the current
campaign: all CRITICAL + HIGH items fixed before merge; MEDIUM backlog scheduled post-merge.

## CRITICAL (release blockers)

| ID | Finding | Location |
|---|---|---|
| C1 | Repo had no LICENSE (public repo, all rights reserved). Resolved by making repo private (2026-08-24). | root |
| C2 | Logout clears nothing client-side: pending-save queue (user data deltas) and TMDB/cache entries persist in localStorage/sessionStorage; leaks across users on shared browsers. | `static/js/settings.js:136`, `app.py:2934`, `static/js/db.js:29-90`, `static/js/tmdb.js` |

## HIGH

| ID | Finding | Location |
|---|---|---|
| H1 | Duplicate `renderHistory` — `history-activity.js` silently overwrites `ui.js`'s copy via script load order; `ui.js` version is dead code. | `static/js/ui.js:4438` vs `static/js/history-activity.js:88` |
| H2 | Dual router layers: `trending.js` capture-phase click interceptor + popstate handler calling `stopImmediatePropagation()`; correctness depends on script load order only. | `static/js/trending.js:406-429` |
| H3 | TMDB proxy accepts any path and query (client can pass `include_adult`, arbitrary `language`); no endpoint/param allowlist; no server-side response cache; relays upstream 429 without backoff. | `app.py:83, 3952-3996` |
| H4 | `pywebpush==2.3.0` unmaintained since 2023 — assess CVEs, pin, document, monitor. | `requirements.txt:4` |
| H5 | `ci.yml` uses mutable action tags (`@v4`) while `deploy.yml` SHA-pins; inconsistent supply-chain posture. | `.github/workflows/ci.yml:30-34` |

## MEDIUM (selected — full backlog for post-merge scheduling)

- Server show-upsert replaces the whole record; watched-state preservation enforced only client-side (`app.py:3693-3702`).
- Backup import dedupes history silently, no dropped-count report (`app.py:1123-1139`).
- `cleanup_stored_tracker_data()` mutates stored data at startup without revision bump (`app.py:868-897`).
- `PATCH /api/state` not rate-limited; corrupted pending-save queue silently discarded (unsaved-data loss).
- Notification event claimed before enabled-check → lost when notifications disabled at event time (`tvtracker/notifications/backend.py:467-474`).
- >200 notification changes per worker run lose push deliveries (`tvtracker/notifications/push_and_movies.py:397-407`).
- Worker fetches TMDB with no cache — re-fetches every tracked show each run (`app.py:2718-2755`).
- Logout does not bump `session_version` (stolen cookie remains valid up to 7 days) (`app.py:2934-2939`).
- `/healthz` unauthenticated when `HEALTHZ_SECRET` unset (`app.py:3214-3225`); `.env.example` omits it.
- No CSRF check on `/api/release-timing/batch` (`tvtracker/release_timing/routes.py:64-66`).
- Rate limiting keyed on proxy-collapsed IP unless `TRUST_PROXY_HEADERS` set; undocumented (`app.py:502-503, 2768-2769`).
- TVmaze tables (`tv_tracker_tvmaze_mapping`, `tv_tracker_tvmaze_episode_cache`) outside migration ledger contract (`tvtracker/integrations/tvmaze.py:181-209`).
- League Gothic fonts bundled without required OFL license text.
- JustWatch attribution not visible in-app (owner deferred — will design later).
- PRIVACY.md / TERMS.md one paragraph each; no retention/contact/jurisdiction.
- No Python vulnerability scan or lint/type check in CI.
- Legacy test names (`final_*`, `polish_*`, `destruction_*`) and overlapping notification test files.
- Frontend: `csrfToken` duplicated 7×, `escapeHTML` 4×, dead `showToast`/`config.js` globals; search input unlabeled; modals lack dialog role/focus trap.
- Tailwind 3.4 / DaisyUI 4 on legacy major versions (upgrade = config migration; defer).
- `.vscode/`/`.idea/` unignored; stray `opencode.cmd` (0 bytes) in repo folder; `package.json` name `tv-tracker-main`.

## Verified strengths (no action)

CSRF token + rotation; Argon2 (Argon2id, t=3, m=64MiB, p=4); HttpOnly+Secure+SameSite cookies;
strict CSP `script-src 'self'`; login/account/sync throttling; session-version invalidation on
credential change; HSTS/`X-Frame-Options`/nosniff/Permissions-Policy; fail-closed checksummed
migration ledger with advisory lock; single-transaction sync with entity conflict detection and
idempotent operationIds; atomic strictly-validated backup import; hide-only adult filter; VAPID
private key never reaches the browser; persisted-before-Push ordering; SHA-pinned `deploy.yml`
with exact-SHA staged rollout + trap rollback + `/healthz` verification; secrets env-only; clean
`.gitignore` (181 tracked files, zero committed secrets, zero pycache/node_modules/backups).
