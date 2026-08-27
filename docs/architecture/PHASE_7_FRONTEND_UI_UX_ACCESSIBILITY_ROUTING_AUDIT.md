# Phase 7 - Frontend, UI, UX, Accessibility, and Routing Audit

Status: partial; source and route ownership mapped, full browser/accessibility acceptance open

Evidence cutoff: 2026-08-19

Committed source audited: `75dc45f2d21c924533eb77f7653e425a8bb18bc9`

## Architecture decision

**Locked product requirement:** preserve TV Tracker's existing product behavior, visual language, routes, user state, and accessibility while ownership is improved.

**Transition decision:** the stabilization frontend is Tailwind plus modular vanilla JavaScript and browser-native APIs. Migrate one domain at a time. One surface has one renderer and one route transition has one owner.

**Future option:** a framework or typed build system may be evaluated in a separate future proposal. Vue, Vite, and TypeScript are not part of this stabilization.

**Observed conflict:** committed head contains `frontend/`, Vue/Vite/TypeScript dependencies, `static/modern/tvtracker-modern.js`, a hidden mount root in `templates/index.html`, and related CI/deploy build steps. Those artifacts contradict the lock and are an unresolved blocker, not an accepted target.

## Current composition

At committed head, `templates/index.html:184-212` loads 26 ordered classic scripts and then one module bundle. The classic files are not `defer` modules; they share global scope and depend on body-end load order.

Tracked sizes at committed head:

- all `static/js/` source: 1,387,142 bytes;
- `static/js/app.js`: 567,223 bytes;
- `static/js/ui.js`: 384,039 bytes;
- `static/js/notifications-runtime.js`: 88,830 bytes;
- `static/modern/tvtracker-modern.js`: 87,714 bytes.

These are Git blob/on-disk sizes, not transfer or execution measurements.

## Frontend ownership map

| Domain/surface | Current owner(s) | State read/write | Target owner | Removal/acceptance condition |
|---|---|---|---|---|
| Global tracker/application state | `static/js/app.js`; globals consumed throughout | `DATA`, route/detail/search/discover/import/profile state | Explicit browser modules by domain; PostgreSQL-backed tracker client remains canonical | Every moved state transition has characterization tests; no copied second source of truth. |
| Rendering and UI controls | `static/js/ui.js` | Reads/writes global page/detail/filter/modal state and DOM | Domain renderers using shared primitives | One renderer per surface; keyboard/focus and visual parity pass. |
| Server sync/pending saves | `static/js/db.js`, `pending-save-store.js`, `save-storage-fallback.js` | PostgreSQL API, revisions, local/session storage queue | Dedicated persistence/sync module | Move late; pending-save, conflict, multi-tab, logout, and backup gates pass. |
| Routing | `static/js/app-router.js`, server allowlists in `app.py`, helpers in `app.js`; extra trending listener | URL/history, global active-page/detail/filter state | One router/parser/serializer | One `popstate` owner; direct/click/reload/Back/Forward matrix passes. |
| TMDB client/cache | `static/js/tmdb.js`; calls also in `app.js` | Provider requests and browser caches | Media API module behind server proxy | Adult policy, timeout/errors, cache and endpoint contract centralized. |
| Settings | `static/js/settings.js` plus legacy helpers/wrappers in `app.js`, `streaming-region.js`, `provider-freshness.js`, Notifications | Profile, auth API, notifications, streaming, backup, reset | `TVTrackerSettings` modular vanilla domain | All sections use one renderer and no later file replaces `renderSettings`. |
| Notifications/Push UI | Three IIFEs inside `static/js/notifications-runtime.js` plus Settings delegation | Notifications APIs, Push APIs, service worker, DOM, presence | One Notifications module; Push adapter subordinate | Remove duplicate settings implementations and historical aliases after Push-off/broken tests. |
| Feedback/errors | `static/js/feedback.js`; `showToast` compatibility bridge | In-memory queue and DOM | One shared feedback module | All callers use safe classification; bridge removed after caller migration. |
| Discover/browse/trending | `app.js`, `ui.js`, `discover-browse.js`, `discover-runtime.js`, `trending.js`, Adult Filter | Provider caches, route/filter/global state, DOM | Discover domain plus router integration | No renderer replacement or second `popstate`; all filter/query routes pass. |
| Streaming/provider freshness | `streaming-region.js`, `provider-freshness.js`, Settings | Profile region, local cache, synchronized provider metadata | Settings/Streaming plus provider cache service | No render/function wrappers; region invalidation/fallback tests pass. |
| Tracker integrity/removal | `data-integrity.js`, `tracker-integrity.js`, `tracker-removal.js` around legacy functions | User history/progress and storage keys | Tracker/persistence domain | Preserve Phase 3 invariants; remove wrappers only after replacement proof. |
| Episode tabs/crew | `episode-tabs.js`, `episode-crew.js`, `app.js`, `ui.js` | Detail DOM/provider results | Episode detail domain | MutationObservers removed after explicit render lifecycle exists. |
| CSS | `tailwind-input.css` -> generated `tailwind.css`, plus `settings-v2.css` and `feedback.css` | Global visual system | Tailwind source with explicit domain layers | Generated equality and responsive/a11y checks pass; no duplicate style owner. |

