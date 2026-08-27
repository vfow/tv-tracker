# Phase 10 - Performance, Assets, Legal, and Documentation Audit

Status: partial; repository footprint and documentation drift recorded, measured performance and provenance review open

Evidence cutoff: 2026-08-19

Committed source audited: `75dc45f2d21c924533eb77f7653e425a8bb18bc9`

Comparison baseline: `d524c905c11101566c0493053e5414649ea6b105`

This is an engineering inventory, not legal advice. Licensing, attribution, privacy, terms, and public/commercial use require qualified review appropriate to the actual deployment and jurisdiction.

## Governing decisions

**Locked product requirement:** preserve responsive TV Tracker behavior, data safety, readable local typography, provider functionality, and required user-facing disclosures.

**Transition decision:** measure before optimizing, set explicit budgets from repeatable evidence, retain only assets with documented provenance/permission, and make generated assets reproducible from the approved Tailwind plus modular-vanilla source graph.

**Future option:** a CDN, image service, server cache, new font family, bundler, or frontend framework may be proposed separately. None is assumed for this stabilization.

## Repository footprint

These are Git blob sizes, not compressed transfer sizes, memory use, parse cost, paint time, or proof that every file is loaded by one route.

| Tracked path | Known-good `d524c905...` | Candidate `75dc45f...` | Delta | Audit note |
|---|---:|---:|---:|---|
| `static/js/` | 1,326,567 bytes | 1,387,142 bytes | +60,575 | Classic source remains mostly unminified and globally ordered. |
| `static/css/` | 417,422 bytes | 404,635 bytes | -12,787 | Candidate includes source/generated Tailwind plus Settings and feedback CSS. |
| `static/modern/` | absent | 87,714 bytes | +87,714 | Generated framework compatibility bundle conflicts with the architecture lock. |
| `static/assets/` | 2,662,307 bytes | 2,292,499 bytes | -369,808 | Delta is exactly the removal of five Graphik Trial binaries. |
| Combined listed paths | 4,406,296 bytes | 4,171,990 bytes | -234,306 | Lower total is driven by font removal; it does not prove faster application routes. |

Largest candidate files:

| File | Size | Disposition |
|---|---:|---|
| `static/assets/images/404.png` | 2,229,705 bytes | 97.26% of tracked `static/assets/`; optimize/replace only after visual comparison. |
| `static/js/app.js` | 567,223 bytes | Largest classic script and cross-domain owner; split by characterized domain rather than arbitrary chunks. |
| `static/js/ui.js` | 384,039 bytes | Second cross-domain renderer; route-level ownership/lazy loading requires regression proof. |
| `static/css/tailwind.css` | 205,696 bytes | Minified generated output; source/equality tests are red. |
| `static/css/tailwind-input.css` | 191,384 bytes | Handwritten source plus utility layers; contains unresolved Graphik references. |
| `static/js/notifications-runtime.js` | 88,830 bytes | Three consolidated IIFEs still contain overlapping ownership. |
| `static/modern/tvtracker-modern.js` | 87,714 bytes | Unapproved duplicate foundation/build output. |

`templates/index.html@75dc45f...` loads three stylesheets, preloads League Gothic WOFF2, executes 26 ordered classic scripts near the end of `body`, and then loads one module bundle. Body-end loading avoids blocking most HTML parsing, but every classic script still downloads, parses, and executes in sequence before later owners can initialize. No timing conclusion is possible from bytes alone.

## Existing performance controls

| Control | Evidence | Conclusion |
|---|---|---|
| Immutable versioned static caching | `tvtracker/infrastructure/static_assets.py`, `app.py:2860-2902`, cache tests | Correct SHA-versioned URL can cache for one year; absent/stale version revalidates. Strong source control, real proxy behavior unverified. |
| Private response no-store | `app.py:2860-2872` | Reduces private-data cache risk; expected repeat navigation cost should be measured. |
| Service worker does not intercept fetch | Push worker generated in `push_and_movies.py`; Phase 6 inventory | No hidden Cache API/offline bundle. This simplifies rollback but provides no offline performance layer. |
| Tailwind reproducibility check | CI runs `npm run build:css` and compares generated CSS | Good pattern; generated CSS assertions currently fail later in the suite. |
| Font preload | `templates/index.html:17` | WOFF2 critical display font is preloaded; actual use/paint and fallback shift are unmeasured. |
| Provider/browser TTL caches | `static/js/tmdb.js`, `app.js`, `provider-freshness.js`, `trending.js` | Reduces repeated provider requests; privacy/expiry behavior is inventoried in Phase 6. |
| Incremental synchronization | `app.py:3609-3827`, `static/js/db.js` | Revision/change-log protocol avoids unconditional full writes; payload/latency scale is unbenchmarked. |
| Bounded provider calls | TMDB and TVmaze transports, Phase 4 audit | Timeouts/retries/fallbacks exist on audited paths; production latency/rate behavior unknown. |

