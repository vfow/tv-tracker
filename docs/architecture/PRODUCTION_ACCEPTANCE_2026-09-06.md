# Production acceptance continuation — 2026-09-06

Production: https://broghgf7.alwaysdata.net/

## Verified baseline

PR #134 merged as `ae0bc95b106cecec669235e793b074b454805d13`.
Its exact PR head passed 458 Python tests, all 76 JavaScript regression files,
dependency audits, and reproducible Vue/Tailwind builds. Deployment repeated the
full suite, deployed successfully, restarted AlwaysData, and passed the health
check requiring the merged SHA.

Secure browser sign-in succeeded. The live Discover hub rendered with the Vue
owner marker, finished loading, and displayed its TV/movie, Trending, Collections,
and Genres sections. These checks do not establish final responsive or whole-app
acceptance.

## Save failure found during acceptance

Without a deliberate tracker edit, the browser repeatedly reported an unsaved
operation rejected with `Movie tracking record contains unsupported fields`.
The stack includes the existing adult-classification enrichment and queued-save
retry paths.

The frontend already adds TMDB's explicit boolean `adult` classification to
tracked/favorite movie records. Backend movie validation omitted this field from
its allowlist, rejecting enriched movie saves. Favorite validation also silently
dropped this field, losing classification across synchronization and restore.

The repair accepts and preserves only boolean classification values in movie and
favorite records. Missing values remain unknown; unrelated movie fields and
invalid classification types remain rejected. Watched/plan/favorite intent,
timestamps, History, and the existing queued-save recovery remain intact. No
schema migration or manual production tracker-data rewrite is required.

Regression coverage exercises sync acceptance for true and false, missing values,
invalid types, unknown fields, inactive records, and native backup round trips.
Local pure validation checks use a stub only for the unavailable database import;
full exact-head CI must run with real dependencies before merge. Live retry
recovery must be verified after deployment.

PR #135 passed exact-head full CI and merged as
`b769c7afb345681efa92a8cb8850ddf100d97c22`. Deployment repeated the suite,
restarted successfully, and passed the merged-SHA health check. A fresh
authenticated Discover load subsequently completed without the recurring movie
save rejection in the browser error log. No deliberate tracker edit was needed.

Discover genre tabs, opening a show from the hub, its Back button, and browser
Back/Forward passed live checks. At the observed 1363px viewport, the document
had no horizontal overflow. This is not the final 320px/375px/mobile matrix.

## Collections repair and Trending release

PR #137 fixed the shared urllib timeout forwarding error. Its head passed all
465 Python tests and the JavaScript suite, and merged as
`10695aaa0f0e076047218043ae493b62b79dceb3`. Deployment, restart, and the required
SHA health check passed. Reloading the previously failing Dark Knight collection
then displayed its three movie cards and filter controls on production.

PR #136 incorporated that verified main and passed full CI again. It merged as
`493f5b52ad7afbad11366315c36e6cfecf2e36b5`; deployment, restart, and public health
checks passed. Live Trending Movies Today displayed the Vue owner marker and
20 cards after navigating from Discover.

PR #138 passed 467 Python tests (including the real Chrome Collection Details
fixture), all 78 JavaScript files, and build/security gates. It merged as
`81e5cffccb364504c9472fdc7cb5fb43b3483627`; deployment completed successfully.
The live Dark Knight collection displayed the Vue owner marker and three cards.
Selecting Release Date — Oldest changed the URL to `?sort=date-asc` and ordered
Batman Begins, The Dark Knight, then The Dark Knight Rises.
Opening Batman Begins and using Back returned to the same `?sort=date-asc` route
and the same three-card order.

On September 7, PR #139 passed its exact-head CI and merged as
`dd3733c762756d33107c427a16d439f77d5a0f7a`. Its deployment workflow completed
successfully. Live index acceptance is tracked separately from those gates.

## Remaining roadmap

Sprint 3 still includes Browse and Genre/discovery listing composition; Person
is the next native slice under verification. Collections index, Collection
Details, and full-page Trending are now native. Proven-dead frontend cleanup, fresh whole-system/torture,
mobile, complete authenticated production, documentation, and observability gates
remain outstanding. Registration remains closed.


## September 7 — Movie panel visibility regression

Live Dark Knight Cast tab contained Christian Bale, Heath Ledger and the remaining
credits in the DOM, but its ancestor `.v2-show-info-section` computed to
`display:none`. The same inherited rule hid the native Synopsis, Crew, Details,
Genres and Releases panels. A scoped movie-panel CSS rule restores their display
while retaining the old rule for other consumers. The new Chrome fixture loads
the committed CSS and Vue bundle and checks rendered geometry, selected tabs,
all six panel contents, and actor/director routes. Exact-head CI and live acceptance
are required before closing this finding.

Person PR #140 merged as `74cc8cf55114bb199bf622f4df1747c770762581`.
CI `34099185970` and deployment `34099443558` passed, including restart and
SHA-aware public health. Collections index live search, detail navigation and Back
restored `/app/collections?q=Dark%20Knight` with its two matches.


## September 7 — Movie fix and Browse release verified

PR #141 merged as `778d4e99b0fd52980171014e12bda1a1bc7f49c5`.
CI `34100315105` and deploy `34100536461` passed. Live Dark Knight Cast showed
Christian Bale/Bruce Wayne and the other actors visibly; Crew showed Christopher
Nolan/Director. The director link opened native Person details, and switching to
TV removed the unsupported Director filter and preserved the canonical TV URL.
This closes the movie-panel visibility finding above.

PR #142 passed CI `34101242078` (471 Python tests, 81 JavaScript files, real Chrome
fixtures, build and dependency gates) and merged as
`80c73bc81773176002f2dd91f6540e22ea219570`. Deploy `34127601487`, job
`101759853463`, passed full regressions, provenance, deployment, restart and
merged-SHA public health. The live Browse Movies page rendered results with
`runtime=150-179`. Searching countries for `uk` exposed United Kingdom; selecting
it retained runtime and added `country=gb`. Inception opened from those results;
its Back button restored the exact filtered Browse URL and visible heading.

Remaining: final ownership classification/removal, fresh whole-system audit and
additional torture exercises, formal responsive acceptance, full authenticated
production acceptance, documentation and observability release gates. The earlier
roadmap notes are historical progress entries, not current completion claims.
