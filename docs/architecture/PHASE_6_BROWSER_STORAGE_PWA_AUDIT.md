# Phase 6 - Browser Storage, Cookies, and PWA Audit

Status: repository inventory complete; cleanup, retention, and browser acceptance gates open

Evidence cutoff: 2026-08-19

Committed source audited: `75dc45f2d21c924533eb77f7653e425a8bb18bc9`

## Governing decisions

**Observed state:** no analytics, advertising, cross-site tracking script, or third-party JavaScript is loaded by `templates/index.html`, `templates/login.html`, or `templates/error.html`.

**Locked product requirement:** authentication, CSRF, pending-save reliability, and Push operational state must never be disabled behind a consent control.

**Transition decision:** do not add an "Accept All" banner merely because storage exists. First minimize and document storage. Whether any notice or consent is legally required depends on the actual deployment and applicable rules; this audit does not give legal advice.

## Cookie inventory

| Cookie | Data/purpose | Lifetime | Security/sensitivity | Logout/password change | Evidence | Open issue |
|---|---|---|---|---|---|---|
| `tv_tracker_session` | Signed Flask session containing authentication state, CSRF token, session version, return path/notices, and small UI state | Permanent session, seven days | Authentication/security-critical; `Secure`, `HttpOnly`, `SameSite=Lax` | `session.clear()` on logout; account change increments DB session version and clears current session | `app.py:495-600`, `2815-2831`, `2970-2984`, `3383-3413` | Production HTTPS/proxy behavior and browser expiry acceptance are unverified. Flask's client-side session is signed, not a place for secret or bulk user data. |
| `tv_tracker_push_device` | Server-readable Push device identifier | One year | Device identifier; `HttpOnly`, `SameSite=Lax`; `Secure` follows `request.is_secure` | Deleted on unsubscribe/logout; server subscriptions/presence deleted for current device; all server device records deleted after account change | `tvtracker/notifications/push_and_movies.py:36`, `1258-1332` | `Secure` depends on proxy scheme; local device ID and browser PushSubscription remain after ordinary logout/account change. |

No other application cookie writer was found. Browser/provider infrastructure may set its own cookies outside application source; verify with production browser developer tools.

## Local storage inventory

| Key/prefix | Data/purpose | Effective lifetime | Sensitivity | Cleanup/failure/cross-tab behavior | Evidence |
|---|---|---|---|---|---|
| `tv-tracker-pending-saves:v1` | Unsaved tracker delta, operation ID, base revision, timestamps, and dirty state | No TTL; removed operation-by-operation after server acknowledgement or on transactional replacement | **High:** may contain History, profile, tracker, movie, or provider-state changes | Prefers `localStorage`; falls back to `sessionStorage`, then in-memory. Malformed/unavailable storage makes protected persistence fail and the tab may retain an in-memory queue. Not cleared by logout. Replayed over server state on next app load. | `static/js/pending-save-store.js`; `static/js/db.js:13-188`, `1022-1063`, `1481-1682`; `static/js/save-storage-fallback.js` |
| `tv-tracker-push-device:v1` | Stable random browser/device ID sent with Push APIs | No TTL or logout removal | Medium device identifier | Reused across tabs. Storage failure produces an ephemeral generated value. Server cookie/subscription can be deleted while this local ID remains. | `static/js/notifications-runtime.js:883-962`, `1055-1073` |
| `tv-tracker-tmdb-configuration:v2` | TMDB image/configuration payload | Seven-day TTL checked on read | Low provider metadata | Removed when stale; storage errors are silent; shared across tabs | `static/js/tmdb.js:1-4`, `241-290` |
| `tv-tracker-tmdb-provider-catalog:v1:<media>:<region>` | Provider catalog for selected region | 24-hour TTL checked on read | Low/medium; records region and provider catalog | Removed when stale; storage errors are silent; shared across tabs | `static/js/tmdb.js:24-109` |
| `tv-tracker-provider-availability:v1:<media>:<TMDB ID>:<region>` | Watch-provider availability for untracked titles or a fallback copy | Fresh for 3 days; retained up to 30 days and pruned only when read | Medium browsing/provider trace | No global logout purge. Tracked-title provider data may move into synchronized `provider_metadata`; untracked cache remains local. | `static/js/provider-freshness.js:4-90`, `165-195`, `361-409` |

