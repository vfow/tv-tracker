const assert = require('assert');
const vm = require('vm');

function dateOnlyRelease(dateString){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))){
    return null;
  }
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day + 1, 0, 0, 0, 0);
}

const release = dateOnlyRelease('2026-07-31');
assert(release instanceof Date);
assert.strictEqual(release.getFullYear(), 2026);
assert.strictEqual(release.getMonth(), 7);
assert.strictEqual(release.getDate(), 1);

const fs = require('fs');
const app = fs.readFileSync('static/js/app.js','utf8');
assert(!app.includes('api.' + 'tv' + 'maze.com'));
assert(app.includes('function cleanLegacyMetadata'));
assert(app.includes('function getPersonAvailableRoles'));
assert(app.includes('function getPersonCreditsForRole'));
assert(!app.includes('PERSON_ROLE_CONFIGS'));
assert(app.includes('function syncNextEpisodeFromTMDB'));


const router = fs.readFileSync('static/js/app-router.js','utf8');
const template = fs.readFileSync('templates/index.html','utf8');
const login = fs.readFileSync('templates/login.html','utf8');
const tmdb = fs.readFileSync('static/js/tmdb.js','utf8');
const config = fs.readFileSync('static/js/config.js','utf8');
const ui = fs.readFileSync('static/js/ui.js','utf8');
const historyActivity = fs.readFileSync('static/js/history-activity.js','utf8');
const db = fs.readFileSync('static/js/db.js','utf8');
const trending = fs.readFileSync('static/js/trending.js','utf8');
const settings = fs.readFileSync('static/js/settings.js','utf8');
const releaseTiming = fs.readFileSync('static/js/release-timing.js','utf8');
const notificationsRuntime = fs.readFileSync('static/js/notifications-runtime.js','utf8');
const discoverBrowse = fs.readFileSync('static/js/discover-browse.js','utf8');
const showDetailFilters = fs.readFileSync('static/js/show-detail-filters.js','utf8');
const episodeCrew = fs.readFileSync('static/js/episode-crew.js','utf8');
const interactionQuality = fs.readFileSync('static/js/interaction-quality.js','utf8');
const startup = fs.readFileSync('static/js/startup.js','utf8');
const feedback = fs.readFileSync('static/js/feedback.js','utf8');
const providerFreshness = fs.readFileSync('static/js/provider-freshness.js','utf8');
const adultFilter = fs.readFileSync('static/js/adult-filter.js','utf8');
const settingsVueBridge = fs.readFileSync('static/js/settings-vue-bridge.js','utf8');
const settingsVueLoader = fs.readFileSync('static/js/settings-vue-loader.js','utf8');
const pendingSaveStore = fs.readFileSync('static/js/pending-save-store.js','utf8');
const auditUtils = fs.readFileSync('static/js/audit-utils.js','utf8');
const clientRuntime = fs.readFileSync('static/js/client-runtime.js','utf8');
const saveStorageFallback = fs.readFileSync('static/js/save-storage-fallback.js','utf8');
const coreFoundation = fs.readFileSync('static/js/core/foundation.js','utf8');
const streamRegion = fs.readFileSync('static/js/streaming-region.js','utf8');

assert(!router.includes('#view='));
assert(router.includes('window.addEventListener("popstate"'));
assert(router.includes('history.replaceState'));
assert(router.includes('history.pushState'));
assert(router.includes('function parseAppRoute'));
assert(router.includes('function setPathRoute'));
assert(router.includes('function applyRoute'));

assert(template.includes("filename='js/app-router.js'"));
assert(template.includes("filename='js/startup.js'"));
assert(template.indexOf("filename='js/app-router.js'") < template.indexOf("filename='js/startup.js'"));
assert(template.includes("filename='js/settings-vue-loader.js'"));
assert(template.indexOf("filename='js/settings-vue-loader.js'") < template.indexOf("filename='js/app-router.js'"));

assert(login.includes('data-auth-tab="login"'));
assert(login.includes('data-auth-tab="signup"'));
assert(login.includes('id="login-panel" role="tabpanel" aria-labelledby="login-tab"'));
assert(login.includes('id="signup-panel" role="tabpanel" aria-labelledby="signup-tab"'));

