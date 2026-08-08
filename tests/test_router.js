const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function splitRoute(route){
  const [pathname, query=''] = String(route || '/app/list/watching').split('?');
  return {pathname, search:query ? '?' + query : ''};
}

function createRouter(route){
  const initial = splitRoute(route);
  const queued = [];
  const calls = [];
  const listeners = {};
  const context = {
    console,
    Set,
    Array,
    Number,
    String,
    URLSearchParams,
    encodeURIComponent,
    activePage:'shows',
    activeShowsTab:'watchlist',
    activeFilter:'watching',
    librarySearchQuery:'',
    selectedEpisodeContext:null,
    selectedShowId:null,
    selectedGenreSlug:null,
    selectedDiscoveryContext:null,
    selectedPersonContext:null,
    selectedMovieId:null,
    searchRouteState:{query:''},
    moviePageState:{movie:null},
    discoveryPageState:{name:''},
    appDataReady:true,
    showDetailBackStack:[],
    showDetailPreview:null,
    discoverPreviewShow:null,
    showPage(page){ context.activePage = page; calls.push(['showPage',page]); },
    renderShowsPage(){ calls.push(['renderShowsPage']); },
    updateShellTitle(){ calls.push(['updateShellTitle']); },
    closeShowModal(){ calls.push(['closeShowModal']); },
    getSearchRoute(query=''){ return query ? '/app/search?q=' + encodeURIComponent(query) : '/app/search'; },
    getMovieDetailRoute(id,name=''){ return name ? `/app/movie/${id}-${String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}` : `/app/movie/${id}`; },
    getDiscoveryFilterDetailRoute(type,value){ return `/app/${type}/${value}`; },
    openSearchPage(query,options){ calls.push(['openSearchPage',query,options]); },
    openShowDetailsPage(id,options){ calls.push(['openShowDetailsPage',id,options]); },
    openMoviePage(id,options){ calls.push(['openMoviePage',id,options]); },
    openEpisodeModal(id,season,episode,options){ calls.push(['openEpisodeModal',id,season,episode,options]); },
    openGenrePage(slug,options){ calls.push(['openGenrePage',slug,options]); },
    openDiscoveryFilterPage(type,value,options){ calls.push(['openDiscoveryFilterPage',type,value,options]); },
    openDiscoverCategoryPage(media,category,options){ calls.push(['openDiscoverCategoryPage',media,category,options]); },
    openDiscoverHomePage(options){ calls.push(['openDiscoverHomePage',options]); },
    openPersonPage(role,id,options){ calls.push(['openPersonPage',role,id,options]); },
    renderAppRouteNotFoundPage(){ calls.push(['renderAppRouteNotFoundPage']); },
    document:{querySelectorAll(){ return []; }},
    history:{
      pushState(state,title,url){ const parts=splitRoute(url); context.window.location.pathname=parts.pathname; context.window.location.search=parts.search; calls.push(['pushState',url]); },
      replaceState(state,title,url){ const parts=splitRoute(url); context.window.location.pathname=parts.pathname; context.window.location.search=parts.search; calls.push(['replaceState',url]); }
    },
    window:{
      location:{pathname:initial.pathname,search:initial.search,hash:''},
      addEventListener(type,handler){ listeners[type]=handler; },
      setTimeout(handler){ queued.push(handler); return queued.length; }
    }
  };
  context.window.window=context.window;
  context.window.history=context.history;
  context.window.document=context.document;
  context.window.showPage=context.showPage;
  context.window.URLSearchParams=URLSearchParams;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('static/js/app-router.js','utf8'),context);
  while(queued.length){ queued.shift()(); }
  return {context,calls,listeners,router:context.window.TVTrackerRouter};
}

{
  const {calls,router}=createRouter('/app/search?q=batman');
  assert.strictEqual(router.currentRoute(),'/app/search?q=batman');
  const call=calls.find(item=>item[0]==='openSearchPage');
  assert(call,'search route should open search page');
  assert.strictEqual(call[1],'batman');
  assert.strictEqual(call[2].fromRoute,true);
}

{
  const {calls,router}=createRouter('/app/list/watching?q=dark');
  assert.strictEqual(router.currentRoute(),'/app/list/watching?q=dark');
  assert(calls.some(item=>item[0]==='showPage' && item[1]==='shows'),'list route should open shows page');
}

{
  const {calls,router}=createRouter('/app/show/1399');
  assert.strictEqual(router.currentRoute(),'/app/show/1399');
  assert(calls.some(item=>item[0]==='renderAppRouteNotFoundPage'),'old ID-only show route should not open show page');
  assert(!calls.some(item=>item[0]==='openShowDetailsPage'));
}

{
  const {calls,router}=createRouter('/app/show/1399-game-of-thrones');
  assert.strictEqual(router.currentRoute(),'/app/show/1399-game-of-thrones');
  const call=calls.find(item=>item[0]==='openShowDetailsPage');
  assert(call,'pretty show route should open show page');
  assert.strictEqual(call[1],'1399');
  assert.strictEqual(call[2].routeSlug,'game-of-thrones');
}


{
  const {calls,router}=createRouter('/app/discover/tv/popular');
  assert.strictEqual(router.currentRoute(),'/app/discover/tv/popular');
  const call=calls.find(item=>item[0]==='openDiscoverCategoryPage');
  assert(call,'discover category route should open category page');
  assert.deepStrictEqual(call.slice(1,3),['tv','popular']);
  assert.strictEqual(call[3].fromRoute,true);
}