## Session storage inventory

`sessionStorage` is scoped to a browser tab and normally disappears when that tab closes. It is not cleared by the application on logout or session invalidation.

| Key/prefix | Data/purpose | TTL/bound | Sensitivity | Evidence |
|---|---|---|---|---|
| `tv-tracker-pending-saves:v1` | Fallback pending-save queue when local storage is unavailable | No TTL; tab lifetime plus acknowledgement | High user-data delta | `static/js/db.js:39-80`; `static/js/pending-save-store.js` |
| `tv-tracker-push-client:v1` | Random per-tab presence identifier | Tab lifetime; no explicit cleanup | Medium device/activity identifier | `static/js/notifications-runtime.js:886-962`, `1231-1257` |
| `tv-tracker-tmdb-search:<normalized query>` | Up to 20 search results; query is part of the key | One hour | Medium browsing/search trace | `static/js/tmdb.js:1-2`, `111-193` |
| `tv-tracker-v2-episode-details:<id>` | Episode detail/provider payload | 24 hours | Low/medium media browsing data | `static/js/app.js:157-158`, `2534-2582` |
| `tv-tracker-discover-hub:v9` | Discover rows, genres, and collections | Three hours | Low/medium browsing cache | `static/js/app.js:171-174`, `3897-3948` |
| `tv-tracker-tmdb-collection-detail:v5:<id>` | Collection detail and movies | 24 hours | Low browsing cache | `static/js/app.js:180-181`, `4010-4043` |
| `tv-tracker-tmdb-collection-index:v6` | Collection index page payload | Five minutes | Low browsing cache | `static/js/app.js:182-183`, `4235-4261` |
| `tv-tracker-tmdb-tv-genres:v1`, `tv-tracker-tmdb-movie-genres:v1` | Genre lists | Seven days | Low provider metadata | `static/js/app.js:249-251`, `8386-8419` |
| `tv-tracker-trending:v1:<feed>` | TMDB trending result payload | 30 minutes for daily feeds; three hours for weekly feeds | Low/medium browsing cache | `static/js/trending.js:4-13`, `151-186` |
| `tv-tracker-route-nav-context:v1` | Route -> primary navigation context, capped at 80 keys | No TTL; tab lifetime | Low navigation trace | `static/js/app.js:238`, `3414-3464` |
| `tv-tracker-collection-return-position:v1` | Route scroll and rail positions | No TTL; tab lifetime; no explicit key cap observed | Low navigation trace | `static/js/app.js:184`, `5446-5524` |
| `tv-tracker-404-gradient-index` | Last decorative error gradient | Tab lifetime | Non-personal UI state | `static/js/app.js:6520-6531` |

Adult Filter changes purge known search/discover/collection-detail session caches at `static/js/adult-filter.js:285-305`. That is a policy-specific purge, not a complete logout cleanup.

## IndexedDB and browser Push state

### Tracker IndexedDB

`static/js/config.js:3-5` declares `DB_NAME`, `STORE_NAME`, and `DATA_KEY`, but no tracked browser JavaScript consumes those constants and no tracker `indexedDB` call exists in `static/js/`. They are stale declarations, not evidence of an active tracker IndexedDB database.

### Service-worker pending-click database

The generated service worker owns IndexedDB database `tv-tracker-push-clicks`, object store `pending`, keyed by notification ID. It stores notification ID, route, and timestamp when a Push notification is clicked. Records older than 24 hours are deleted when pending clicks are read; acknowledged records are deleted after the app marks the in-app notification read.

Evidence: `tvtracker/notifications/push_and_movies.py:1058-1181`; browser consumption at `static/js/notifications-runtime.js:1533-1610`.

Open behavior:

- no logout/password-change purge is implemented for this IndexedDB database;
- expiry cleanup runs on read, not a scheduled service-worker lifecycle event;
- an unacknowledged record can remain until a later read after its 24-hour age;
- storage contains no Push cryptographic key or notification body, but notification ID and route are still application activity data.

### Browser-managed PushSubscription

