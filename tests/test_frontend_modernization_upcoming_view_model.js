const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');
let rendered = null;
let refreshCalls = 0;
const calls = {loggable:[],aired:[],timeLabels:[],routes:[]};

function deepFreeze(value,seen=new Set()){
  if(!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach(entry=>deepFreeze(entry,seen));
  return Object.freeze(value);
}

const firstSeenShow = {tmdb_id:42,title:'First Seen Show',poster_path:'/first.jpg'};
const authoritativeShow = {tmdb_id:42,title:'Authoritative Show',poster_path:'/authoritative.jpg'};
const otherShow = {tmdb_id:77,title:'Other Show',poster_path:'/other.jpg'};
const catchUpShow = {tmdb_id:84,title:'Catch Up Show',poster_path:'/catch-up.jpg'};
const singleCatchUpShow = {tmdb_id:85,title:'Single Catch Up',poster_path:'/single-catch-up.jpg'};

const future7 = {season_number:2,episode_number:7,name:'Non-adjacent Drop',air_date:'2026-09-01',still_path:'/seven.jpg',type:'future'};
const future3 = {season_number:2,episode_number:3,name:'Batch Lead',air_date:'2026-09-01',still_path:'/three.jpg',type:'future'};
const future4 = {season_number:2,episode_number:4,name:'Adjacent Drop',air_date:'2026-09-01',still_path:'',type:'future'};
const otherFuture = {season_number:1,episode_number:1,name:'Other Premiere',air_date:'2026-09-01',still_path:'/other-episode.jpg',type:'future'};
const tomorrowFuture = {season_number:2,episode_number:8,name:'Tomorrow',air_date:'2026-09-02',still_path:'/tomorrow.jpg',type:'future'};
const missed = {season_number:1,episode_number:3,name:'Catch Up Lead',air_date:'2026-08-20',still_path:'/missed.jpg',type:'missed'};
const behind4 = {season_number:1,episode_number:4,name:'Later Catch Up',air_date:'2026-08-20',still_path:'',type:'missed'};
const behind2 = {season_number:1,episode_number:2,name:'Earlier Catch Up',air_date:'2026-08-20',still_path:'/behind-two.jpg',type:'missed'};
const ignoredBehind = {season_number:1,episode_number:1,name:'Different Date',air_date:'2026-08-19',still_path:'',type:'missed'};
const singleMissed = {season_number:1,episode_number:5,name:'Single Missed',air_date:'2026-08-21',still_path:'',type:'missed'};

const upcomingItems = [
  {group:'Tomorrow',show:authoritativeShow,episode:tomorrowFuture,timeLabel:'Tomorrow 8:00 PM',behindCount:0,isNew:false},
  {group:'Today',show:firstSeenShow,episode:future7,timeLabel:'Seven 8:00 PM',behindCount:0,isNew:false},
  {group:'Catch Up',show:catchUpShow,episode:missed,timeLabel:'Available',behindCount:3,isNew:true,behindEpisodes:[behind4,ignoredBehind,behind2]},
  {group:'Today',show:otherShow,episode:otherFuture,timeLabel:'Other 9:00 PM',behindCount:2,isNew:false},
  {group:'Today',show:authoritativeShow,episode:future3,timeLabel:'Lead 8:00 PM',behindCount:0,isNew:true},
  {group:'Catch Up',show:singleCatchUpShow,episode:singleMissed,timeLabel:'Available',behindCount:1,isNew:false,behindEpisodes:[ignoredBehind]},
  {group:'Today',show:firstSeenShow,episode:future4,timeLabel:'Four 8:00 PM',behindCount:0,isNew:false}
];
const inputSnapshot = JSON.stringify(upcomingItems);
deepFreeze(upcomingItems);

const root = {
  dataset:{},
  interactionQueries:0,
  querySelectorAll(){ this.interactionQueries += 1; return []; }
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
    getUpcomingShows(){ return upcomingItems; },
    prepareUpcomingDisplayItems(){ throw new Error('global batching compatibility fallback must not run'); },
    getUpcomingBatchKey(){ throw new Error('global batch-key compatibility fallback must not run'); },
    isEpisodeLoggable(episode,show){ calls.loggable.push([episode,show]); return true; },
    isNewUpcomingEpisode(){ return false; },
    isRecentlyAvailableEpisode(){ return false; },
    isEpisodeAired(episodeDate,episode,show){ calls.aired.push([episodeDate,episode,show]); return true; },
    getUpcomingTimeLabel(episodeDate,episode,show){ calls.timeLabels.push([episodeDate,episode,show]); return `${episode.name} time`; },
    getEpisodeDetailRoute(showId,season,number){ calls.routes.push([showId,season,number]); return `/app/show/${showId}/season/${season}/episode/${number}`; },
    trackerImageURL(path,size){ return `https://img.test/${size}${path}`; },
    expandedUpcomingBatches:{
      '42-2-2026-09-01-future':true,
      '84-1-2026-08-20-missed':true
    },
    isRefreshingUpcoming:false,
    refreshUpcomingDataInBackground(){ refreshCalls += 1; return Promise.resolve(); },
    setTimeout,
    PointerEvent:function PointerEvent(){},
    fetch(){ throw new Error('unexpected fetch'); }
  },
  Map, Set, Object, Array, String, Number, Date, Math, Promise, URL, encodeURIComponent, console, setTimeout
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source,context);