assert(config.includes('const TMDB_API_BASE = "/api/tmdb";'));
assert(tmdb.includes('TMDB_API_BASE'));
assert(!tmdb.includes('api_key='));
assert(!tmdb.includes('TMDB_API_KEY'));
assert(!tmdb.includes('api.themoviedb.org'));

assert(ui.includes('function safeExternalURL'));
assert(ui.includes('function getCheckSuccessAnimationTarget'));
assert(ui.includes('function openGlobalSearchResult'));
assert(ui.includes('// --TVT-search-navigation-owner-begin--'));
assert(ui.includes('// --TVT-search-navigation-owner-end--'));
assert(ui.includes('window.TVTrackerRouter.setPathRoute(route,true)'));

const personRoleContext = {};
vm.createContext(personRoleContext);
vm.runInContext(
  app.slice(
    app.indexOf('function normalizePersonRole'),
    app.indexOf('function getPersonAvailableRoles')
  ),
  personRoleContext
);
assert.strictEqual(personRoleContext.normalizePersonRole('actor'),'actor');
assert.strictEqual(personRoleContext.normalizePersonRole('director'),'director');
assert.strictEqual(personRoleContext.normalizePersonRole('creator'),'creator');
assert.strictEqual(personRoleContext.normalizePersonRole('writer'),'writer');
assert.strictEqual(personRoleContext.normalizePersonRole('producer'),'producer');
assert.strictEqual(personRoleContext.normalizePersonRole('anything-else'),'actor');

const libraryFilterContext = {
  activeFilter:'watching',
  librarySearchQuery:'keep me',
  libraryGenreFilter:'18',
  libraryNetworkFilter:'213',
  libraryYearFilter:'2022',
  librarySortMode:'rating-desc'
};
vm.createContext(libraryFilterContext);
vm.runInContext(
  app.slice(
    app.indexOf('function hasActiveLibraryControls'),
    app.indexOf('function getCurrentSection')
  ),
  libraryFilterContext
);
assert.strictEqual(libraryFilterContext.hasActiveLibraryControls(),true);
libraryFilterContext.resetLibraryFiltersToDefault();
assert.strictEqual(libraryFilterContext.activeFilter,'watching','Reset Filters must keep the current status');
assert.strictEqual(libraryFilterContext.librarySearchQuery,'keep me','Reset Filters must keep the search text');
assert.strictEqual(libraryFilterContext.libraryGenreFilter,'all');
assert.strictEqual(libraryFilterContext.libraryNetworkFilter,'all');
assert.strictEqual(libraryFilterContext.libraryYearFilter,'all');
assert.strictEqual(libraryFilterContext.librarySortMode,'default');
assert.strictEqual(libraryFilterContext.hasActiveLibraryControls(),false,'status/search alone must not count as active advanced filters');

libraryFilterContext.activeFilter='finished';
libraryFilterContext.librarySearchQuery='keep me';
libraryFilterContext.libraryGenreFilter='18';
libraryFilterContext.libraryNetworkFilter='213';
libraryFilterContext.libraryYearFilter='2022';
libraryFilterContext.librarySortMode='rating-desc';
libraryFilterContext.resetLibraryFiltersToDefault();
assert.strictEqual(libraryFilterContext.activeFilter,'finished','Reset Filters must keep the current status');
assert.strictEqual(libraryFilterContext.librarySearchQuery,'keep me','Reset Filters must keep the search text');
assert.strictEqual(libraryFilterContext.libraryGenreFilter,'all');
assert.strictEqual(libraryFilterContext.libraryNetworkFilter,'all');
assert.strictEqual(libraryFilterContext.libraryYearFilter,'all');
assert.strictEqual(libraryFilterContext.librarySortMode,'default');
assert.strictEqual(libraryFilterContext.hasActiveLibraryControls(),false,'status/search alone must not count as active advanced filters');

const safeExternalURLSource = ui.slice(
  ui.indexOf('function safeExternalURL'),
  ui.indexOf('function getCheckSuccessAnimationTarget')
);
const securityContext = {URL};
vm.createContext(securityContext);
vm.runInContext(safeExternalURLSource, securityContext);
assert.strictEqual(securityContext.safeExternalURL('https://example.com/path'), 'https://example.com/path');
assert.strictEqual(securityContext.safeExternalURL('http://example.com/'), 'http://example.com/');
assert.strictEqual(securityContext.safeExternalURL('javascript:alert(1)'), '');
assert.strictEqual(securityContext.safeExternalURL('//example.com/path'), '');

