const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Each removed entry was a disconnected renderer/helper in the ownership audit.
// Scan shipped source and templates, including inline handlers and global names.
const removed = [
    "loadDiscoverPreviewSeason",
    "toggleDiscoverPreviewSeason",
    "addDiscoverPreviewShow",
    "addDiscoverSeasonAsWatched",
    "addDiscoverEpisodeAsWatched",
    "handleAddShowClick",
    "openDiscoverEpisodeModal",
    "trackerImageHTML",
    "renderTrackerListSkeletonRows",
    "renderTrackerPosterSkeletonCards",
    "renderMediaPosterPlaceholderHTML",
    "renderPosterTitlePlaceholderHTML",
    "renderDiscoverPosterPlaceholderHTML",
    "renderAdultMovieBadgeHTML",
    "renderMovieTitleWithAdultBadgeHTML",
    "renderThemeItemHTML",
    "getBrowseControlState",
    "getBrowseControlLabels",
    "getEyeFilterRenderState",
    "getWatchlistEmptyHTML",
    "getSearchDisplayFilter",
    "getLibrarySearchEmptyHTML",
    "getCatchUpEpisodesForPopup",
    "getBehindPopupElement",
    "openBehindEpisodesPopup",
    "getShowNetworkText",
    "getShowNetworkInlineHTML",
    "renderShowGenreLinksHTML",
    "renderPlainInlineRouteLinkHTML",
    "renderYearLinkHTML",
    "renderCertificationLinkHTML",
    "renderCreatedByHTML",
    "renderCompanyLogoTilesHTML",
    "renderFavoriteHeartButtonHTML",
    "formatMovieMoney",
    "formatRuntimeDisplay",
    "renderRuntimeDetailLinkHTML",
    "getShowMetaHTML",
    "v2CleanList",
    "v2JoinList",
    "v2FormatDate",
    "v2FirstTrailer",
    "renderV2NetworkLogoOnlyHTML",
    "renderShowEntityLinkHTML",
    "renderNetworkLinkInnerHTML",
    "renderNetworkEntityHTML",
    "renderV2ShowInfoMetaLineHTML",
    "renderV2ShowInfoLinksLineHTML",
    "renderV2ShowFactsHTML",
    "renderV2ExternalLinksHTML",
    "renderV2VideosHTML",
    "collectV2ProviderNames",
    "renderV2KeywordsHTML",
    "renderV2RailSectionHTML",
    "getPersonLinkNameHTML",
    "renderV2ShowCastHTML",
    "renderV2EpisodeExtraHTML",
    "getV2SeasonDetails",
    "renderV2SeasonMetaHTML",
    "renderV2SeasonOverviewHTML",
    "renderV2SimilarShowsHTML",
    "renderV2ShowAPISectionsHTML",
    "renderDiscoverShowModalPreservingScroll",
    "renderDiscoverShowModal",
    "getDiscoverPreviewKey",
    "renderDiscoverPreviewSeasonsHTML",
    "seasonEpisodeListIsLoadedEmpty",
    "renderSeasonEpisodeEmptyStateHTML",
    "renderDiscoverPreviewEpisodesHTML",
    "discoverAddButtonHTML",
    "renderShowModalPreservingScroll",
    "getRatingsByCountry",
    "renderProviderNamesForCountry",
    "getShowProgressSummary",
    "renderShowProgressHTML",
    "getEpisodeNavLabel",
    "openStatusPopup",
    "renderMetadataSyncPanel",
    "renderCompatibleImportPreviewHTML",
    "renderCompatibleCSVPreviewHTML"
];
function walk(dir) {
    return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(file) : /\.(js|ts|vue|html)$/.test(file) ? [file] : [];
    });
}
for (const file of ['static/js','frontend/src','templates'].flatMap(walk)) {
    const source = fs.readFileSync(file,'utf8');
    for (const name of removed) {
        assert(!new RegExp(`\\b${name}\\b`).test(source), `${file} still references deleted ${name}`);
    }
}
console.log('Removed frontend ownership has no remaining runtime references.');
