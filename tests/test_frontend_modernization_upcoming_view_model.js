const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');
let rendered = null;
let refreshCalls = 0;

const show = {tmdb_id:42,title:'Example Show',poster_path:'/poster.jpg'};
const episode = {season_number:2,episode_number:3,name:'Return',air_date:'2026-09-01',still_path:'/still.jpg'};
const extra = {season_number:2,episode_number:4,name:'Second Drop',air_date:'2026-09-01',still_path:''};

const root = {
  dataset:{},
  querySelectorAll(){ return []; }
};
const context = {
  window:{
    document:{
      getElementById(id){ return id === 'show-list' ? root : null; },
      querySelector(){ return null; },
      querySelectorAll(){ return []; }
    },
    location:{pathname:'/app/list/watching',origin:'https://example.test'},
    TVTrackerNotifications:{_relativeTime(){ return 'now'; }},
    getUpcomingShows(){ return [{group:'Today',show,episode,timeLabel:'8:00 PM',behindCount:0,isNew:true}]; },
    prepareUpcomingDisplayItems(items){ return [{item:items[0],extraEpisodes:[extra],isBatch:true,batchKey:'42:2:2026-09-01'}]; },
    isEpisodeLoggable(){ return true; },
    isNewUpcomingEpisode(){ return false; },
    isRecentlyAvailableEpisode(){ return false; },
    isEpisodeAired(){ return true; },
    getUpcomingTimeLabel(){ return '8:00 PM'; },
    getEpisodeDetailRoute(showId,season,number){ return `/app/show/${showId}/season/${season}/episode/${number}`; },
    trackerImageURL(path,size){ return `https://img.test/${size}${path}`; },
    expandedUpcomingBatches:{'42:2:2026-09-01':true},
    isRefreshingUpcoming:false,
    refreshUpcomingDataInBackground(){ refreshCalls += 1; return Promise.resolve(); },
    setTimeout,
    PointerEvent:function PointerEvent(){},
    fetch(){ throw new Error('unexpected fetch'); }
  },
  Map, Object, Array, String, Number, Date, Math, Promise, URL, encodeURIComponent, console, setTimeout
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source,context);

context.window.TVTrackerUpcomingNotificationsVueBridge.attachVueOwner({
  render(model){ rendered = model; },
  unmount(){}
});

(async()=>{
  await context.window.TVTrackerUpcomingNotificationsVueBridge.renderUpcoming(true);
  assert(rendered);
  assert.strictEqual(rendered.surface,'upcoming');
  assert.strictEqual(rendered.state,'ready');
  assert.strictEqual(rendered.groups.length,1);
  assert.strictEqual(rendered.groups[0].name,'Today');
  assert.strictEqual(rendered.groups[0].showNotificationBell,true);
  const item = rendered.groups[0].items[0];
  assert.strictEqual(item.showId,'42');
  assert.strictEqual(item.episodeLabel,'S2E03 — Return');
  assert.strictEqual(item.canLog,true);
  assert.strictEqual(item.isNew,true);
  assert.strictEqual(item.batchOpen,true);
  assert.strictEqual(item.extraEpisodes.length,1);
  assert.strictEqual(item.extraEpisodes[0].episode,4);
  assert.strictEqual(item.extraEpisodes[0].canLog,true);
  assert.strictEqual(refreshCalls,1);
  console.log('Upcoming structured view-model behavior passed.');
})().catch(error=>{ console.error(error); process.exit(1); });