## Performance findings

### High - no repeatable browser baseline or budget exists

No Lighthouse report, Core Web Vitals capture, Playwright performance suite, route timing dataset, bundle budget, screenshot timing, or supported-device network/CPU profile is committed. There is no accepted threshold for regression. Source size and a smoke test cannot substitute for measurements.

Required baseline scenarios:

- authenticated cold start to Watching with representative production-shaped data;
- warm start and Back/Forward between Watching, Discover, Search, detail, History, Settings, and Notifications;
- direct show, episode, movie, person, collection, and invalid routes;
- large tracker/history/profile/provider payloads at an agreed upper-bound fixture;
- cold/warm provider cache, provider timeout/429/unavailable, and slow artwork;
- pending-save replay, sync conflict, backup export/import validation, and multi-tab refresh;
- Push disabled, denied, unavailable, and enabled service-worker startup;
- 320px mobile, representative mid-tier mobile CPU/network, tablet, and desktop;
- known-good SHA and final candidate under the same harness.

Record at minimum navigation/server timings, LCP, INP, CLS, total/route bytes by resource type, request count, long tasks, JavaScript parse/evaluation, memory trend across repeated navigation, database query count/time, API p50/p95, worker duration/freshness, and error/retry counts. Thresholds must be owner-approved after the baseline; this document does not invent them.

### High - active frontend work increased despite lower total assets

The candidate removed 369,808 bytes of Graphik binaries but added 60,575 bytes under classic `static/js/` and an 87,714-byte modern module. Therefore the aggregate repository shrank while executable frontend footprint grew. The modern path also duplicates API/error/feedback concepts and contradicts Phase 7/11 architecture.

Remove the conflicting source/dependencies/build/runtime path as one verified unit. Do not retain a dead generated bundle or build step merely to preserve a misleading size comparison.

### Medium - classic route code is eager and globally ordered

Watching startup loads Discover, collection, episode crew, provider freshness, Trending, Settings, Notifications, routing, and other domain code before the user opens those surfaces. `app.js` and `ui.js` together account for 951,262 raw bytes. Modular vanilla JavaScript permits route-level modules and dynamic import without introducing a framework, but extraction must follow Phase 7 ownership/data tests.

### Medium - the 404 image dominates local assets

`static/assets/images/404.png` is 2,229,705 bytes. It is loaded only on the error surface, so it does not prove normal-route regression, but it can make the failure path unnecessarily slow on constrained networks. Capture visual dimensions/quality, test modern lossless/lossy alternatives as supported, preserve the design, and verify cache/error behavior before replacement.

### Medium - generated CSS and source policy are unsettled

The candidate's generated Tailwind file is 205,696 bytes. No used-selector/coverage measurement establishes how much is needed on critical routes. Current source-contract failures mean the candidate cannot claim deterministic CSS acceptance. Optimize only after architecture cleanup and generated equality are green; do not weaken source assertions to hide an unreviewed output.

### Medium - server/database/worker capacity is unmeasured

No production-shaped load test, PostgreSQL query plan, connection-capacity test, lock-contention timing, migration duration, backup duration, worker batch/cadence timing, or host resource baseline is recorded. The application is private and single-admin, so high public concurrency is not an assumed requirement. Correctness under realistic data volume, multi-tab concurrency, and operational jobs still needs a measured ceiling.

### Unknown - compression and delivery topology

Repository source does not prove Brotli/gzip, HTTP version, proxy buffering, regional latency, image caching, connection reuse, or CDN behavior at AlwaysData. Observe production headers and transfer sizes without publishing the private host or credentials.

## Measurement and budget contract

The final performance record must include:

| Field | Required content |
|---|---|
| Release | Full known-good and candidate SHAs; timestamp; clean harness revision. |
| Environment | Browser/version, viewport, CPU/network profile, server/DB shape, cold/warm cache state. |
| Data | Synthetic/private-safe fixture scale and counts; no production payload committed. |
| Route/action | Exact URL family and user action sequence. |
| Metrics | Browser, network, server, DB, worker, and error measurements listed above. |
| Samples | Enough repeated runs to report stable median/p75/p95 as appropriate; outlier policy recorded. |
| Budget | Approved absolute threshold and allowed regression versus known-good for each critical scenario. |
| Result | Pass/fail with raw report artifact and explanation of material variance. |

