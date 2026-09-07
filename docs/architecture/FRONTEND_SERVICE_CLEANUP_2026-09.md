# Frontend service cleanup — September 2026

## Scope and baseline

Baseline: `b413996339c2cd50dbebad3e5dc3e1dd89acb37c` (PR #143).
This continues Sprint 3 after the first 80-function removal. PR #144 then removed
four of these 87 controls and merged as `2758af885c5b1ea4ff502fd690ee93283a26760c`;
this branch incorporates that main, leaving 83 additional functions to remove. The remaining
staged cleanup was recovered and reviewed against the current main commit.

This slice removes 87 disconnected app functions and three unconsumed transient
variables. No new screen, backend endpoint, schema, dependency or renderer is
introduced. Registration remains closed. Profile and Episode details are still
active legacy surfaces; this slice does not claim final frontend ownership closure.

## Reachability and behavior review

The TypeScript parser was used to identify top-level function declarations in
both revisions. After excluding the 87 removed declarations from the baseline,
none of their names occurs in the remaining app source. None occurs in the shipped
JavaScript, TypeScript, Vue components or templates after removal, including
string references and inline handlers. The removal regression now enforces this
for all 167 deleted functions across both cleanup slices.

All retained function bodies are unchanged apart from whitespace, except
`resetTrackerData`, which no longer clears the two deleted transient preview
variables. Its confirmation, replacement preparation, server transaction and
acknowledgement behavior remain unchanged. The third variable was the disconnected
metadata-sync runner flag. No persisted metadata or queue fields are deleted.

Removed clusters:

- compatible JSON/CSV preview/import and its inactive metadata hydration queue;
- superseded Show API/episode actor fetch wrappers;
- disconnected discovery pagination, collection fallback and genre helpers;
- unused schedule/display helpers, modal staging and old favorite reordering.

The current Data Settings surface invokes only the retained native JSON backup
export/import and HTML report services. It has no entry point to the removed
compatible import cluster. Native backups of previously imported shows continue
to preserve local IDs, imported metadata, regular/special watched records, movie
History, unknown old records, favorites, and metadata/network queue values under
the established native projection. Read-only compatibility inspectors exported
through `TVTrackerDataIntegrity` remain available. Native restore validation,
server `/api/backup/import`, durable acknowledgement and rejection handling remain.

## Verification

Local: all 83 pre-existing JavaScript regression files passed after recovery.
The new whole-app native backup regression checks supported schemas 1–5, malformed
and unsupported envelopes, old imported records, exact established projection,
server acknowledgement timing and rejected restore isolation. All 49 source
contracts and both final TVmaze contracts pass. TypeScript, Vite and Tailwind
builds pass and reproduce the committed assets with no generated diff.

The initial full CI run found a stale source assertion for the removed, uncalled
`isCaughtUp` helper. The contract now checks the native Watchlist loggability path
and canonical release-moment comparison, with the existing before/after-release
behavior regression retained.

Full PostgreSQL/Chrome regression and dependency security gates must run on the
exact PR head in CI before merge. The local runtime has no Flask/psycopg, PostgreSQL
or Chrome. Do not count unavailable local integration/browser tests as passed.
Deployment and authenticated production acceptance are separate release gates.

## Remaining ownership work

The surface owners recorded by the preceding migration documents are preserved:
Settings, Shared UI, Routing, Search, Discover and its listings, Show/Movie Details,
Upcoming, Watchlist and History. Their typed bridges still consume required
tracker, persistence, provider and routing services. Live Profile/Episode rendering,
remaining global function classification, full responsive acceptance, whole-system
audit/torture testing and final production/observability acceptance remain open.

## Removed functions

| Source | Removed function |
| --- | --- |
| `static/js/app.js` | `cleanProviderHTML` |
| `static/js/app.js` | `removeSpecialOnlyProgress` |
| `static/js/app.js` | `remapQueueIds` |
| `static/js/app.js` | `prepareModalForOpen` |
| `static/js/app.js` | `revealPreparedModal` |
| `static/js/app.js` | `queueCompatibleMetadataSync` |
| `static/js/app.js` | `getMetadataSyncSummary` |
| `static/js/app.js` | `startMetadataSync` |
| `static/js/app.js` | `pauseMetadataSync` |
| `static/js/app.js` | `continueMetadataSync` |
| `static/js/app.js` | `retryMetadataSyncFailures` |
| `static/js/app.js` | `processMetadataSyncQueue` |
| `static/js/app.js` | `hydrateOneMetadataSyncShow` |
| `static/js/app.js` | `applyTMDBDetailsToImportedShow` |
| `static/js/app.js` | `moveShowStorageKey` |
| `static/js/app.js` | `tmdbGetExternalIds` |
| `static/js/app.js` | `normalizeTMDBEpisodeActors` |
| `static/js/app.js` | `showHasV2APIDetails` |
| `static/js/app.js` | `ensureShowV2APIDetails` |
| `static/js/app.js` | `refreshOpenShowV2Details` |
| `static/js/app.js` | `ensureEpisodeActorCredits` |
| `static/js/app.js` | `refreshOpenEpisodeActors` |
| `static/js/app.js` | `isShowActuallyEnded` |
| `static/js/app.js` | `getLocalDateKey` |
| `static/js/app.js` | `tmdbGetDiscoverList` |
| `static/js/app.js` | `getCollectionPosterPaths` |
| `static/js/app.js` | `runCollectionsLiveFallbackSearch` |
| `static/js/app.js` | `normalizeDiscoverHubShow` |
| `static/js/app.js` | `getDiscoverSectionRequestConfig` |
| `static/js/app.js` | `loadMoreDiscoverSection` |
| `static/js/app.js` | `parseRouteKey` |
| `static/js/app.js` | `getGenreMediaSwitchRoute` |
| `static/js/app.js` | `getLibraryListRoute` |
| `static/js/app.js` | `hasEyeFilterOptions` |
| `static/js/app.js` | `getPersonRoleDisplayLabel` |
| `static/js/app.js` | `getGenreSortLabel` |
| `static/js/app.js` | `readTMDBTVGenreCache` |
| `static/js/app.js` | `writeTMDBTVGenreCache` |
| `static/js/app.js` | `resolveTVGenreFromSlug` |
| `static/js/app.js` | `getGenreDiscoverSort` |
| `static/js/app.js` | `openShowModal` |
| `static/js/app.js` | `isCaughtUp` |
| `static/js/app.js` | `getEpisodeTitle` |
| `static/js/app.js` | `getEpisodeExactTimestamp` |
| `static/js/app.js` | `getPersonalScheduleEpisode` |
| `static/js/app.js` | `hasNewAiredEpisodeAfterCompleted` |
| `static/js/app.js` | `getCountdownText` |
| `static/js/app.js` | `saveFavoriteMoviesOrder` |
| `static/js/app.js` | `moveFavoriteShow` |
| `static/js/app.js` | `reorderFavoriteShows` |
| `static/js/app.js` | `getLastCompatibleImportPreview` |
| `static/js/app.js` | `getLastCompatibleCSVPreview` |
| `static/js/app.js` | `previewCompatibleBackupCSV` |
| `static/js/app.js` | `analyzeCompatibleCSVBackup` |
| `static/js/app.js` | `parseCSVTable` |
| `static/js/app.js` | `parseCSVRows` |
| `static/js/app.js` | `normalizeCSVHeader` |
| `static/js/app.js` | `detectCompatibleCSVType` |
| `static/js/app.js` | `csvValue` |
| `static/js/app.js` | `parseCompatibleCSVBoolean` |
| `static/js/app.js` | `getCompatibleCSVSeriesKey` |
| `static/js/app.js` | `getCompatibleCSVEpisodeSeriesKey` |
| `static/js/app.js` | `estimateCompatibleMappedStatusFromCSV` |
| `static/js/app.js` | `previewCompatibleBackupJSON` |
| `static/js/app.js` | `analyzeCompatibleJSONBackup` |
| `static/js/app.js` | `getCompatibleShowsArray` |
| `static/js/app.js` | `analyzeCompatibleShowEpisodes` |
| `static/js/app.js` | `estimateCompatibleMappedStatus` |
| `static/js/app.js` | `getAppStatusFromCompatibleMappedStatus` |
| `static/js/app.js` | `importCompatibleBackupJSON` |
| `static/js/app.js` | `buildDataFromCompatibleJSON` |
| `static/js/app.js` | `hydrateCompatibleImportScheduleData` |
| `static/js/app.js` | `getCompatibleImportHydrationSeasons` |
| `static/js/app.js` | `getImportedNextUnwatchedRegularEpisode` |
| `static/js/app.js` | `applyCompatibleImportStatusRefresh` |
| `static/js/app.js` | `resolveCompatibleTMDBDetails` |
| `static/js/app.js` | `findTMDBTVDetailsByExternalId` |
| `static/js/app.js` | `findTMDBTVDetailsByTitle` |
| `static/js/app.js` | `createAppShowFromCompatibleShow` |
| `static/js/app.js` | `importCompatibleEpisodesIntoShow` |
| `static/js/app.js` | `reapplyImportedWatchedProgress` |
| `static/js/app.js` | `getCompatibleShowIds` |
| `static/js/app.js` | `getCompatibleLocalShowId` |
| `static/js/app.js` | `getCompatibleWatchedAt` |
| `static/js/app.js` | `createCompatibleHistoryId` |
| `static/js/app.js` | `makeImportedCompletedAt` |
| `static/js/app.js` | `cleanCompatibleSearchTitle` |
