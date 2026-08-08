const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function createRouter(pathname){
  const queued = [];
  const calls = [];
  const listeners = {};
  const context = {
    console,
    Set,
    Array,
    Number,
    String,
    encodeURIComponent,
    activePage:'shows',
    activeShowsTab:'watchlist',
    selectedEpisodeContext:null,
    selectedShowId:null,
    selectedGenreSlug:null,
    selectedDiscoveryContext:null,
    selectedPersonContext:null,
    appDataReady:true,
    showDetailBackStack:[],
    showDetailPreview:null,
    discoverPreviewShow:null,
    showPage(page){ context.activePage = page; calls.push(['showPage',page]); },
    renderShowsPage(){ calls.push(['renderShowsPage']); },
    updateShellTitle(){ calls.push(['updateShellTitle']); },
    closeShowModal(){ calls.push(['closeShowModal']); },
    openShowDetailsPage(id,options){ calls.push(['openShowDetailsPage',id,options]); },
    openEpisodeModal(id,season,episode,options){ calls.push(['openEpisodeModal',id,season,episode,options]); },
    openGenrePage(slug,options){ calls.push(['openGenrePage',slug,options]); },
    openDiscoveryFilterPage(type,value,options){ calls.push(['openDiscoveryFilterPage',type,value,options]); },
    openPersonPage(role,id,options){ calls.push(['openPersonPage',role,id,options]); },
    document:{querySelectorAll(){ return []; }},
    history:{
      pushState(state,title,url){ context.window.location.pathname=url; calls.push(['pushState',url]); },
      replaceState(state,title,url){ context.window.location.pathname=url; calls.push(['replaceState',url]); }
    },
    window:{
      location:{pathname,search:'',hash:''},
      addEventListener(type,handler){ listeners[type]=handler; },
      setTimeout(handler){ queued.push(handler); return queued.length; }
    }
  };
  context.window.window=context.window;
  context.window.history=context.history;
  context.window.document=context.document;
  context.window.showPage=context.showPage;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('static/js/v2-router.js','utf8'),context);
  while(queued.length){ queued.shift()(); }
  return {context,calls,listeners,router:context.window.TVTrackerV2Router};
}

{
  const {calls,router}=createRouter('/app/show/1399');
  assert.strictEqual(router.currentRoute(),'/app/show/1399');
  const call=calls.find(item=>item[0]==='openShowDetailsPage');
  assert(call,'show route should open show page');
  assert.strictEqual(call[1],'1399');
  assert.strictEqual(call[2].fromRoute,true);
}

{
  const {calls}=createRouter('/app/show/1399/season/1/episode/3');
  const call=calls.find(item=>item[0]==='openEpisodeModal');
  assert(call,'episode route should open episode page');
  assert.deepStrictEqual(call.slice(1,4),['1399',1,3]);
  assert.strictEqual(call[4].fromRoute,true);
}


{
  const {calls,router}=createRouter('/app/genre/action-adventure');
  assert.strictEqual(router.currentRoute(),'/app/genre/action-adventure');
  const call=calls.find(item=>item[0]==='openGenrePage');
  assert(call,'genre route should open genre page');
  assert.strictEqual(call[1],'action-adventure');
  assert.strictEqual(call[2].fromRoute,true);
}


{
  const {calls,router}=createRouter('/app/network/213');
  assert.strictEqual(router.currentRoute(),'/app/network/213');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'network route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['network','213']);
  assert.strictEqual(call[3].fromRoute,true);
}

{
  const {calls,router}=createRouter('/app/language/ja');
  assert.strictEqual(router.currentRoute(),'/app/language/ja');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'language route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['language','ja']);
  assert.strictEqual(call[3].fromRoute,true);
}

{
  const {calls,router}=createRouter('/app/country/jp');
  assert.strictEqual(router.currentRoute(),'/app/country/jp');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'country route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['country','jp']);
  assert.strictEqual(call[3].fromRoute,true);
}

{
  const {calls,router}=createRouter('/app/actor/123');
  assert.strictEqual(router.currentRoute(),'/app/actor/123');
  const call=calls.find(item=>item[0]==='openPersonPage');
  assert(call,'person route should open person page');
  assert.deepStrictEqual(call.slice(1,3),['actor','123']);
  assert.strictEqual(call[3].fromRoute,true);
}

{
  const {context,calls,router}=createRouter('/app/watchlist');
  calls.length=0;
  context.activePage='discover';
  router.updateRouteFromState(false);
  assert(calls.some(item=>item[0]==='pushState' && item[1]==='/app/discover'));
}

{
  const {context,calls,router}=createRouter('/app/show/1399');
  calls.length=0;
  context.window.location.pathname='/app/private/notes';
  router.applyRoute();
  assert(calls.some(item=>item[0]==='replaceState' && item[1]==='/app/watchlist'));
  assert(calls.some(item=>item[0]==='showPage' && item[1]==='shows'));
}

console.log('Real-path router runtime checks passed');