Budget enforcement belongs in CI for deterministic asset/request-count checks and in a controlled performance job for timing metrics. A noisy single-run result must not become a release gate without a documented variance strategy.

## Asset inventory and provenance

| Asset group | Observed state | Provenance/license evidence | Required action |
|---|---|---|---|
| Graphik Trial fonts | Five binaries present at known-good are absent at candidate head | Filenames identified them as trial assets; no redistribution permission was recorded | Removal is directionally correct. Remove remaining source/generated family references and pass release tests without reintroducing binaries. |
| League Gothic | `league-gothic.regular.ttf` (35,664 bytes) and WOFF2 (14,972 bytes) are tracked and used | `docs/CREDITS.md` names the font; no tracked license/provenance file was found | Record source/version/author/license and retain the applicable license/notice after qualified verification. Do not assume a common font name proves this binary's provenance. |
| Local icons | SVG/PNG application/navigation/notification icons are tracked | No per-asset source/author/license manifest found | Record whether first-party, generated, or third-party and any required notice. |
| `404.png` | Large local design image | No source/author/license/optimization record found | Establish provenance and permitted use, then optimize with visual regression. |
| TMDB artwork/metadata | Requested at runtime rather than vendored | Provider use disclosed in docs | Verify API/image attribution and usage requirements against the actual product presentation. |
| JustWatch availability | Returned through TMDB | `docs/CREDITS.md` says powered by JustWatch | Determine required visible attribution placement and evidence it in supported routes. |
| TVmaze data | Optional timing enrichment | Credits state CC BY-SA; `docs/TVMAZE.md` documents technical role | Qualified review must confirm attribution/share-alike obligations for actual use and presentation. |
| Python/npm dependencies | Exact direct Python pins and npm lockfiles | Package metadata contains licenses, but no reviewed inventory/SBOM/notice is committed | Generate and review a release dependency/license inventory; resolve unknown/incompatible entries. |

No tracked root `LICENSE`, `COPYING`, `NOTICE`, OFL file, or equivalent project/asset license was found at candidate head. This does not by itself determine copyright status or permitted use. It means the repository does not provide an auditable grant/provenance record.

## Graphik release finding

The candidate removed all five tracked Graphik Trial binaries, totaling 369,808 bytes. However:

- `static/css/tailwind-input.css` still contains 14 Graphik text references;
- generated `static/css/tailwind.css` still contains a Graphik reference;
- `tests/test_phase20_repository_release.py:6` fails on the source reference;
- `docs/CREDITS.md` says Graphik Trial assets are excluded, which is true for binaries but incomplete for release-policy cleanup.

This audit makes no claim that a font-family string alone is a legal violation. It is a factual mismatch between the intended release policy/test, source, generated output, and fallback typography. Closure requires approved font stacks, rebuilt CSS, visual regression, and green release tests.

## Provider attribution and disclosure findings

`docs/CREDITS.md` contains TMDB, JustWatch, TVmaze, and font statements. `static/js/ui.js` renders selected outbound links labeled `TMDB` on detail surfaces. No Credits link or full provider attribution/disclaimer was found in committed app/login/error templates, and no runtime JustWatch or TVmaze attribution statement was found.

An outbound provider link is not automatically equivalent to whatever attribution a provider requires. The product owner must obtain qualified review of current provider terms/brand guidance, choose required visible placement, and test that it remains present and accessible on relevant desktop/mobile routes. Do not guess logo, wording, or placement from memory.

## Legal and policy document inventory

