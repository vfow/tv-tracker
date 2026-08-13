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


const completionRuleSource = app.slice(
  app.indexOf('function isKnownFutureRegularEpisode'),
  app.indexOf('async function completeShow')
);
assert(completionRuleSource.includes('async function autoCompleteShowAfterLogging'));
assert(completionRuleSource.includes('function reopenCompletedShowAfterUnwatch'));

async function runCompletionRuleChecks(){
  let refreshCalls = 0;
  const completionContext = {
    console,
    Object,
    Array,
    Number,
    String,
    Date,
    Math,
    Promise,
    isMainSeasonNumber(value){
      const number = Number(value);
      return Number.isFinite(number) && number >= 1;
    },
    isEpisodeAired(airDate){
      return !!airDate && String(airDate) <= '2026-08-13';
    },
    isEpisodeLoggable(ep,show,seasonNumber){
      if(ep && ep.air_date){
        return String(ep.air_date) <= '2026-08-13';
      }
      const last = show && show.last_episode_to_air;
      if(!last){
        return false;
      }
      const season = Number(seasonNumber);
      const episode = Number(ep && ep.episode_number || 0);
      const lastSeason = Number(last.season_number || 0);
      const lastEpisode = Number(last.episode_number || 0);
      return season < lastSeason || (season === lastSeason && episode <= lastEpisode);
    },
    canUseTMDBShow(){ return true; },
    async refreshShowDetails(){ refreshCalls += 1; return true; },
    async loadSeasonData(){ return true; },
    seasonDataAlreadyLoaded(){ return true; },
    getAllAiredUnwatchedEpisodes(show){ return Array.isArray(show._testUnwatched) ? show._testUnwatched : []; }
  };
  vm.createContext(completionContext);
  vm.runInContext(completionRuleSource, completionContext);

  const completedShow = {
    status:'watching',
    completed_at:'',
    number_of_seasons:1,
    last_episode_to_air:{season_number:1,episode_number:1,air_date:'2026-08-01'},
    next_episode_to_air:null,
    _episode_list:{'1':[{episode_number:1,air_date:'2026-08-01'}]},
    _testUnwatched:[]
  };
  assert.strictEqual(await completionContext.autoCompleteShowAfterLogging(completedShow),true);
  assert.strictEqual(completedShow.status,'finished');
  assert(completedShow.completed_at,'automatic completion should set completed_at');

  const futureUnknownDate = {
    status:'watching',
    completed_at:'',
    number_of_seasons:2,
    last_episode_to_air:{season_number:1,episode_number:1,air_date:'2026-08-01'},
    next_episode_to_air:{season_number:2,episode_number:1,air_date:''},
    _episode_list:{
      '1':[{episode_number:1,air_date:'2026-08-01'}],
      '2':[{episode_number:1,air_date:''}]
    },
    _testUnwatched:[]
  };
  assert.strictEqual(await completionContext.autoCompleteShowAfterLogging(futureUnknownDate),false);
  assert.strictEqual(futureUnknownDate.status,'watching','an announced future episode without an air date must block completion');

  const futureSpecialOnly = {
    status:'watching',
    completed_at:'',
    number_of_seasons:1,
    last_episode_to_air:{season_number:1,episode_number:1,air_date:'2026-08-01'},
    next_episode_to_air:null,
    _episode_list:{
      '0':[{episode_number:1,air_date:'2099-01-01'}],
      '1':[{episode_number:1,air_date:'2026-08-01'}]
    },
    _testUnwatched:[]
  };
  assert.strictEqual(await completionContext.autoCompleteShowAfterLogging(futureSpecialOnly),true,'specials must not block completion');

  refreshCalls = 0;
  const pausedShow = {status:'paused',completed_at:'',_testUnwatched:[]};
  assert.strictEqual(await completionContext.autoCompleteShowAfterLogging(pausedShow),false);
  assert.strictEqual(pausedShow.status,'paused');
  assert.strictEqual(refreshCalls,0,'paused shows should not trigger completion verification');

  completionContext.refreshShowDetails = async()=>false;
  const failedVerification = {
    status:'watching',
    completed_at:'',
    number_of_seasons:1,
    last_episode_to_air:{season_number:1,episode_number:1},
    next_episode_to_air:null,
    _episode_list:{'1':[{episode_number:1,air_date:'2026-08-01'}]},
    _testUnwatched:[]
  };
  assert.strictEqual(await completionContext.autoCompleteShowAfterLogging(failedVerification),false);
  assert.strictEqual(failedVerification.status,'watching','failed TMDB verification must leave status unchanged');

  const reopened = {status:'finished',completed_at:'2026-08-13T00:00:00.000Z'};
  assert.strictEqual(completionContext.reopenCompletedShowAfterUnwatch(reopened,1),true);
  assert.strictEqual(reopened.status,'watching');
  assert.strictEqual(reopened.completed_at,'');

  const specialUnwatch = {status:'finished',completed_at:'2026-08-13T00:00:00.000Z'};
  assert.strictEqual(completionContext.reopenCompletedShowAfterUnwatch(specialUnwatch,0),false);
  assert.strictEqual(specialUnwatch.status,'finished','unwatching a special must not reopen a completed show');
}

const episodeCreditSource = app.slice(
  app.indexOf('function normalizeActorCharacter'),
  app.indexOf('function normalizeTMDBEpisodeExternalIds')
);
const episodeCreditContext = {Object,Array,Number,String,Set};
vm.createContext(episodeCreditContext);
vm.runInContext(episodeCreditSource, episodeCreditContext);
const splitCredits = episodeCreditContext.normalizeTMDBEpisodeCreditGroups({
  guest_stars:[
    {id:10,name:'Guest One',character:'Guest',order:1},
    {id:20,name:'Guest Two',character:'Guest',order:2}
  ],
  cast:[
    {id:10,name:'Guest One',character:'Regular duplicate',order:1},
    {id:30,name:'Cast One',character:'Lead',order:3}
  ]
});
assert.deepStrictEqual(Array.from(splitCredits.guest_stars,item=>item.id),[10,20]);
assert.deepStrictEqual(Array.from(splitCredits.cast,item=>item.id),[30],'guest stars must be removed from the regular episode cast section');

runCompletionRuleChecks()
.then(()=>console.log('Automatic completion rule checks passed'))
.catch(error=>{
  console.error(error);
  process.exitCode = 1;
});

console.log('Frontend integration checks passed');
