# Phase 4 — API and External-Service Audit

Status: complete audit map and first bounded hardening changes for the stabilization branch

Baseline main SHA: `d524c905c11101566c0493053e5414649ea6b105`

Audit branch: `architecture-futureproof-2026-08-18`

Date: 2026-08-18

This phase treats TMDB, TVmaze, Web Push, browser Push APIs, and watch-provider data as external or optional boundaries. The governing rule is:

> External failure -> use an owned fallback when one exists -> stay silent when the user cannot act -> show a safe product message only when the failure has visible impact.

Provider state must never redefine tracker identity or corrupt user-owned tracker/history/profile data.

## Phase 4 invariants

1. TMDB ID remains the canonical media identity.
2. TVmaze is optional timing enrichment only. Removing its cache must not remove or alter a tracked show.
3. Push is an optional delivery channel. In-app Notifications remain the primary notification record and must work when Push is disabled, misconfigured, unavailable, or failing.
4. VAPID private material, dependency state, crypto/config diagnostics, raw provider exceptions, and server environment details are server-only.
5. Adult Filter hides titles classified by TMDB as adult; it never deletes tracked data.
6. Provider caches are rebuildable infrastructure data, not backup/tracker truth.
7. External requests are bounded by explicit timeouts and must not create unbounded retry storms.
8. Watch-provider data is third-party availability data and requires the attribution demanded by TMDB/JustWatch before this branch is production-ready.

## TMDB boundary

### Current ownership

The application currently reaches TMDB through several transitional paths:

- authenticated browser proxy: `/api/tmdb/<path:tmdb_path>` in `app.py`;
- server-side TMDB fetch helpers used by media refresh and notification work;
- `/api/watch-availability`, which reads TMDB watch-provider data and applies application/provider caching;
- frontend search/discover/detail/list code that consumes the authenticated proxy;
- release timing fallback through TMDB-owned dates.

The proxy fixes the upstream host to `api.themoviedb.org`, removes any caller-supplied `api_key`, injects the server key, validates the path characters, and requires the TV Tracker authenticated session. This substantially limits SSRF and secret-forwarding risk.

### Remaining proxy risk

The current proxy path is broad rather than an explicit endpoint allowlist. An authenticated TV Tracker session can ask the server to call more TMDB v3 paths than the product currently needs. This is not an SSRF primitive because the host is fixed, and the application is currently a singleton private-login product, but it is broader authority than the final architecture should expose.

Target during backend API extraction:

- define an explicit route/purpose contract for search, discover, details, credits, images, recommendations, reviews, watch providers, genres/configuration, external IDs, and release-date data actually consumed by TV Tracker;
- reject unsupported TMDB namespaces before the upstream request;
- keep the key server-only;
- keep timeout/error handling centralized;
- add endpoint-level cache policy instead of allowing each caller to invent one.

Do not introduce this allowlist by guessing while the legacy frontend still has many call sites. First characterize every live path, then lock the list with tests.

### Adult classification contract

TMDB's current official API reference exposes `include_adult` on both movie and TV search, and on both movie and TV discover. The branch's `static/js/adult-filter.js` therefore uses the same request control for those four contracts.

Request filtering is not sufficient by itself. Cached results, already-loaded lists, and tracked records can still contain objects whose `adult` flag is true. The central policy also filters result objects at the display/list boundary. This is deliberately hide-only: it never mutates or removes the source object.

Current required semantics:

- missing profile preference => Adult Filter ON;
- `adult_filter !== false` => hide `item.adult === true`;
- filter OFF => do not hide on this policy;
- search/discover calls request `include_adult=false` while ON;
- search/discover calls may request `include_adult=true` while OFF;
- stale cached payloads are post-filtered while ON;
- changing the setting clears known adult-sensitive search/discover/collection session caches;
- tracked adult titles remain stored and become visible again if the filter is turned OFF.

Phase 4 adds a Node regression contract proving default-ON and hide-not-delete behavior.

### Movie activity artwork contract

The approved data source for alternate movie scene artwork is TMDB's movie-images endpoint: `/movie/{movie_id}/images`. That endpoint returns movie backdrops/posters/logos and is the correct source for selecting a backdrop other than the title's primary hero backdrop.

Implementation contract for the later media-row migration:

1. keep TV episode rows on the episode still path;
2. for a movie row, request/cached-read movie images only when alternate artwork is needed;
3. exclude the movie's canonical/primary `backdrop_path` from alternate candidates;
4. select deterministically, never randomly;
5. stable ranking should prefer a usable landscape backdrop, then stable TMDB quality/vote metadata, with `file_path` as a deterministic tie-breaker;
6. if no suitable alternate exists, use the movie poster, not the primary backdrop again;
7. cache the chosen result by TMDB movie ID and image-payload freshness so repeated row renders do not cause request storms;
8. image enrichment failure is silent and falls back to the poster.