assert(!db.includes('login?next='));
assert(db.includes('const SYNC_CHANGE_PAGE_LIMIT = 50;'));
assert(db.includes('baseRevision:Number(SERVER_REVISION || 0)'));
assert(db.includes('let requestRevision = Number(operation.baseRevision || 0);'));
assert(db.includes('operation.baseRevision = Number(SERVER_REVISION || 0);'));
assert(router.includes('history.pushState'));
assert(app.includes('/static/assets/icons/arrow-narrow-left.svg'));
assert(template.includes('history-activity.js'));
assert(template.indexOf('js/app.js') < template.indexOf('js/history-activity.js'));
assert(historyActivity.includes('function getActivityHistoryEntries'));
assert(historyActivity.includes('function renderHistory'));
assert(historyActivity.includes('getMovieDetailRoute(movie.id,movie.title)'));
assert(historyActivity.includes('entry && entry.backdrop_path || trackedMovie.backdrop_path || ""'));
assert(!historyActivity.includes('poster_path'),'movie History must use backdrop/still imagery, not posters');

const historyActivityRuleSource = historyActivity.slice(
  historyActivity.indexOf('function getActivityHistoryEntries'),
  historyActivity.indexOf('function getMovieHistoryDisplayData')
);
const historyActivityContext = {
  console,
  Object,
  Array,
  Number,
  String,
  Date,
  DATA:{
    shows:{
      1:{tmdb_id:'1',title:'Show One'},
      2:{tmdb_id:'2',title:'Future Show'}
    },
    history:[
      {id:'tv-1',tmdb_id:'1',season:1,episode:1,title:'Show One',watched_at:'2026-08-13T08:00:00Z',air_date:'2026-08-01'},
      {id:'movie-1',media_type:'movie',movie_id:'10',tmdb_id:'10',title:'Movie One',watched_at:'2026-08-13T09:00:00Z'},
      {id:'tv-future',tmdb_id:'2',season:1,episode:1,title:'Future Show',watched_at:'2026-08-13T10:00:00Z',air_date:'2099-01-01'}
    ]
  },
  isMovieHistoryEntry(entry){
    return entry && String(entry.media_type || '').toLowerCase() === 'movie';
  },
  isEpisodeAired(airDate){
    return String(airDate || '') < '2099-01-01';
  }
};
vm.createContext(historyActivityContext);
vm.runInContext(historyActivityRuleSource, historyActivityContext);
const activityEntries = historyActivityContext.getActivityHistoryEntries();
assert.strictEqual(activityEntries.length,2,'future TV episodes must not appear in activity History');
assert.strictEqual(activityEntries[0].id,'movie-1','newest released History item should remain first');
assert.strictEqual(activityEntries[1].id,'tv-1');

assert(trending.includes('TVTrackerRouter'));
assert(settings.includes('TVTrackerRouter'));
assert(releaseTiming.includes('TVTrackerReleaseTiming'));
assert(notificationsRuntime.includes('TVTrackerNotifications'));
assert(discoverBrowse.includes('TVTrackerDiscoverBrowse'));
assert(showDetailFilters.includes('TVTrackerShowDetailFilters'));
assert(episodeCrew.includes('TVTrackerEpisodeCrew'));
assert(interactionQuality.includes('function ensureDialogAccessibility'));
assert(startup.includes('TVTrackerApp'));
assert(feedback.includes('TVTrackerFeedback'));
assert(providerFreshness.includes('TVTrackerProviderFreshness'));
assert(adultFilter.includes('TVTrackerAdultFilter'));
assert(settingsVueBridge.includes('TVTrackerSettingsVue'));
assert(settingsVueLoader.includes('TVTrackerSettingsVueLoader'));
assert(pendingSaveStore.includes('TVTrackerPendingSaveStore'));
assert(auditUtils.includes('TVTrackerAuditUtils'));
assert(clientRuntime.includes('TVTrackerClientRuntime'));
assert(saveStorageFallback.includes('TVTrackerSaveStorageFallback'));
assert(coreFoundation.includes('TVTrackerCore'));
assert(streamRegion.includes('TVTrackerStreamingRegion'));

console.log('Frontend regression tests passed.');