The browser stores endpoint and cryptographic subscription keys as browser Push state. TV Tracker sends them to authenticated server tables through `/api/push/subscribe`. Disabling Push calls browser `unsubscribe()` and deletes the server row. Ordinary logout deletes the server row/cookie but does not call browser `unsubscribe()`. Account change deletes all server subscriptions but cannot directly remove subscriptions from other browsers.

Evidence: `static/js/notifications-runtime.js:1042-1229`; `tvtracker/notifications/push_and_movies.py:632-743`, `1252-1332`.

## Cache API, HTTP cache, and service-worker lifecycle

**Observed state:** the service worker has `push`, `notificationclick`, and `message` handlers only. It has no `fetch`, `install`, or `activate` handler and makes no `caches`/Cache API call. TV Tracker is installable and Push-capable, but it is not an offline application.

**Observed state:** `/service-worker.js` is served with `no-cache, no-store, must-revalidate`, root scope permission, and browser registration uses `updateViaCache:"none"`.

**Observed state:** application/private responses default to `no-store`. A static URL with the correct SHA-256-derived `v` query receives one-year immutable caching; absent/stale versions must revalidate.

Evidence:

- `tvtracker/notifications/push_and_movies.py:1040-1181`, `1227-1239`;
- `static/js/notifications-runtime.js:1042-1047`, `1603-1610`;
- `tvtracker/infrastructure/static_assets.py`;
- `app.py:2860-2902`;
- `tests/test_cache_headers.py` and `tests/test_final_notifications_flask.py`.

Open lifecycle gates:

- prove upgrade from the known-good worker to the final worker in Chrome, Firefox where supported, Safari/iOS installed mode, and Edge;
- prove a stale controlled page cannot submit incompatible state after backend migration;
- document an emergency worker rollback/unregister procedure;
- verify production reverse proxy does not override no-store/versioned policies.

## Server-side browser-related state

| State | Owner | Retention/cleanup evidence | Classification |
|---|---|---|---|
| Push subscriptions | `tv_tracker_push_subscriptions` | Deleted on unsubscribe, logout current device, account change all devices, dead endpoint 404/410, or session-version preparation | Sensitive operational Push state; not native backup truth |
| Push presence | `tv_tracker_push_presence` | Removed with subscription, session invalidation, and pruning in worker paths | Device/tab visibility activity; operational only |
| Push deliveries | `tv_tracker_push_deliveries` | Status/retry/pruning paths in notification runtime | Operational delivery state; subordinate to Notification record |
| In-app notifications | `tv_tracker_notifications` | Persist independently of Push delivery | Product state; Push cannot gate creation |
| Provider metadata | PostgreSQL `tv_tracker_state.provider_metadata` for tracked media | Synchronized/backup-valid at current head | Rebuildable enrichment; must not own tracker identity |

Evidence: `tvtracker/notifications/push_and_movies.py`, `tvtracker/notifications/runtime.py`, `app.py:188-195`, `1504-1559`, and `docs/architecture/PHASE_3_DATA_INTEGRITY_AUDIT.md`.

## Logout and invalidation matrix

| Mechanism | Logout | Password/username change | Session expiry | Required decision |
|---|---|---|---|---|
| Flask session | Cleared | Current session cleared; all prior versions rejected | Rejected and cleared on next protected request | Keep |
| Push device cookie | Deleted | Not directly deleted from every browser; current response path is account API JSON | Does not itself authenticate | Verify current-browser cleanup UX and unconditional production `Secure`. |
| Server Push subscription/presence | Current device best-effort delete | All rows best-effort delete; session-version cleanup also exists | Stale session-version rows removed by runtime preparation | Keep as defense-in-depth; add failure observability. |
| Browser PushSubscription | Remains | Remains in each browser | Remains | Decide whether logout should unsubscribe locally or deliberately preserve permission while server authority is removed. Test the chosen behavior. |
| Pending-save queue | Remains | Remains | Remains | High-priority policy: prevent stale/private deltas from replaying across a future account boundary without silently losing unsaved work. |
| Local provider caches/device ID | Remain | Remain | Remain | Set retention and "clear local data" behavior. |
| Session caches/navigation traces | Remain until tab closes | Remain until tab closes | Remain until tab closes | Consider explicit purge on logout/session expiry for privacy. |
| Push-click IndexedDB | Remains until acknowledged/expired-on-read | Remains | Remains | Add explicit cleanup or document bounded retention and test it. |
| HTTP static cache/service worker registration | Remain | Remain | Remain | Expected; content versioning and worker rollback must prevent stale behavior. |

