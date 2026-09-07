# Frontend ownership cleanup — September 2026

## Scope and evidence

Baseline: PR #142 merge `80c73bc81773176002f2dd91f6540e22ea219570`.
The Discover hub, Trending, Collections index/detail, Person, Browse, Genre and
discovery listings now compose native Vue models. Show/Movie Details, Upcoming,
Watchlist, History, Settings and Search already have their native owners.

This slice removes 80 disconnected top-level functions. A conservative reference
graph parsed the app/ui function declarations, rooted names referenced by other
runtime source/templates and top-level initialization, and followed references
inside function bodies. String references were included to retain inline handlers.
Each selected cluster was reviewed against its replacement. A regression scans
all runtime source/templates for every deleted name, so stale callers cannot hide
behind an unexercised route. Existing behavior and browser tests remain release gates.

The old Discover preview modal is a closed cluster: `openDiscoverShowModal` already
opens `openShowDetailsPage`, whose renderer is Vue. Its season loaders and add/log
callbacks no longer have an entry point. The live episode logging services retain
auto-completion; `discoverPreviewShow` remains because Episode details still uses it.

Unused legacy Show info/cast/facts, skeleton, favorite, placeholder and company
composers have native equivalents. The obsolete Settings metadata/import-preview
HTML composers have no current Settings caller. Native backup import/export and
server validation remain unchanged. No database or persisted record is rewritten.

## Remaining legitimate boundaries and outstanding audit

- `app.js`: tracker/History mutations, durable save orchestration, metadata/provider
  requests and caches, canonical route data, discovery/filter state, import/export,
  Profile actions, and live Episode actions.
- `ui.js`: shared escaping, safe external URLs, route/display/catalog helpers,
  retained detail interaction binders, Profile home/stats/favorites, image cropping,
  and the active Episode details renderer.
- `app-router.js`: sole browser History API writer; Vue Routing delegates navigation
  to this established service. No new navigation writer is introduced.
- Typed bridges remain explicit model/action boundaries to these services. This
  cleanup does not create another renderer or remove services consumed by Vue.

The repository-wide audit is still open. The conservative scan also identified
additional app service candidates, including disconnected compatible import and
metadata-sync paths; they require separate compatibility review. Profile and
Episode details remain active legacy surfaces and must not be described as Vue
pages or deleted as dead code. Episode watched interactions have a Vue controller,
which is distinct from ownership of the Episode page renderer.

The follow-up audit removed four disconnected metadata-sync Settings controls:
the summary reader and pause/continue/retry entry points had no shipped caller
after the Settings migration. The compatible JSON importer still calls the queue
runner, so that runner and all of its import, persistence, remapping, and recovery
dependencies remain intact. Network metadata refresh is a separate live Profile
Stats service and is unchanged.

## Removed functions