## Runtime ownership findings

### High - framework target conflicts with the architecture lock

The committed Vue/Vite/TypeScript compatibility bundle adds dependencies, a second build graph, a runtime mount, CI/deploy steps, and a second API/error/feedback foundation. It offers no accepted product requirement in this stabilization. Resolve all related source, generated output, lockfile, package scripts, workflow, template, tests, and documentation together; do not leave a dead bundle or split build contract.

### High - settings still has load-order wrappers

`static/js/settings.js:283-286` assigns `global.renderSettings`. `static/js/provider-freshness.js:425-436` and `static/js/streaming-region.js:704-728` replace/wrap that global. Correct behavior therefore depends on the script order in `templates/index.html`.

The target is explicit Settings extension points or service calls, not one file replacing another file's renderer.

### High - Notifications is physically consolidated but behavior remains layered

`static/js/notifications-runtime.js` contains:

- base Notifications UI and route API at lines 1-881;
- Push/service-worker/settings compatibility behavior at lines 883-1648;
- another canonical settings/repair layer at lines 1650-2008.

The file assigns notification-settings functions more than once and keeps old aliases such as `TVTrackerFinalNotifications`. Physical concatenation is not the same as one coherent owner. The red notification contract at `tests/test_notification_contract.py:33` confirms the consolidation gate is not closed.

### Medium - route events have more than one owner

`static/js/app-router.js:1276` registers `popstate` for the application router. `static/js/trending.js:422` registers another `popstate` handler and also intercepts route clicks. Trending additionally wraps `renderDiscoverHub` and `navigateToRouteFallback` at `trending.js:368-404`.

This can produce order-dependent or duplicate route work. Trending should supply route data/handlers to the canonical router rather than become another router.

### Medium - renderer/function replacement remains common

Examples with exact evidence:

- `tracker-integrity.js:76-117` wraps duplicate normalization and `getStoredData`;
- `discover-runtime.js:177` replaces `renderDiscoverHub`;
- `trending.js:368-404` wraps Discover and fallback navigation;
- `streaming-region.js:183-301` replaces provider request/render functions;
- `provider-freshness.js:298-358,425-450` replaces detail/open/Settings/save functions;
- `notifications-runtime.js:1914-1992` replaces notification navigation and Upcoming refresh behavior.

These layers are behavioral evidence. Do not delete them until each behavior has a named replacement and tests.

### Medium - observer/listener lifecycle is implicit

MutationObservers remain in `episode-tabs.js:62`, `episode-crew.js:136`, and `notifications-runtime.js:1498,1511`. Settings Streaming installs a document click listener every time its section binds at `settings.js:170-211`, with no teardown. The audit does not prove a user-visible leak, but repeated navigation can accumulate work.

## Route compatibility matrix

Server route admission is in `app.py:118-135`, `1828-2125`, and `2992-3253`. Browser parsing/canonicalization is in `static/js/app-router.js`. Route contracts are in `tests/test_route_contracts.py`, `tests/test_router.js`, and `tests/test_source_contracts.py`.