The present product is single-admin, which limits cross-account exposure today. The pending-save and identifier behavior is a blocker before public multi-user registration or shared-browser account switching.

## Failure matrix

| Failure | Current behavior | Risk | Objective acceptance |
|---|---|---|---|
| `localStorage` blocked | Pending queue tries `sessionStorage`, then in-memory fallback | Closing tab can lose an unacknowledged change; durable-protection error can make `saveData()` return false | Browser test proves clear user feedback and no false "saved" state. |
| Pending queue malformed | Candidate store initialization fails and tries next storage | Corrupt queue may be abandoned; user is not given a recovery/export path | Preserve malformed raw value for user-approved recovery or explicitly document safe discard after confirmation. |
| Queue belongs to stale session | Replayed over server data on later app load | Old private mutations can cross a future account boundary | Bind queue to a non-secret account/session epoch and provide conflict-safe review/discard behavior. |
| `sessionStorage` blocked | Most caches silently miss; pending queue may use memory | Reduced reliability/performance | Core tracker remains correct and user-visible save state is accurate. |
| IndexedDB unavailable | Push-click persistence fails inside notification click handler | Deep link/read acknowledgement may fail | Notification still opens safely; error is contained; in-app record remains. |
| Stale service worker | Registration requests no cache but an old worker may control an existing page until lifecycle advances | Old click/runtime contract can coexist with new app | Versioned protocol test across upgrade and rollback. |
| Browser permission denied | Push remains disabled; server row is removed when detected | None to in-app Notifications | Test safe message and persisted Notifications independence. |
| Browser/storage quota exceeded | Cache writes are mostly ignored; pending-save persistence fails | User mutation protection can fail | Dedicated quota failure test and explicit non-technical user recovery path. |
| Logout while saves pending | Session clears; queue remains | Unsent changes can later replay or be lost if manually cleared | Product decision plus automated test; never silently discard. |

## Consent and privacy conclusion

**Observed state:** application storage is first-party and used for authentication/security, synchronization reliability, UI/provider caches, installability, and optional Push. No optional analytics/advertising storage was found in committed source.

**Transition decision:** do not add a generic cookie-consent banner in this stabilization. Add one only if a later feature introduces non-essential storage and an applicable requirement is established. Privacy documentation must describe the actual inventory and retention behavior rather than claim that all storage is essential or anonymous.

This is an engineering inventory, not legal advice. Public or commercial deployment should obtain qualified review appropriate to its users and jurisdiction.

## Blockers carried forward

| Blocker | Destination |
|---|---|
| Pending-save queue survives logout/session/account boundaries | Phase 11 risk R-05 and later persistence implementation |
| Push device cookie `Secure` depends on proxy scheme | Phases 5, 9, 11 |
| Local device ID and browser PushSubscription retention are undecided | Notifications/browser lifecycle work |
| Session caches and push-click IndexedDB have no logout purge | Privacy/UX acceptance |
| Stale worker upgrade/rollback is untested | Phases 9 and 11 |
| Stale unused `DB_NAME`/`STORE_NAME`/`DATA_KEY` declarations imply nonexistent tracker IndexedDB | Frontend cleanup after behavior tests |
| Privacy text does not contain this detailed inventory/retention policy | Phase 10 |

## Phase 6 exit criteria

The repository inventory portion is complete. The full Phase 6 gate requires all of the following:

- each key/cookie/database/cache above has an approved owner, purpose, sensitivity, TTL, and cleanup trigger;
- logout, password change, session expiry, and future account-switch behavior are explicitly decided and browser-tested;
- pending saves cannot silently disappear or cross an account boundary;
- Push remains optional and in-app Notifications remain persisted when Push/browser storage fails;
- service-worker upgrade, stale-client, click acknowledgement, and rollback tests pass in supported browsers;
- production cache/cookie headers are observed through the real proxy;
- privacy/retention copy matches the implemented inventory;
- any consent decision is based on actual storage and qualified legal review where needed, not copied UI.

These remediation and browser criteria are open. The audit must not be represented as release acceptance.
