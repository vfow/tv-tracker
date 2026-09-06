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

## Remaining roadmap

Sprint 3 still includes Browse, Genre, Collections index, and Person composition;
Collection Details is the next native slice under verification. Full-page
Trending is now native. Proven-dead frontend cleanup, fresh whole-system/torture,
mobile, complete authenticated production, documentation, and observability gates
remain outstanding. Registration remains closed.