| Route family | Canonical examples | Static evidence | Current verification | Open browser gate |
|---|---|---|---|---|
| Lists | `/app/list/watching`, paused, completed, plan-to-watch, dropped | Server regex and router list maps | Python and Node route tests | Direct, refresh, Back/Forward, filters, scroll, and mobile on real browsers |
| Search | `/app/search?q=...&type=tv|movie|person|collection` | Server query canonicalizer and router parser | Query/route contract tests | Typing/history race, encoded queries, empty/invalid query, mobile keyboard |
| Upcoming/History | `/app/upcoming`, `/app/history` | Explicit server routes and router types | Source/router tests | Real data, restore scroll, notification timing, back navigation |
| Discover/category/browse | `/app/discover`, `/app/discover/<media>/<category>`, `/app/browse/<media>` | Server allowlist, router, browse serializer | Broad Node contracts | Remove second route owner; verify all filters/bookmarks/Back/Forward |
| Show/episode/movie | `/app/show/<id>-<slug>`, season/episode, `/app/movie/<id>-<slug>` | Server path regexes and browser canonicalizers | Route/source tests | Wrong/missing slug, missing TMDB entity, refresh, focus/scroll, offline/provider failure |
| Person/filter entities | person, genre, theme, network, company, provider, language, country, year, status, certification | Explicit server path regexes and router branches | Route/source tests | Full direct/new-tab/mobile/invalid-value matrix |
| Collections | `/app/collections`, `/app/collection/<id>-<slug>` with query filters | Server/query allowlist and router serializers | Source/router contracts | Large data, refresh/poll, scroll return, bad collection/provider outage |
| Profile/Settings | `/app/profile`, `/app/settings/<section>` | Explicit server routes; six Settings sections in router | Settings and router contract tests | Every section click/direct/reload/Back/Forward/login redirect/mobile |
| Notifications | `/app/notifications`; legacy `/app/notifications/settings` -> `/app/settings/notifications` | Server redirect and router legacy flag | Selected route tests | Consolidated renderer and Push states in real browsers |
| Invalid paths | explicit 404; no generic arbitrary SPA path | `valid_app_path`, fallback route, error template | Backend tests | Authenticated/anonymous 404, trailing slash, encoded path, stale bookmark |

`README.md:107-158` is a useful route inventory but does not replace executable server/router acceptance.

## Accessibility and UX findings

### Existing positive evidence

- global visible focus outlines are defined at `static/css/tailwind-input.css:63-70`;
- primary desktop/mobile navigation has an accessible label at `templates/index.html:27-52`;
- skeleton and feedback status regions use `role`, `aria-live`, or hidden decorative content;
- many icon buttons have `aria-label`, external links use `noopener noreferrer`, and dynamic provider text commonly passes through `escapeHTML`;
- reduced-motion rules exist for selected skeleton and notification animations in `tailwind-input.css`;
- mobile breakpoints, safe-area variables, coarse-pointer rules, and a 320px minimum are present in CSS.

These are source observations, not proof of end-to-end accessibility.

### High - no complete accessibility acceptance exists

No axe, Lighthouse accessibility, pa11y, or equivalent test exists. The Phase 12 browser test is a narrow smoke in `tests/test_phase12_safety_harness.py:276-347`; it does not cover all routes, screen readers, contrast, keyboard-only use, zoom, reduced motion, or responsive overflow. The final PR check is red.

### High - legacy modal semantics/focus are incomplete

`templates/index.html:150-181` defines popup and modal containers without `role="dialog"`, `aria-modal`, accessible dialog naming, or an explicit focus trap. The show-modal close button at line 169 is a multiplication character without an `aria-label`. Source includes Escape handlers for selected controls, but no repository-wide modal focus-return/trap contract was identified.

### Medium - Settings Streaming combobox is incomplete

`settings.js:163-211` uses `role="combobox"` and `role="listbox"`, but has no `aria-controls`, `aria-activedescendant`, option `aria-selected`, Arrow/Home/End keyboard navigation, or Escape handler. Selection is click-based. It must be tested and completed as one accessible combobox, not merely given ARIA roles.