| Source | Removed function |
| --- | --- |
| `static/js/app.js` | `loadDiscoverPreviewSeason` |
| `static/js/app.js` | `toggleDiscoverPreviewSeason` |
| `static/js/app.js` | `addDiscoverPreviewShow` |
| `static/js/app.js` | `addDiscoverSeasonAsWatched` |
| `static/js/app.js` | `addDiscoverEpisodeAsWatched` |
| `static/js/app.js` | `handleAddShowClick` |
| `static/js/app.js` | `openDiscoverEpisodeModal` |
| `static/js/ui.js` | `trackerImageHTML` |
| `static/js/ui.js` | `renderTrackerListSkeletonRows` |
| `static/js/ui.js` | `renderTrackerPosterSkeletonCards` |
| `static/js/ui.js` | `renderMediaPosterPlaceholderHTML` |
| `static/js/ui.js` | `renderPosterTitlePlaceholderHTML` |
| `static/js/ui.js` | `renderDiscoverPosterPlaceholderHTML` |
| `static/js/ui.js` | `renderAdultMovieBadgeHTML` |
| `static/js/ui.js` | `renderMovieTitleWithAdultBadgeHTML` |
| `static/js/ui.js` | `renderThemeItemHTML` |
| `static/js/ui.js` | `getBrowseControlState` |
| `static/js/ui.js` | `getBrowseControlLabels` |
| `static/js/ui.js` | `getEyeFilterRenderState` |
| `static/js/ui.js` | `getWatchlistEmptyHTML` |
| `static/js/ui.js` | `getSearchDisplayFilter` |
| `static/js/ui.js` | `getLibrarySearchEmptyHTML` |
| `static/js/ui.js` | `getCatchUpEpisodesForPopup` |
| `static/js/ui.js` | `getBehindPopupElement` |
| `static/js/ui.js` | `openBehindEpisodesPopup` |
| `static/js/ui.js` | `getShowNetworkText` |
| `static/js/ui.js` | `getShowNetworkInlineHTML` |
| `static/js/ui.js` | `renderShowGenreLinksHTML` |
| `static/js/ui.js` | `renderPlainInlineRouteLinkHTML` |
| `static/js/ui.js` | `renderYearLinkHTML` |
| `static/js/ui.js` | `renderCertificationLinkHTML` |
| `static/js/ui.js` | `renderCreatedByHTML` |
| `static/js/ui.js` | `renderCompanyLogoTilesHTML` |
| `static/js/ui.js` | `renderFavoriteHeartButtonHTML` |
| `static/js/ui.js` | `formatMovieMoney` |
| `static/js/ui.js` | `formatRuntimeDisplay` |
| `static/js/ui.js` | `renderRuntimeDetailLinkHTML` |
| `static/js/ui.js` | `getShowMetaHTML` |
| `static/js/ui.js` | `v2CleanList` |
| `static/js/ui.js` | `v2JoinList` |
| `static/js/ui.js` | `v2FormatDate` |
| `static/js/ui.js` | `v2FirstTrailer` |
| `static/js/ui.js` | `renderV2NetworkLogoOnlyHTML` |
| `static/js/ui.js` | `renderShowEntityLinkHTML` |
| `static/js/ui.js` | `renderNetworkLinkInnerHTML` |
| `static/js/ui.js` | `renderNetworkEntityHTML` |
| `static/js/ui.js` | `renderV2ShowInfoMetaLineHTML` |
| `static/js/ui.js` | `renderV2ShowInfoLinksLineHTML` |
| `static/js/ui.js` | `renderV2ShowFactsHTML` |
| `static/js/ui.js` | `renderV2ExternalLinksHTML` |
| `static/js/ui.js` | `renderV2VideosHTML` |
| `static/js/ui.js` | `collectV2ProviderNames` |
| `static/js/ui.js` | `renderV2KeywordsHTML` |
| `static/js/ui.js` | `renderV2RailSectionHTML` |
| `static/js/ui.js` | `getPersonLinkNameHTML` |
| `static/js/ui.js` | `renderV2ShowCastHTML` |
| `static/js/ui.js` | `renderV2EpisodeExtraHTML` |
| `static/js/ui.js` | `getV2SeasonDetails` |
| `static/js/ui.js` | `renderV2SeasonMetaHTML` |
| `static/js/ui.js` | `renderV2SeasonOverviewHTML` |
| `static/js/ui.js` | `renderV2SimilarShowsHTML` |
| `static/js/ui.js` | `renderV2ShowAPISectionsHTML` |
| `static/js/ui.js` | `renderDiscoverShowModalPreservingScroll` |
| `static/js/ui.js` | `renderDiscoverShowModal` |
| `static/js/ui.js` | `getDiscoverPreviewKey` |
| `static/js/ui.js` | `renderDiscoverPreviewSeasonsHTML` |
| `static/js/ui.js` | `seasonEpisodeListIsLoadedEmpty` |
| `static/js/ui.js` | `renderSeasonEpisodeEmptyStateHTML` |
| `static/js/ui.js` | `renderDiscoverPreviewEpisodesHTML` |
| `static/js/ui.js` | `discoverAddButtonHTML` |
| `static/js/ui.js` | `renderShowModalPreservingScroll` |
| `static/js/ui.js` | `getRatingsByCountry` |
| `static/js/ui.js` | `renderProviderNamesForCountry` |
| `static/js/ui.js` | `getShowProgressSummary` |
| `static/js/ui.js` | `renderShowProgressHTML` |
| `static/js/ui.js` | `getEpisodeNavLabel` |
| `static/js/ui.js` | `openStatusPopup` |
| `static/js/ui.js` | `renderMetadataSyncPanel` |
| `static/js/ui.js` | `renderCompatibleImportPreviewHTML` |
| `static/js/ui.js` | `renderCompatibleCSVPreviewHTML` |

## Verification

Local: 81 pre-existing JavaScript regression files and 49 source contracts passed
following the removals. The new absence regression checks the entire shipped source
set. TypeScript, production Vue/Tailwind builds and exact-head CI remain mandatory
before merge; deployment and production checks are recorded in the acceptance log.
This is a cleanup slice, not closure of Sprint 3 or final release acceptance.

## Serious finding: duplicate movie History matcher

The complete shipped app declared `isMovieHistoryEntry` twice. The last declaration
ignored the target movie ID, so `addMovieHistoryEntry` and `removeMovieHistoryEntries`
could return deletion IDs for every movie, including unrelated/unknown old records.
A whole-app synthetic regression reproduced this before repair. One matcher now
preserves broad classification when no target is supplied and requires a valid,
matching canonical ID for targeted mutation. Empty/invalid mutation targets are
no-ops. The exported integrity API references that same single definition.

The regression adds/rewatches one movie, removes it, and checks exact preservation
of other movies, TV, specials and unknown old records. It also rejects a duplicate
global matcher declaration. No real production History is changed by this test or
repaired speculatively; any prior data loss would require separate evidence/restore.
