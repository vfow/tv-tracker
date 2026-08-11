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
const ui = fs.readFileSync('static/js/ui.js','utf8');
const db = fs.readFileSync('static/js/db.js','utf8');

assert(router.includes('/app/list/'));
assert(router.includes('app\\/show'));
assert(router.includes('function parseAppRoute(pathname,search="")'));
assert(router.includes('function prepareInitialRoute()'));
assert(router.includes('app\\/person'));
assert(!router.includes('person|actor|creator|director|writer|producer|editor|composer|cinematographer'));
assert(!router.includes('#/app'));
assert(template.includes('show-detail-page'));
assert(template.includes('episode-detail-page'));
assert(template.includes('app-router.js'));
assert(!template.includes('static-adapter.js'));
assert(login.includes('Registration coming soon'));
assert(!login.includes('name="next"'));
assert(tmdb.includes('The key is held by Flask'));
assert(!ui.includes('TVTrackerStaticAdapter'));
assert(ui.includes('function safeExternalURL'));
assert(ui.includes('data-person-role="person"'));
assert(ui.includes('const homepageURL = show ? safeExternalURL(show.homepage) : "";'));
assert(!ui.includes('href="${escapeHTML(show.homepage)}"'));
assert(ui.includes('for="library-year-filter">Year</label>'));
assert(ui.includes('setSelectOptions(yearSelect,"All Years",buildLibraryOptionCounts("year",baseStatusShows),getLibraryYearFilter())'));

const libraryFilterSource = ui.slice(
  ui.indexOf('function getLibraryGenreFilter'),
  ui.indexOf('function removeLibrarySearchControl')
);
const libraryFilterContext = {
  console,
  Map,
  Object,
  Array,
  Number,
  String,
  Date,
  DATA:{
    shows:{
      1:{status:'watching',genres:['Drama'],networks:[{name:'Netflix'}],first_air_date:'2024-01-01'},
      2:{status:'watching',genres:['Crime'],networks:[{name:'FX'}],first_air_date:'2023-02-02'},
      3:{status:'finished',genres:['Comedy'],networks:[{name:'HBO'}],first_air_date:'2022-03-03'}
    },
    history:[]
  },
  activeFilter:'watching',
  activePage:'shows',
  activeShowsTab:'watchlist',
  librarySearchQuery:'needle',
  libraryGenreFilter:'Mystery',
  libraryNetworkFilter:'all',
  libraryYearFilter:'all',
  librarySortMode:'default',
  filterShow(show){ return show.status === libraryFilterContext.activeFilter; },
  document:{querySelectorAll(){ return []; }},
  window:{TVTrackerRouter:{updateRouteFromState(){}}},
  renderLibrarySearchControl(){},
  renderWatchlist(){},
  getLibrarySearchQuery(){ return String(libraryFilterContext.librarySearchQuery || '').trim(); },
  sortLibrarySearchResults(){ return 0; }
};
vm.createContext(libraryFilterContext);
vm.runInContext(libraryFilterSource, libraryFilterContext);

const genreCounts = Array.from(libraryFilterContext.buildLibraryOptionCounts('genre'));
assert(genreCounts.some(item=>item.value === 'Drama' && item.label === 'Drama (1)'));
assert(genreCounts.some(item=>item.value === 'Crime' && item.label === 'Crime (1)'));
assert(!genreCounts.some(item=>item.value === 'Comedy'),'filter options should be scoped to the current status list');
assert(genreCounts.some(item=>item.value === 'Mystery' && item.label === 'Mystery (0)'),'an active filter should remain visible after switching to a status with zero matches');

const yearCounts = Array.from(libraryFilterContext.buildLibraryOptionCounts('year'));
assert.deepStrictEqual(yearCounts.map(item=>item.value),['2024','2023']);
libraryFilterContext.libraryGenreFilter='all';
libraryFilterContext.libraryYearFilter='2024';
assert.strictEqual(libraryFilterContext.libraryShowMatchesAdvancedFilters(libraryFilterContext.DATA.shows[1]),true);
assert.strictEqual(libraryFilterContext.libraryShowMatchesAdvancedFilters(libraryFilterContext.DATA.shows[2]),false);

libraryFilterContext.activeFilter='finished';
libraryFilterContext.librarySearchQuery='keep me';
libraryFilterContext.libraryGenreFilter='Comedy';
libraryFilterContext.libraryNetworkFilter='HBO';
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
assert(app.includes('history.pushState'));
assert(app.includes('/static/assets/icons/arrow-narrow-left.svg'));

console.log('Frontend integration checks passed');