let rejectedRenders = 0;
context.window.TVTrackerUpcomingNotificationsVueBridge.attachVueOwner({
  render(){ rejectedRenders += 1; return false; },
  unmount(){}
});

(async()=>{
  await context.window.TVTrackerUpcomingNotificationsVueBridge.renderUpcoming(false);
  assert.strictEqual(rejectedRenders,1,'the bridge must call the attached owner once');
  assert.strictEqual(rendered,null,'a false owner result must not report or retain a completed render');
  assert.strictEqual(root.interactionQueries,0,'a false owner result must not attach interactions');

  context.window.TVTrackerUpcomingNotificationsVueBridge.attachVueOwner({
    render(model){ rendered = model; return true; },
    unmount(){}
  });
  assert.strictEqual(rendered,null,'a rejected model must not replay when a ready owner attaches');
  await context.window.TVTrackerUpcomingNotificationsVueBridge.renderUpcoming(true);
  assert(rendered);
  assert.strictEqual(rendered.surface,'upcoming');
  assert.strictEqual(rendered.state,'ready');
  assert.deepStrictEqual(Array.from(rendered.groups,group=>group.name),['Catch Up','Today','Tomorrow']);
  assert.deepStrictEqual(Array.from(rendered.groups,group=>group.showNotificationBell),[true,false,false]);

  const catchUpItems = rendered.groups[0].items;
  assert.strictEqual(catchUpItems.length,2);
  assert.strictEqual(catchUpItems[0].key,'84:1:3');
  assert.strictEqual(catchUpItems[0].batchKey,'84-1-2026-08-20-missed');
  assert.strictEqual(catchUpItems[0].batchOpen,true);
  assert.strictEqual(catchUpItems[0].behindText,'');
  assert.deepStrictEqual(Array.from(catchUpItems[0].extraEpisodes,episode=>episode.episode),[2,4]);
  assert.deepStrictEqual(Array.from(catchUpItems[0].extraEpisodes,episode=>episode.key),['84:1:2','84:1:4']);
  assert.strictEqual(catchUpItems[0].extraEpisodes[0].label,'S1E02 — Earlier Catch Up');
  assert.strictEqual(catchUpItems[1].key,'85:1:5');
  assert.strictEqual(catchUpItems[1].batchKey,'');
  assert.strictEqual(catchUpItems[1].batchOpen,false);
  assert.strictEqual(catchUpItems[1].behindText,'1 more episode behind');
  assert.strictEqual(catchUpItems[1].extraEpisodes.length,0);

  const todayItems = rendered.groups[1].items;
  assert.strictEqual(todayItems.length,2);
  assert.strictEqual(todayItems[0].key,'42:2:3');
  assert.strictEqual(todayItems[0].showTitle,'Authoritative Show');
  assert.strictEqual(todayItems[0].episodeLabel,'S2E03 — Batch Lead');
  assert.strictEqual(todayItems[0].timeLabel,'Lead 8:00 PM');
  assert.strictEqual(todayItems[0].imageUrl,'https://img.test/w780/three.jpg');
  assert.strictEqual(todayItems[0].isNew,true);
  assert.strictEqual(todayItems[0].batchKey,'42-2-2026-09-01-future');
  assert.strictEqual(todayItems[0].batchOpen,true);
  assert.deepStrictEqual(Array.from(todayItems[0].extraEpisodes,episode=>episode.episode),[4,7]);
  assert.deepStrictEqual(Array.from(todayItems[0].extraEpisodes,episode=>episode.key),['42:2:4','42:2:7']);
  assert.strictEqual(todayItems[0].extraEpisodes[0].imageUrl,'https://img.test/w780/authoritative.jpg');
  assert.strictEqual(todayItems[0].extraEpisodes[1].label,'S2E07 — Non-adjacent Drop');
  assert.strictEqual(todayItems[1].key,'77:1:1');
  assert.strictEqual(todayItems[1].batchKey,'');
  assert.strictEqual(todayItems[1].behindText,'2 more episodes behind');
  assert.strictEqual(todayItems[1].extraEpisodes.length,0);

  const tomorrowItems = rendered.groups[2].items;
  assert.strictEqual(tomorrowItems.length,1);
  assert.strictEqual(tomorrowItems[0].key,'42:2:8');
  assert.strictEqual(tomorrowItems[0].batchKey,'');
  assert.strictEqual(tomorrowItems[0].batchOpen,false);

  assert(calls.loggable.some(([episode,show])=>episode === future3 && show === authoritativeShow));
  assert(calls.aired.some(([,episode,show])=>episode === future4 && show === authoritativeShow));
  assert(calls.aired.some(([,episode,show])=>episode === future7 && show === authoritativeShow));
  assert(calls.aired.some(([,episode,show])=>episode === behind2 && show === catchUpShow));
  assert(calls.timeLabels.some(([,episode,show])=>episode === future7 && show === authoritativeShow));
  assert(calls.routes.some(([showId,season,number])=>showId === 42 && season === 2 && number === 3));
  assert.strictEqual(JSON.stringify(upcomingItems),inputSnapshot);
  assert.strictEqual(refreshCalls,1);

  const readyRenderFailure = new Error('ready owner render failed');
  const notificationStates = [];
  context.window.TVTrackerUpcomingNotificationsVueBridge.attachVueOwner({
    render(model){
      notificationStates.push(model.state);
      if(model.surface === 'notifications' && model.state === 'ready') throw readyRenderFailure;
      return true;
    },
    unmount(){}
  });
  context.window.fetch = async path=>({
    ok:true,
    async json(){
      if(path === '/api/notifications/read-all') return {ok:true};
      if(path === '/api/notifications') return {notifications:[{id:1,message:'Fresh',createdAt:'2026-09-03T00:00:00Z'}]};
      throw new Error('unexpected notification request: ' + path);
    }
  });
  await assert.rejects(
    context.window.TVTrackerUpcomingNotificationsVueBridge.renderNotificationsPage(),
    error=>error === readyRenderFailure,
    'a ready owner render exception must propagate instead of becoming Vue error-model success'
  );
  assert.deepStrictEqual(notificationStates.slice(-2),['loading','ready']);
  assert(!notificationStates.includes('error'),'a ready owner render exception must not be converted to an error model');
  console.log('Upcoming structured batching view-model behavior passed.');
})().catch(error=>{ console.error(error); process.exit(1); });