This phase does not bolt image fetching into every legacy renderer. The canonical helper belongs in the later media-row owner so one request/cache policy feeds all movie activity/list rows.

## Watch-provider / JustWatch boundary

TV Tracker uses TMDB watch-provider endpoints for movie/TV streaming availability. TMDB's current watch-provider reference states that this data is powered by JustWatch and requires JustWatch attribution.

Consequences:

- provider availability is enrichment, never tracker truth;
- a provider outage/cache miss must not affect watch history, statuses, favorites, notes, or media identity;
- streaming-region changes may invalidate/rebuild provider caches without rewriting tracker data;
- visible JustWatch attribution is a production requirement anywhere TV Tracker displays this watch-provider data;
- the attribution/UI placement is tracked into the legal/licensing phase and is release-blocking before the stabilization branch can merge to production if watch-provider data remains visible.

## TVmaze boundary

### Role

`tvtracker/integrations/tvmaze.py` is the canonical optional-provider module. The root `tvmaze_integration.py` is a compatibility shim.

TVmaze is allowed to improve TV release timing only. It is not allowed to own:

- canonical title/description/artwork/rating;
- tracker identity;
- routing identity;
- watched/history/favorite/status data;
- backup truth.

Mapping starts from a canonical TMDB show and validates external IDs before accepting a TVmaze ID. Provider mapping/episode results are stored in separate `tv_tracker_tvmaze_*` cache tables.

### Network behavior

The current provider has explicit bounded transport behavior:

- request timeout: 4 seconds;
- retry budget: at most 2 retries after the first request;
- HTTP 404: treated as no provider result;
- HTTP 429: retried with bounded `Retry-After` handling;
- retry delay is capped at 4 seconds;
- duplicate in-flight requests for the same URL are coalesced;
- successful/negative provider results use separate TTLs;
- network/parse/other HTTP failures become a generic provider `RuntimeError`, not a browser-facing technical error.

TVmaze's official API documentation asks clients to back off and retry after HTTP 429 and documents a baseline rate limit of at least 20 calls per 10 seconds per IP. The current bounded 429 handling is therefore aligned with the provider contract without creating an unbounded retry loop.

Other transport errors intentionally fail into TV Tracker's provider-neutral fallback rather than retrying every 4xx/5xx/network condition. This is conservative and limits provider request amplification. Revisit only if production evidence shows transient non-429 failures materially hurt timing quality.

### Release timing fallback

`tvtracker/release_timing/service.py` owns the product decision. `ReleaseTimingResolver` catches the expected provider timeout/connection/OS/runtime/value/database failures and returns TMDB date fallback when a valid TMDB air date exists.

The public contract stays provider-neutral:

- `exact|date` precision;
- `verified|fallback` confidence;
- `providerUsed` boolean;
- no TVmaze ID becomes the show's public identity.

Phase 4 adds a regression test proving a TVmaze timeout cannot prevent TMDB fallback.

## Push / VAPID boundary

### Current architecture

Push subscriptions are stored per device/browser and tied to the current admin `session_version`. Logout removes the current device subscription. Credential changes remove all subscriptions. Presence records suppress OS Push delivery to recently active clients. Notification records are created independently of Push delivery and Push delivery uses an outbox/retry path.

This correctly implements the core product law:

> Push can improve Notifications. Notifications must never depend on Push.

### Technical diagnostics leak fixed in Phase 4

The underlying server config intentionally keeps internal fields such as:

- `dependencyAvailable`;
- VAPID validation code/error;
- private key/subject;
- key-configuration details.

Those fields are useful for logs/admin diagnosis but are not useful to a normal user. The legacy `/api/push/config` response exposed `dependencyAvailable`, and `/api/push/subscribe` could return raw validation/runtime text such as a session-version or endpoint validation error.

Phase 4 now adds a browser-response sanitation boundary in `tvtracker/notifications/push_validation.py`:

- `/api/push/config` exposes only `ok`, `configured`, `publicKey`, and `unavailable`;
- public key is returned only when Push is actually configured;
- dependency/validation/private/subject diagnostics stay server-side;
- the Push subscribe route's own 400 failures become `TV Tracker couldn’t enable Push on this device. Try again later.` with the safe code `push_enable_failed`;
- authentication/CSRF response behavior is not replaced;
- sanitation is implemented as an `after_request` boundary because WSGI installs Push validation before the final Push routes are registered.

The last point is important: endpoint wrapping would silently fail under the current transitional registration order. The path-based response boundary is deliberately order-safe until notification ownership is consolidated.

### Push delivery failure behavior

The delivery worker:

- does nothing when Push is unconfigured;
- does not stop notification creation when Push fails;
- retries failed deliveries with a bounded attempt count/backoff;
- removes dead subscriptions on HTTP 404/410;
- suppresses delivery to recently active devices;
- persists delivery failure state separately from notification state.