{
  const {calls,router}=createRouter('/app/discover/movie/upcoming');
  assert.strictEqual(router.currentRoute(),'/app/discover/movie/upcoming');
  const call=calls.find(item=>item[0]==='openDiscoverCategoryPage');
  assert(call,'movie discover category route should open category page');
  assert.deepStrictEqual(call.slice(1,3),['movie','upcoming']);
}

{
  const {calls}=createRouter('/app/show/1399/season/1/episode/3');
  const call=calls.find(item=>item[0]==='openEpisodeModal');
  assert(call,'episode route should open episode page');
  assert.deepStrictEqual(call.slice(1,4),['1399',1,3]);
  assert.strictEqual(call[4].fromRoute,true);
}

{
  const {calls,router}=createRouter('/app/movie/603-the-matrix');
  assert.strictEqual(router.currentRoute(),'/app/movie/603-the-matrix');
  const call=calls.find(item=>item[0]==='openMoviePage');
  assert(call,'movie route should open movie page');
  assert.strictEqual(call[1],'603');
  assert.strictEqual(call[2].routeSlug,'the-matrix');
}

{
  const {calls,router}=createRouter('/app/genre/action-adventure');
  assert.strictEqual(router.currentRoute(),'/app/genre/action-adventure');
  const call=calls.find(item=>item[0]==='openGenrePage');
  assert(call,'genre route should open genre page');
  assert.strictEqual(call[1],'action-adventure');
  assert.strictEqual(call[2].fromRoute,true);
}

for (const [route,type,value,slug] of [
  ['/app/network/213-netflix','network','213','netflix'],
  ['/app/company/49-hbo','company','49','hbo'],
  ['/app/provider/8-netflix','provider','8','netflix'],
  ['/app/theme/1234-war','theme','1234','war'],
]) {
  const {calls,router}=createRouter(route);
  assert.strictEqual(router.currentRoute(),route);
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,`${route} should open discovery filter page`);
  assert.deepStrictEqual(call.slice(1,3),[type,value]);
  assert.strictEqual(call[3].routeSlug,slug);
}

{
  const {calls,router}=createRouter('/app/language/ja-japanese');
  assert.strictEqual(router.currentRoute(),'/app/language/ja-japanese');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'pretty language route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['language','ja']);
  assert.strictEqual(call[3].routeSlug,'japanese');
}

{
  const {calls,router}=createRouter('/app/country/jp-japan');
  assert.strictEqual(router.currentRoute(),'/app/country/jp-japan');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'pretty country route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['country','jp']);
  assert.strictEqual(call[3].routeSlug,'japan');
}

{
  const {calls,router}=createRouter('/app/year/2024');
  assert.strictEqual(router.currentRoute(),'/app/year/2024');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'year route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['year','2024']);
}

{
  const {calls,router}=createRouter('/app/status/returning-series');
  assert.strictEqual(router.currentRoute(),'/app/status/returning-series');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'status route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['status','returning-series']);
}

{
  const {calls,router}=createRouter('/app/certification/tv/tv-ma');
  assert.strictEqual(router.currentRoute(),'/app/certification/tv/tv-ma');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'TV certification route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['certification','tv/tv-ma']);
}

{
  const {calls,router}=createRouter('/app/certification/movie/pg-13');
  assert.strictEqual(router.currentRoute(),'/app/certification/movie/pg-13');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'movie certification route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['certification','movie/pg-13']);
}

{
  const {calls,router}=createRouter('/app/actor/123-leonardo-dicaprio');
  assert.strictEqual(router.currentRoute(),'/app/actor/123-leonardo-dicaprio');
  const call=calls.find(item=>item[0]==='openPersonPage');
  assert(call,'pretty person route should open person page');
  assert.deepStrictEqual(call.slice(1,3),['actor','123']);
  assert.strictEqual(call[3].routeSlug,'leonardo-dicaprio');
}


for (const route of [
  '/app/movie/603',
  '/app/network/213',
  '/app/company/49',
  '/app/provider/8',
  '/app/theme/1234',
  '/app/language/ja',
  '/app/country/jp',
  '/app/actor/123',
  '/app/discover/tv/trending',
  '/app/discover/person/popular',
]) {
  const {calls}=createRouter(route);
  assert(calls.some(item=>item[0]==='renderAppRouteNotFoundPage'), `${route} should be 404 until a pretty slug is used`);
}

{
  const {context,calls,router}=createRouter('/app/list/watching');
  calls.length=0;
  context.activePage='search';
  context.searchRouteState={query:'batman'};
  router.updateRouteFromState(false);
  assert(calls.some(item=>item[0]==='pushState' && item[1]==='/app/search?q=batman'));
}

{
  const {context,calls,router}=createRouter('/app/list/watching');
  calls.length=0;
  context.activePage='shows';
  context.activeShowsTab='watchlist';
  context.activeFilter='plan';
  context.librarySearchQuery='dark';
  router.updateRouteFromState(false);
  assert(calls.some(item=>item[0]==='pushState' && item[1]==='/app/list/plan-to-watch?q=dark'));
}

{
  const {context,calls,router}=createRouter('/app/show/1399');
  calls.length=0;
  context.window.location.pathname='/app/private/notes';
  context.window.location.search='';
  router.applyRoute();
  assert(calls.some(item=>item[0]==='renderAppRouteNotFoundPage'));
}

console.log('Real-path router runtime checks passed');
