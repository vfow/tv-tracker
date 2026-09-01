const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const stateSource = fs.readFileSync('static/js/tracker-lists-state-bridge.js','utf8');
const runtimeSource = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');

const root = {innerHTML:'',dataset:{},querySelector(){return null;},querySelectorAll(){return [];}};
let ownerModel = null;
let libraryControls = 0;
let marked = '';
let statusUpdate = null;
let animated = 0;
const show = {tmdb_id:42,title:'Example Show',status:'watching',poster_path:'/poster.jpg'};
const context = {
  console, URL, Promise, Object, String, Number, Math, Set, Map,
  window:{
    DATA:{shows:{'42':show},movies:{},profile:{favorite_shows:[],favorite_movies:[]}},
    activeFilter:'watching',librarySearchQuery:'',libraryGenreFilter:'all',libraryNetworkFilter:'all',libraryYearFilter:'all',librarySortMode:'default',
    getWatchlistShowsForCurrentView(){ return {shows:[show],query:''}; },
    getNextEpisode(){ return {season:2,episode:3,name:'The Next One',air_date:'2026-08-31'}; },
    getLatestWatchedEpisode(){ return null; },
    getEpisodeData(){ return {}; },
    isNewUpcomingEpisode(){ return true; },
    getNoNextEpisodeText(){ return 'No next episode'; },
    isEpisodeLoggable(){ return true; },
    formatAirDate(){ return 'Aug 31'; },
    getShowDetailRoute(){ return '/app/show/42-example-show'; },
    trackerImageURL(path,size){ return `https://img.test/${size}${path}`; },
    renderLibrarySearchControl(){ libraryControls += 1; },
    async markNextEpisode(id){ marked = id; },
    async updateShowStatus(id,status){ statusUpdate = [id,status]; },
    async playCheckSuccessAnimation(){ animated += 1; },
    document:{getElementById(id){ return id === 'show-list' ? root : null; },querySelector(){return null;},querySelectorAll(){return []; }},
    location:{pathname:'/app/list/watching',origin:'https://example.test'},
    renderUpcoming(){},TVTrackerNotifications:null,setTimeout,PointerEvent:function PointerEvent(){}
  }
};
vm.createContext(context);
vm.runInContext(stateSource,context);
vm.runInContext(runtimeSource,context);
const bridge = context.window.TVTrackerTrackerListsVueBridge;
bridge.attachVueOwner({render(model){ ownerModel = model; },unmount(){}});

(async()=>{
  assert.strictEqual(await bridge.renderWatchlist(),true);
  assert.strictEqual(libraryControls,1);
  assert(ownerModel);
  assert.strictEqual(ownerModel.surface,'watchlist');
  assert.strictEqual(ownerModel.items.length,1);
  const item = ownerModel.items[0];
  assert.strictEqual(item.id,'42');
  assert.strictEqual(item.route,'/app/show/42-example-show');
  assert.strictEqual(item.episodeText,'Season 2, Episode 3');
  assert.strictEqual(item.episodeTitle,'The Next One');
  assert.strictEqual(item.newBadge,true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(item.action)),{kind:'mark',label:'Mark Example Show Season 2, Episode 3 watched',disabled:false});
  assert.strictEqual(root.dataset.tvtrackerTrackerListsOwner,'vue-watchlist');

  await bridge.actions.perform('mark','42',{});
  assert.strictEqual(marked,'42');
  assert.strictEqual(animated,1);
  await bridge.actions.perform('watching','42',null);
  assert.deepStrictEqual(statusUpdate,['42','watching']);

  assert.strictEqual(await bridge.refreshWatchlistShows(['42']),true);
  assert.strictEqual(libraryControls,2);
  console.log('Tracker Lists structured Vue renderer contract passed.');
})().catch(error=>{ console.error(error); process.exitCode = 1; });