Technical delivery errors remain operational data/logging, not user-facing popups.

## Browser service-worker boundary

The service worker is served from `/service-worker.js` with scope `/` and no-store/no-cache semantics. It receives notification payloads, opens/navigates to the product route, and stores pending notification-click acknowledgements in a dedicated IndexedDB database until the app consumes them.

This storage is operational/necessary Push state. It is not analytics/tracking consent data. Phase 9 will include it in the complete browser-storage inventory and logout/retention audit.

## Failure matrix

| Boundary | Failure | Product behavior | User message |
|---|---|---|---|
| TMDB search/discover | request fails | current surface may fail/retain existing content | safe shared load error only if visible impact |
| TMDB image enrichment | request fails | poster/current safe fallback | silent |
| TMDB watch providers | request fails/cache unavailable | provider availability unavailable; tracker unchanged | only if streaming surface visibly cannot load |
| TVmaze | timeout/429/external failure | TMDB timing fallback | silent unless timing surface itself cannot resolve |
| TVmaze mapping | conflict/no match | no provider authority; TMDB remains canonical | silent |
| Push config | missing/invalid/dependency unavailable | in-app Notifications continue | `Push notifications are temporarily unavailable.` when user attempts Push |
| Push subscribe | server/device failure | setting/Notifications remain usable | `TV Tracker couldn’t enable Push on this device. Try again later.` |
| Browser permission blocked | browser denies permanently | Push remains OFF | `Push notifications are blocked in your browser settings.` |
| Browser permission not granted | permission prompt not granted | Push remains OFF | `Push permission wasn’t granted.` |
| Push delivery | endpoint/transient provider failure | notification remains in-app; outbox retries or subscription is removed if dead | silent |

## Risk register from Phase 4

### High — watch-provider attribution must be visible before production merge

The product consumes TMDB watch-provider data backed by JustWatch. The provider contract requires attribution. Phase 12 owns the final placement/copy audit, but this remains a release blocker, not optional polish.

### Medium — TMDB proxy authority is broader than final need

The host/key handling is constrained, but path authority should become an explicit allowlist after every current caller is characterized. Do not tighten it prematurely and accidentally break media/search routes.

### Medium — external-call policy is still split across legacy backend owners

TMDB calls exist in `app.py`, Notifications, and browser proxy flows with different timeout/cache/error behavior. Final architecture should centralize transport, endpoint contracts, safe errors, and cache policy without changing tracker semantics.

### Medium — movie alternate artwork is not yet one canonical owner

The API source and deterministic/cache contract are now fixed, but actual row migration belongs to the later media-owner wave. Do not add per-screen image requests meanwhile.

### Low/controlled — TVmaze is intentionally not retried for every failure

The provider retries rate limiting but generally falls back quickly for other failures. This favors reliability and request containment over maximum enrichment availability. Current fallback coverage makes this acceptable.

### Low/controlled — Push diagnostics still exist internally

This is intentional. Server-side validation codes are useful for operations. Regression coverage now protects the browser boundary from those fields.

## Tests added in Phase 4

`tests/test_phase4_external_services.py` characterizes:

- TVmaze timeout -> TMDB date fallback;
- HTTP 429 -> bounded Retry-After retry and recovery;
- browser Push config strips technical/private diagnostics;
- Push subscribe failures expose only the safe product error;
- server Push config keeps diagnostics internally.

`tests/test_phase4_adult_policy.js` characterizes:

- Adult Filter defaults ON;
- movie/TV request parameters follow the preference;
- `adult === true` is hidden while ON;
- filtering does not delete or rewrite the source record/payload.

## Phase 4 exit conditions

Phase 4 can be considered complete when:

- the new contracts pass in CI;
- the pre-existing branch full-suite failure is identified and fixed rather than ignored;
- Push normal-user responses contain no technical VAPID/dependency diagnostics;
- provider failure tests prove TMDB fallback/Push independence;
- the audit artifact remains in the branch;
- no merge is performed until later phases satisfy the JustWatch attribution and other release-blocking findings.

## Official contract references reviewed

- TMDB Search Movie: `https://developer.themoviedb.org/reference/search-movie`
- TMDB Search TV: `https://developer.themoviedb.org/reference/search-tv`
- TMDB Discover Movie: `https://developer.themoviedb.org/reference/discover-movie`
- TMDB Discover TV: `https://developer.themoviedb.org/reference/discover-tv`
- TMDB Movie Images: `https://developer.themoviedb.org/reference/movie-images`
- TMDB Movie Watch Providers: `https://developer.themoviedb.org/reference/movie-watch-providers`
- TMDB TV Watch Providers: `https://developer.themoviedb.org/reference/tv-series-watch-providers`
- TVmaze API / Rate Limiting: `https://www.tvmaze.com/api`
