const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const router = fs.readFileSync('static/js/app-router.js','utf8');
const source = fs.readFileSync('static/js/tracker-lists-state-bridge.js','utf8');
const cases = [
  {filter:'watching',slug:'watching',episode:'Season 1, Episode 2',action:'mark'},
  {filter:'paused',slug:'paused',episode:'Next: Season 1, Episode 2',action:'watching'},
  {filter:'finished',slug:'completed',episode:'✓ Completed',action:null},
  {filter:'plan',slug:'plan-to-watch',episode:'Start with Season 1, Episode 2',action:'watching'},
  {filter:'dropped',slug:'dropped',episode:'Stopped after Season 1, Episode 1',action:'watching'},
];
const compactRouter = router.replace(/\s+/g,'');
for(const item of cases){
  assert(compactRouter.includes(`"${item.slug}":"${item.filter}"`));
  assert(compactRouter.includes(`${item.filter}:"${item.slug}"`) || compactRouter.includes(`"${item.filter}":"${item.slug}"`));
}

const show = {tmdb_id:7,title:'Parity Show',status:'watching'};
const context = {window:{
  DATA:{shows:{'7':show},movies:{},profile:{favorite_shows:[],favorite_movies:[]}},
  activeFilter:'watching',librarySearchQuery:'',libraryGenreFilter:'all',libraryNetworkFilter:'all',libraryYearFilter:'all',librarySortMode:'default',
  getWatchlistShowsForCurrentView(){ return {shows:[show],query:''}; },
  getNextEpisode(){ return {season:1,episode:2,name:'Next',air_date:'2026-08-31'}; },
  getLatestWatchedEpisode(){ return {season:1,episode:1}; },
  getEpisodeData(){ return {name:'Previous'}; },
  isNewUpcomingEpisode(){ return false; },
  getNoNextEpisodeText(){ return 'No next episode'; },
  isEpisodeLoggable(){ return true; },
  formatAirDate(){ return 'Aug 31'; },
  getShowDetailRoute(){ return '/app/show/7-parity-show'; },
  trackerImageURL(){ return ''; }
}};
vm.createContext(context);
vm.runInContext(source,context);
const bridge = context.window.TVTrackerTrackerListsStateBridge;
for(const item of cases){
  context.window.activeFilter = item.filter;
  show.status = item.filter;
  const state = bridge.snapshot();
  const model = bridge.viewModel();
  assert.strictEqual(state.routeSlug,item.slug);
  assert.strictEqual(model.routeSlug,item.slug);
  assert.strictEqual(model.items[0].filter,item.filter);
  assert.strictEqual(model.items[0].episodeText,item.episode);
  assert.strictEqual(model.items[0].completed,item.filter === 'finished');
  assert.strictEqual(model.items[0].action ? model.items[0].action.kind : null,item.action);
}
assert.strictEqual(bridge.ownership,'legacy-read-only');
assert(!source.includes('document.'));
assert(!source.includes('saveData('));
console.log('Tracker Lists five-status native view-model parity contract passed.');