| Document | Current statement | Factual drift/gap | Engineering action, not legal conclusion |
|---|---|---|---|
| `docs/CREDITS.md` | Short TMDB disclaimer, JustWatch/TVmaze credit, font statement | Not linked in runtime UI; no asset/dependency provenance manifest; League Gothic evidence incomplete | Align with verified provider/asset requirements and expose approved accessible placement. |
| `docs/PRIVACY.md` | Database data plus cookie/local storage/IndexedDB/Cache API/service-worker/pending saves | Phase 6 found no Cache API use and materially more specific retention/logout behavior; controller/contact/retention/deletion context absent | Rewrite from Phase 6's implemented inventory after qualified review; do not claim Cache API use. |
| `docs/TERMS.md` | One paragraph about third-party variability/licensing | Too general to evidence operator, scope, acceptable use, warranty/liability, account/data, governing terms, or contact decisions | Product owner and qualified reviewer decide necessary scope; engineering ensures copy matches functionality. |
| `README.md` | Public safety, architecture, development, routes, deployment | Frontend/build graph and deploy secret names/behavior conflict with committed head; says deploy rebuilds CSS when workflow does not | Correct after architecture/deploy implementation; keep it concise and executable. |
| `docs/DEPLOYMENT.md` | Six-step summary; workflow is source of truth | Says serve `static/modern/`, has no exact-SHA/worker/rollback detail, and conflicts with lock | Replace with Phase 9 verified runbook after host evidence. |
| `docs/TVMAZE.md` | Sound provider hierarchy and feature flags | Refers to removed root `tvmaze_integration.py`; external worker cadence still unproved | Use canonical package paths and link to verified worker operations. |
| `ARCHITECTURE_MIGRATION.md` | Wave 1 package moves and compatibility shims | Describes the branch as a migration without the current architecture lock; root shims are already removed while a caller remains stale | Reconcile historical narrative with ledger and Phase 11; do not rewrite history as completed acceptance. |
| `PHASE_23_RELEASE_GATE.md` | Explicit owner authorization and no Phase 24 | Correctly says PR remains unmerged, but filename does not prove prior phase completion | Keep subordinate to the recovery ledger and objective Phase 1-11 gates. |

## Documentation governance target

| Topic | Permanent source of truth | Generated/secondary documentation rule |
|---|---|---|
| Current recovery/gate state | Recovery ledger plus live CI/GitHub evidence | Phase files preserve evidence; no later filename overrides an open gate. |
| Architecture lock | Phase 11 | README summarizes and links; implementation cannot silently redefine it. |
| Routes/API/data/backup | Executable server/browser contracts plus owned architecture docs | README lists stable public contracts; tests fail on drift. |
| Browser storage/privacy facts | Phase 6 inventory and implementation | Privacy copy must be reviewed against it after behavior changes. |
| Deployment/operations | Verified Phase 9 runbook and executable workflow | README links and lists exact names; workflow/document mismatch is tested. |
| Assets/providers/licenses | Reviewed asset/dependency manifest plus approved Credits | Build/release gate rejects unknown or prohibited binaries. |
| Performance | Repeatable harness reports and approved budgets | README may state command, not unmeasured claims. |

Each authoritative document needs an owner role, reviewed date, evidence SHA/environment, and event that requires re-review. Security/privacy/legal prose must not contain production secrets, private backup locations, or personal tracker data.

## Remediation order

1. Make the final source/build graph match the Phase 11 architecture lock and restore green generated-asset tests.
2. Remove remaining Graphik release-policy references, rebuild CSS, and verify typography visually/accessibly.
3. Establish provenance for League Gothic, local images/icons, project license status, dependencies, and providers with qualified review.
4. Capture known-good and candidate browser/server/DB/worker baselines using the same production-shaped harness.
5. Set and enforce owner-approved budgets; optimize only measured bottlenecks.
6. Optimize the 404 image and then route-level JavaScript/CSS loading with visual, accessibility, data, and route regression proof.
7. Add approved visible provider/Credits access and align Privacy/Terms with implemented behavior.
8. Reconcile README, deployment, TVmaze, and architecture documents after source/operations decisions are implemented.

## Blockers carried forward

| Blocker | Phase 11 destination |
|---|---|
| Framework/build drift and duplicate module | R-04/R-17 |
| Unresolved font provenance/references and provider attribution | R-10 |
| Missing accessibility/browser proof | R-09 |
| No performance/capacity baseline or budget | R-15 |
| Deployment documentation and executable workflow disagree | R-11/R-17 |
| Privacy/retention copy does not match Phase 6 inventory | R-05/R-10 |

## Phase 10 exit criteria

Phase 10 is complete only when:

- repeatable known-good/final-candidate browser, network, server, database, and worker baselines exist;
- critical-route absolute and regression budgets are owner-approved and enforced with a variance policy;
- measured bottlenecks are remediated without data, route, accessibility, or visual regressions;
- the approved modular-vanilla/Tailwind build is reproducible and generated equality is green;
- every distributed local asset and dependency has reviewed provenance/license/notice evidence;
- prohibited/unapproved assets and stale Graphik references are absent;
- qualified review resolves provider attribution placement and legal/policy document scope;
- approved Credits/provider disclosures are visible and accessible where required;
- Privacy accurately describes cookies, storage, retention, logout, Push, providers, and pending saves;
- README, deployment, TVmaze, architecture, workflow, and implementation facts agree;
- no private data, secret value, restricted backup, or unsupported legal claim is committed;
- the exact final candidate passes the full release suite.

The byte inventory and drift audit are complete. Performance, provenance, attribution, legal-review, and documentation-alignment gates remain open.