### Medium - dynamic document/listener ownership can degrade UX

Repeated document listeners, MutationObservers, and full `innerHTML` rerenders can lose focus, announce excessive changes, or duplicate actions. `settings.js:257-264` replaces the complete Settings content on each render. Focus placement and return behavior are not specified for route transitions.

### Medium - visual/responsive behavior is unmeasured

CSS contains desktop/mobile rules, but no screenshot matrix, overflow test, Core Web Vitals, layout-shift measurement, or touch-target audit exists for current head. The 2.23 MB error image and large script/CSS payloads may affect slow/mobile devices, but no timing claim is made without measurement.

## Required real-browser acceptance

Run against a production-shaped test database with no private backup committed.

| Dimension | Required coverage |
|---|---|
| Browsers | Current Chrome/Edge, Firefox, Safari/macOS, and installed iOS Safari where Push/PWA behavior is in scope |
| Viewports | 320px, 375px, tablet portrait/landscape, common desktop, 200% zoom/reflow |
| Input | Keyboard only, mouse, touch, coarse pointer, browser Back/Forward |
| Assistive tech | At least VoiceOver/Safari and NVDA/Firefox or Chrome for critical flows |
| Preferences | Reduced motion, forced/high contrast where supported, dark color scheme |
| Routes | Every family in the matrix through click, direct URL, refresh, bookmark/new tab, Back, Forward, login redirect, invalid entity/path |
| UI states | Loading, empty, error, offline, slow image/API, long title/name, missing artwork, permission denied, session expiry |
| Dialogs/forms | Focus entry/trap/return, Escape, labels/errors, submit prevention, destructive confirmation |

Objective accessibility target: no Critical/Serious automated issue on critical pages, no keyboard trap, logical focus/order, correctly named controls/landmarks/status messages, text/UI contrast meeting the chosen WCAG 2.2 AA scope, and no loss of content/function at 200% zoom or 320 CSS pixels.

## Migration order

1. Keep the current visual language and Phase 3 data contracts fixed.
2. Remove the conflicting framework/build path as one verified unit; retain only modular browser-native foundations.
3. Make `app-router.js` the sole history/parser/serializer owner and migrate Trending/Discover route hooks into it.
4. Establish shared API/error/feedback primitives without a second renderer.
5. Consolidate Settings extensions so no later file replaces `renderSettings`.
6. Consolidate Notifications UI/runtime while preserving persisted-Notification-first behavior and Push failure isolation.
7. Move Discover, Search, detail, episode, profile, history, and provider surfaces one domain at a time.
8. Move tracker/persistence globals last, after pending-save/sync/browser tests exist.
9. Remove wrappers, observers, aliases, and compatibility globals only after callers and tests prove replacement.

## Blockers carried forward

| Blocker | Destination |
|---|---|
| Vue/Vite/TypeScript committed-head drift | Phase 11 risk R-04 and later cleanup |
| Red notification/startup/CSS tests | Phase 11 risk R-01 |
| Multiple route/render owners | Phase 11 risk R-13 |
| Missing full accessibility/browser matrix | Phase 11 risk R-09 |
| Pending-save storage/account behavior | Phase 6 and risk R-05 |
| No performance baseline | Phase 10 and risk R-15 |
| Provider attribution absent from UI | Phase 10 and risk R-10 |

## Phase 7 exit criteria

Phase 7 is complete only when:

- the owner map names one permanent owner and removal gate for every major surface;
- the frontend source/build path matches the modular vanilla JavaScript lock with no dormant framework graph;
- one router owns URL/history behavior and the complete route matrix passes;
- one renderer owns Settings, Notifications settings, Discover, and each migrated surface;
- all runtime wrappers/observers/listeners are either justified transition adapters with tests or removed;
- automated accessibility checks and the manual browser matrix meet the objective target;
- modal, combobox, focus, status, reduced-motion, contrast, touch, zoom, and responsive requirements pass;
- the full candidate test/build gate is green.

The static ownership audit is recorded, but the browser/accessibility and architecture criteria are open. Phase 7 remains partial.
