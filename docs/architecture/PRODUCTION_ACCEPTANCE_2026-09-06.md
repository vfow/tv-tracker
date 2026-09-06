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

## Remaining roadmap

Sprint 3 still includes Browse, Genre, Collections, Person, and full-page Trending
composition, followed by proven-dead frontend cleanup. Fresh whole-system/torture,
mobile, complete authenticated production, documentation, and observability gates
remain outstanding. Registration remains closed.
