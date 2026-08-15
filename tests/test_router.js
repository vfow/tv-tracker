const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function splitRoute(route){
  const [pathname, query=''] = String(route || '/app/list/watching').split('?');
  return {pathname, search:query ? '?' + query : ''};
}

function createRouter(route, options={}){
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
    libraryGenreFilter:'all',
    libraryNetworkFilter:'all',
    libraryYearFilter:'all',
    librarySortMode:'default',
    selectedEpisodeContext:null,
    selectedShowId:null,
    selectedGenreSlug:null,
    selectedGenreMedia:'tv',
    selectedDiscoveryContext:null,
    selectedPersonContext:null,
    selectedMovieId:null,
    selectedCollectionId:null,
    searchRouteState:{query:'',media:'tv'},
    moviePageState:{movieId:'',routeSlug:'',loading:false,error:'',movie:null},
    collectionDetailPageState:{collectionId:'',routeSlug:'',loading:false,error:'',collection:null,movies:[]},
    collectionsPageState:{loaded:false,loading:false,error:'',collections:[]},
    personPageState:{role:'',personId:'',media:'tv',loading:false,error:'',person:null,credits:[]},
    genrePageState:{media:'tv',slug:'',name:'',genreId:null,year:'',sort:'popularity.desc',page:1,totalPages:1,loading:false,error:'',shows:[]},
    discoveryPageState:{type:'',value:'',name:'',media:'tv',routeSlug:'',year:'',sort:'popularity.desc',browse:null,browseLabels:null,page:1,totalPages:1,loading:false,error:'',shows:[]},
    browsePageState:{media:'tv',filters:null,labels:null,page:1,totalPages:1,loading:false,error:'',shows:[]},
    discoverSearchState:{query:'',media:'tv',loading:false},
    discoverHubState:{loaded:false,loading:false,error:'',sections:[],genres:{tv:[],movie:[]}},
    appDataReady:options.appDataReady !== false,
    showDetailBackStack:[],
    showDetailPreview:null,
    discoverPreviewShow:null,
    showPage(page){ context.activePage = page; calls.push(['showPage',page]); },
    renderShowsPage(){ calls.push(['renderShowsPage']); },
    updateShellTitle(){ calls.push(['updateShellTitle']); },
    closeShowModal(){ calls.push(['closeShowModal']); },
    getSearchRoute(query='',media='tv',eyeOptions={}){
      if(!query){ return '/app/search'; }
      const parts=['q=' + encodeURIComponent(query),'type=' + encodeURIComponent(media || 'tv')];
      if(media !== 'person'){
        if(eyeOptions.fadeWatched){ parts.push('fadeWatched=1'); }
        if(eyeOptions.hideWatched){ parts.push('hideWatched=1'); }
        if(eyeOptions.hidePlan){ parts.push('hidePlan=1'); }
        if(eyeOptions.hideFavorites){ parts.push('hideFavorites=1'); }
      }
      return '/app/search?' + parts.join('&');
    },
    getMovieDetailRoute(id,name=''){ return name ? `/app/movie/${id}-${String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}` : `/app/movie/${id}`; },
    getCollectionDetailRoute(id,name=''){ return name ? `/app/collection/${id}-${String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}` : `/app/collection/${id}`; },
    getCollectionsRoute(state={}){
      const parts=[];
      if(state.genre){ parts.push('genre=' + encodeURIComponent(state.genre)); }
      if(state.decade){ parts.push('decade=' + encodeURIComponent(state.decade)); }
      if(state.sort && state.sort !== 'popularity.desc'){ parts.push('sort=' + encodeURIComponent(state.sort)); }
      if(Number(state.page || 1) > 1){ parts.push('page=' + encodeURIComponent(String(state.page))); }
      return '/app/collections' + (parts.length ? '?' + parts.join('&') : '');
    },
    getGenreDetailRoute(id,name='',media='tv'){ const slug=String(name||'genre').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); return `/app/genre/${media === 'movie' ? 'movie' : 'tv'}/${id}-${slug}`; },
    getKnownShowRouteLabel(){ return ''; },
    getEpisodeDetailRoute(id,season,episode,name=''){ return name ? `/app/show/${id}-${String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}/season/${season}/episode/${episode}` : `/app/show/${id}/season/${season}/episode/${episode}`; },
    getDiscoveryFilterDetailRoute(type,value,label='',media='tv'){
      if(type === 'network' || type === 'status'){ return `/app/${type}/${value}`; }
      if(type === 'certification'){ return `/app/certification/${value}`; }
      return `/app/${type}/${media || 'tv'}/${value}`;
    },
    getPersonDetailRoute(role,id,name='',media='tv',eyeOptions={}){
      const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      const base = `/app/person/${id}${slug ? '-' + slug : ''}`;
      const parts = [];
      if(media === 'movie'){ parts.push('media=movie'); }
      const cleanRole = String(role || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      if(cleanRole && cleanRole !== 'person'){ parts.push('role=' + encodeURIComponent(cleanRole)); }
      if(eyeOptions.fadeWatched){ parts.push('fadeWatched=1'); }
      if(eyeOptions.hideWatched){ parts.push('hideWatched=1'); }
      if(eyeOptions.hidePlan){ parts.push('hidePlan=1'); }
      if(eyeOptions.hideFavorites){ parts.push('hideFavorites=1'); }
      return base + (parts.length ? '?' + parts.join('&') : '');
    },
    openSearchPage(query,options){ calls.push(['openSearchPage',query,options]); },
    openShowDetailsPage(id,options){ calls.push(['openShowDetailsPage',id,options]); },
    openMoviePage(id,options){ calls.push(['openMoviePage',id,options]); },
    openCollectionsPage(options){ calls.push(['openCollectionsPage',options]); },
    openCollectionDetailPage(id,options){ calls.push(['openCollectionDetailPage',id,options]); },
    openEpisodeModal(id,season,episode,options){ calls.push(['openEpisodeModal',id,season,episode,options]); },
    openGenrePage(slug,options){ calls.push(['openGenrePage',slug,options]); },
    openDiscoveryFilterPage(type,value,options){ calls.push(['openDiscoveryFilterPage',type,value,options]); },
    openDiscoverCategoryPage(media,category,options){ calls.push(['openDiscoverCategoryPage',media,category,options]); },
    openDiscoverHomePage(options){ calls.push(['openDiscoverHomePage',options]); },
    openBrowsePage(state,options){ calls.push(['openBrowsePage',state,options]); },
    openPersonPage(role,id,options){ calls.push(['openPersonPage',role,id,options]); },
    showShowDetailPageShell(ctx){ context.activePage='show-detail'; calls.push(['showShowDetailPageShell',ctx]); },
    renderShowDetailLoading(id){ calls.push(['renderShowDetailLoading',id]); },
    showMovieDetailPageShell(ctx){ context.activePage='movie-detail'; calls.push(['showMovieDetailPageShell',ctx]); },
    renderMovieDetailLoading(){ calls.push(['renderMovieDetailLoading']); },
    showCollectionsPageShell(ctx){ context.activePage='collections-index'; calls.push(['showCollectionsPageShell',ctx]); },
    renderActiveCollectionsPage(){ calls.push(['renderActiveCollectionsPage']); },
    showCollectionDetailPageShell(ctx){ context.activePage='collection-detail'; calls.push(['showCollectionDetailPageShell',ctx]); },
    renderActiveCollectionDetailPage(){ calls.push(['renderActiveCollectionDetailPage']); },
    showEpisodeDetailPageShell(ctx){ context.activePage='episode-detail'; calls.push(['showEpisodeDetailPageShell',ctx]); },
    renderEpisodeDetailLoading(id,season,episode){ calls.push(['renderEpisodeDetailLoading',id,season,episode]); },
    showPersonDetailPageShell(ctx){ context.activePage='person-detail'; calls.push(['showPersonDetailPageShell',ctx]); },
    renderActivePersonPage(){ calls.push(['renderActivePersonPage']); },
    showGenreDetailPageShell(ctx){ context.activePage='genre-detail'; calls.push(['showGenreDetailPageShell',ctx]); },
    renderActiveGenrePage(){ calls.push(['renderActiveGenrePage']); },
    showDiscoveryFilterPageShell(ctx){ context.activePage='discovery-detail'; calls.push(['showDiscoveryFilterPageShell',ctx]); },
    renderActiveDiscoveryFilterPage(){ calls.push(['renderActiveDiscoveryFilterPage']); },
    showBrowsePageShell(ctx){ context.activePage='browse-detail'; calls.push(['showBrowsePageShell',ctx]); },
    renderActiveBrowsePage(){ calls.push(['renderActiveBrowsePage']); },
    getBrowseRoute(state){ return context.window.TVTrackerBrowse.routeForState(state); },
    showSearchPageShell(){ context.activePage='search'; calls.push(['showSearchPageShell']); },
    renderSearchLoading(query){ calls.push(['renderSearchLoading',query]); },
    renderDiscoverHub(){ calls.push(['renderDiscoverHub']); },
    renderAppRouteNotFoundPage(){ calls.push(['renderAppRouteNotFoundPage']); },
    document:{
      querySelectorAll(){ return []; },
      querySelector(){ return null; },
      getElementById(){ return null; },
      addEventListener(){}
    },
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
  context.window.TVTrackerNotifications={
    openNotificationsPage(options){ context.activePage='notifications'; calls.push(['openNotificationsPage',options]); },
    openNotificationSettingsPage(options){ context.activePage='notification-settings'; calls.push(['openNotificationSettingsPage',options]); }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('static/js/discover-browse.js','utf8'),context);
  vm.runInContext(fs.readFileSync('static/js/app-router.js','utf8'),context);
  while(queued.length){ queued.shift()(); }
  return {context,calls,listeners,router:context.window.TVTrackerRouter};
}

{
  const {calls,router}=createRouter('/app/search?q=batman&type=movie');
  assert.strictEqual(router.currentRoute(),'/app/search?q=batman&type=movie');
  const call=calls.find(item=>item[0]==='openSearchPage');
  assert(call,'search route should open search page');
  assert.strictEqual(call[1],'batman');
  assert.strictEqual(call[2].fromRoute,true);
  assert.strictEqual(call[2].media,'movie');
}

{
  const {calls,router}=createRouter('/app/search/?type=movie&q=batman&hideFavorites=1&fadeWatched=1&bad=1');
  assert.strictEqual(router.currentRoute(),'/app/search?q=batman&type=movie&fadeWatched=1&hideFavorites=1');
  const call=calls.find(item=>item[0]==='openSearchPage');
  assert(call,'search route should pass eye options into the page');
  assert.strictEqual(call[2].eyeState.fadeWatched,true);
  assert.strictEqual(call[2].eyeState.hideFavorites,true);
  assert.strictEqual(call[2].eyeState.hideWatched,false);
}

{
  const {calls,router}=createRouter('/app/search?q=nolan&type=person&hideWatched=1');
  assert.strictEqual(router.currentRoute(),'/app/search?q=nolan&type=person');
  const call=calls.find(item=>item[0]==='openSearchPage');
  assert(call,'person search route should still open search page');
  assert.strictEqual(call[2].media,'person');
}

{
  const {calls,router}=createRouter('/app/list/watching?q=dark');
  assert.strictEqual(router.currentRoute(),'/app/list/watching?q=dark');
  assert(calls.some(item=>item[0]==='showPage' && item[1]==='shows'),'list route should open shows page');
}

{
  const {calls,context,router}=createRouter('/app/list/completed/?x=1&q=dark&genre=Drama&network=HBO%20Max&year=2024&sort=rating-desc');
  assert.strictEqual(router.currentRoute(),'/app/list/completed?q=dark&genre=Drama&network=HBO%20Max&year=2024&sort=rating-desc');
  assert.strictEqual(context.activeFilter,'finished');
  assert.strictEqual(context.librarySearchQuery,'dark');
  assert.strictEqual(context.libraryGenreFilter,'Drama');
  assert.strictEqual(context.libraryNetworkFilter,'HBO Max');
  assert.strictEqual(context.libraryYearFilter,'2024');
  assert.strictEqual(context.librarySortMode,'rating-desc');
  assert(calls.some(item=>item[0]==='replaceState' && item[1]==='/app/list/completed?q=dark&genre=Drama&network=HBO%20Max&year=2024&sort=rating-desc'),'list filters should canonicalize without losing state');
}

{
  const {calls,context,router}=createRouter('/app/list/paused?genre=all&network=all&year=twenty&sort=unknown');
  assert.strictEqual(router.currentRoute(),'/app/list/paused');
  assert.strictEqual(context.libraryGenreFilter,'all');
  assert.strictEqual(context.libraryNetworkFilter,'all');
  assert.strictEqual(context.libraryYearFilter,'all');
  assert.strictEqual(context.librarySortMode,'default');
  assert(calls.some(item=>item[0]==='replaceState' && item[1]==='/app/list/paused'),'invalid/default advanced filters should be removed from the canonical URL');
}

{
  const {calls,router}=createRouter('/app/show/1399');
  assert.strictEqual(router.currentRoute(),'/app/show/1399');
  const call=calls.find(item=>item[0]==='openShowDetailsPage');
  assert(call,'ID-only show route should load so the fetched title can canonicalize the slug');
  assert.strictEqual(call[1],'1399');
  assert.strictEqual(call[2].routeSlug,'');
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
  const {calls,router}=createRouter('/app/discover/movie/upcoming?genre=18&country=JP&year=2024&sort=title-desc&x=1');
  assert.strictEqual(router.currentRoute(),'/app/discover/movie/upcoming?genre=18&country=jp&year=2024');
  const call=calls.find(item=>item[0]==='openDiscoverCategoryPage');
  assert(call,'filtered movie category route should preserve canonical Browse state');
  assert.strictEqual(call[3].browseState.country,'jp');
  assert.strictEqual(call[3].browseState.year,'2024');
  assert.strictEqual(call[3].browseState.sort,'popularity-desc');
  assert.deepStrictEqual(Array.from(call[3].browseState.genres),['18']);
}

{
  const {calls,router}=createRouter('/app/browse/movie?genre=18&hideWatched=1&hidePlan=1');
  assert.strictEqual(router.currentRoute(),'/app/browse/movie?genre=18&hideWatched=1&hidePlan=1');
  const call=calls.find(item=>item[0]==='openBrowsePage');
  assert(call,'browse route should preserve eye modifiers');
  assert.strictEqual(call[1].hideWatched,true);
  assert.strictEqual(call[1].hidePlan,true);
}

{
  const {calls,router}=createRouter('/app/discover/tv/top-rated?genre=18&sort=title-desc');
  assert.strictEqual(router.currentRoute(),'/app/discover/tv/top-rated?genre=18');
  const call=calls.find(item=>item[0]==='openDiscoverCategoryPage');
  assert(call,'top-rated category route should keep filters but normalize away conflicting sort');
  assert.strictEqual(call[3].browseState.sort,'popularity-desc');
  assert.deepStrictEqual(Array.from(call[3].browseState.genres),['18']);
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
  const {calls,router}=createRouter('/app/person/525-christopher-nolan');
  assert.strictEqual(router.currentRoute(),'/app/person/525-christopher-nolan');
  const call=calls.find(item=>item[0]==='openPersonPage');
  assert(call,'neutral person route should open person page');
  assert.deepStrictEqual(call.slice(1,3),['','525']);
  assert.strictEqual(call[3].fromRoute,true);
  assert.strictEqual(call[3].routeSlug,'christopher-nolan');
}

{
  const {calls,router}=createRouter('/app/person/525-christopher-nolan?media=movie&role=director&fadeWatched=1&hideFavorites=1');
  assert.strictEqual(router.currentRoute(),'/app/person/525-christopher-nolan?media=movie&role=director&fadeWatched=1&hideFavorites=1');
  const call=calls.find(item=>item[0]==='openPersonPage');
  assert(call,'person route should preserve media, role, and eye options');
  assert.deepStrictEqual(call.slice(1,3),['director','525']);
  assert.strictEqual(call[3].media,'movie');
  assert.strictEqual(call[3].eyeState.fadeWatched,true);
  assert.strictEqual(call[3].eyeState.hideFavorites,true);
}

{
  const {calls,router}=createRouter('/app/person/525');
  assert.strictEqual(router.currentRoute(),'/app/person/525');
  const call=calls.find(item=>item[0]==='openPersonPage');
  assert(call,'ID-only person route should load so the fetched name can canonicalize the slug');
  assert.deepStrictEqual(call.slice(1,3),['','525']);
  assert.strictEqual(call[3].routeSlug,'');
}

{
  const {calls,router}=createRouter('/app/genre/tv/10759-action-adventure');
  assert.strictEqual(router.currentRoute(),'/app/genre/tv/10759-action-adventure');
  const call=calls.find(item=>item[0]==='openGenrePage');
  assert(call,'TV genre route should open genre page');
  assert.strictEqual(call[1],'10759-action-adventure');
  assert.strictEqual(call[2].fromRoute,true);
  assert.strictEqual(call[2].media,'tv');
}

{
  const {calls,router}=createRouter('/app/genre/movie/27-horror');
  assert.strictEqual(router.currentRoute(),'/app/genre/movie/27-horror');
  const call=calls.find(item=>item[0]==='openGenrePage');
  assert(call,'movie genre route should open genre page');
  assert.strictEqual(call[1],'27-horror');
  assert.strictEqual(call[2].fromRoute,true);
  assert.strictEqual(call[2].media,'movie');
}

for (const route of ['/app/genre/action-adventure','/app/genre/horror']) {
  const {calls,router}=createRouter(route);
  assert.strictEqual(router.currentRoute(),route);
  assert(calls.some(item=>item[0]==='renderAppRouteNotFoundPage'), `${route} should be 404 after legacy genre aliases are removed`);
  assert(!calls.some(item=>item[0]==='openGenrePage'));
}

for (const [route,type,value,slug,media] of [
  ['/app/network/213-netflix','network','213','netflix','tv'],
  ['/app/company/tv/49-hbo','company','49','hbo','tv'],
  ['/app/company/movie/49-hbo','company','49','hbo','movie'],
  ['/app/provider/tv/8-netflix','provider','8','netflix','tv'],
  ['/app/provider/movie/8-netflix','provider','8','netflix','movie'],
  ['/app/theme/tv/1234-war','theme','1234','war','tv'],
  ['/app/theme/movie/1234-war','theme','1234','war','movie'],
]) {
  const {calls,router}=createRouter(route);
  assert.strictEqual(router.currentRoute(),route);
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,`${route} should open discovery filter page`);
  assert.deepStrictEqual(call.slice(1,3),[type,value]);
  assert.strictEqual(call[3].routeSlug,slug);
  assert.strictEqual(call[3].media,media);
}

{
  const {calls,router}=createRouter('/app/language/movie/ja-japanese');
  assert.strictEqual(router.currentRoute(),'/app/language/movie/ja-japanese');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'pretty movie language route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['language','ja']);
  assert.strictEqual(call[3].routeSlug,'japanese');
  assert.strictEqual(call[3].media,'movie');
}

{
  const {calls,router}=createRouter('/app/country/movie/jp-japan');
  assert.strictEqual(router.currentRoute(),'/app/country/movie/jp-japan');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'pretty movie country route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['country','jp']);
  assert.strictEqual(call[3].routeSlug,'japan');
  assert.strictEqual(call[3].media,'movie');
}

{
  const {calls,router}=createRouter('/app/year/movie/2024');
  assert.strictEqual(router.currentRoute(),'/app/year/movie/2024');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'movie year route should open discovery filter page');
  assert.deepStrictEqual(call.slice(1,3),['year','2024']);
  assert.strictEqual(call[3].media,'movie');
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
  assert(!calls.some(item=>item[0]==='openDiscoveryFilterPage'),'TV certification must not open a misleading discovery page');
  assert(calls.some(item=>item[0]==='renderAppRouteNotFoundPage'),'retired TV certification route should render 404');
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
  assert(calls.some(item=>item[0]==='renderAppRouteNotFoundPage'),'role-specific person aliases should be removed');
  assert(!calls.some(item=>item[0]==='openPersonPage'));
}


{
  const {calls,router}=createRouter('/app/person/525-christopher-nolan?media=movie');
  assert.strictEqual(router.currentRoute(),'/app/person/525-christopher-nolan?media=movie');
  const call=calls.find(item=>item[0]==='openPersonPage');
  assert(call,'person movie media route should open person page');
  assert.strictEqual(call[3].media,'movie');
}

{
  const {calls,router}=createRouter('/app/person/525-christopher-nolan?media=movie&role=director');
  assert.strictEqual(router.currentRoute(),'/app/person/525-christopher-nolan?media=movie&role=director');
  const call=calls.find(item=>item[0]==='openPersonPage');
  assert(call,'person role query should open the canonical person page');
  assert.deepStrictEqual(call.slice(1,3),['director','525']);
  assert.strictEqual(call[3].media,'movie');
}

{
  const {calls,router}=createRouter('/app/person/525-christopher-nolan?role=executive-producer&x=1');
  assert.strictEqual(router.currentRoute(),'/app/person/525-christopher-nolan?role=executive-producer');
  const call=calls.find(item=>item[0]==='openPersonPage');
  assert(call,'TV person roles should survive canonical query cleanup');
  assert.deepStrictEqual(call.slice(1,3),['executive-producer','525']);
}

{
  const {calls,router}=createRouter('/app/person/525-christopher-nolan?media=tv&x=1');
  assert.strictEqual(router.currentRoute(),'/app/person/525-christopher-nolan');
  assert(calls.some(item=>item[0]==='replaceState' && item[1]==='/app/person/525-christopher-nolan'),'TV/default person media should canonicalize without a query');
}


for (const [route,callName] of [
  ['/app/movie/603','openMoviePage'],
  ['/app/network/213','openDiscoveryFilterPage'],
  ['/app/company/tv/49','openDiscoveryFilterPage'],
  ['/app/company/movie/49','openDiscoveryFilterPage'],
  ['/app/provider/tv/8','openDiscoveryFilterPage'],
  ['/app/provider/movie/8','openDiscoveryFilterPage'],
  ['/app/theme/tv/1234','openDiscoveryFilterPage'],
  ['/app/theme/movie/1234','openDiscoveryFilterPage'],
  ['/app/language/tv/ja','openDiscoveryFilterPage'],
  ['/app/language/movie/ja','openDiscoveryFilterPage'],
  ['/app/country/tv/jp','openDiscoveryFilterPage'],
  ['/app/country/movie/jp','openDiscoveryFilterPage'],
  ['/app/year/tv/2024','openDiscoveryFilterPage'],
  ['/app/year/movie/2024','openDiscoveryFilterPage'],
]) {
  const {calls}=createRouter(route);
  assert(calls.some(item=>item[0]===callName), `${route} should load so its resolved label can canonicalize the URL`);
}

for (const route of [
  '/app/actor/123',
  '/app/discover/tv/trending',
  '/app/discover/person/popular',
  '/app/genre/person/drama',
  '/app/company/49-hbo',
  '/app/provider/8-netflix',
  '/app/theme/1234-war',
  '/app/language/ja-japanese',
  '/app/country/jp-japan',
  '/app/year/2024',
]) {
  const {calls}=createRouter(route);
  assert(calls.some(item=>item[0]==='renderAppRouteNotFoundPage'), `${route} should be 404`);
}


{
  const {context,calls,router}=createRouter('/app/list/watching');
  calls.length=0;
  context.activePage='genre-detail';
  context.selectedGenreSlug='27-horror';
  context.selectedGenreMedia='movie';
  context.genrePageState={media:'movie',genreId:'27',name:'Horror',slug:'horror',browse:{media:'movie'}};
  router.updateRouteFromState(false);
  assert(calls.some(item=>item[0]==='pushState' && item[1]==='/app/genre/movie/27-horror'));
}

{
  const {context,calls,router}=createRouter('/app/list/watching');
  calls.length=0;
  context.activePage='search';
  context.searchRouteState={query:'batman',media:'tv'};
  router.updateRouteFromState(false);
  assert(calls.some(item=>item[0]==='pushState' && item[1]==='/app/search?q=batman&type=tv'));
}

{
  const {context,calls,router}=createRouter('/app/list/watching');
  calls.length=0;
  context.activePage='shows';
  context.activeShowsTab='watchlist';
  context.activeFilter='plan';
  context.librarySearchQuery='dark';
  context.libraryGenreFilter='Drama';
  context.libraryNetworkFilter='Netflix';
  context.libraryYearFilter='2025';
  context.librarySortMode='year-newest';
  router.updateRouteFromState(false);
  assert(calls.some(item=>item[0]==='pushState' && item[1]==='/app/list/plan-to-watch?q=dark&genre=Drama&network=Netflix&year=2025&sort=year-newest'));
}

{
  const {context,calls,router}=createRouter('/app/show/1399');
  calls.length=0;
  context.window.location.pathname='/app/private/notes';
  context.window.location.search='';
  router.applyRoute();
  assert(calls.some(item=>item[0]==='renderAppRouteNotFoundPage'));
}


{
  const {calls,router}=createRouter('/app/search/?type=invalid&q=batman');
  assert.strictEqual(router.currentRoute(),'/app/search?q=batman&type=tv');
  assert(calls.some(item=>item[0]==='replaceState' && item[1]==='/app/search?q=batman&type=tv'),'search route should normalize slash/query parameters');
}

{
  const {calls,router}=createRouter('/app/list/completed/?x=1&q=dark');
  assert.strictEqual(router.currentRoute(),'/app/list/completed?q=dark');
  assert(calls.some(item=>item[0]==='replaceState' && item[1]==='/app/list/completed?q=dark'),'list route should normalize trailing slash and query');
}

{
  const {context}=createRouter('/app/list/dropped?q=lost&genre=Crime&network=FX&year=2022&sort=title-az',{appDataReady:false});
  assert.strictEqual(context.activeFilter,'dropped');
  assert.strictEqual(context.librarySearchQuery,'lost');
  assert.strictEqual(context.libraryGenreFilter,'Crime');
  assert.strictEqual(context.libraryNetworkFilter,'FX');
  assert.strictEqual(context.libraryYearFilter,'2022');
  assert.strictEqual(context.librarySortMode,'title-az');
}

{
  const {calls,context}=createRouter('/app/show/1399-game-of-thrones',{appDataReady:false});
  assert.strictEqual(context.activePage,'show-detail');
  assert(calls.some(item=>item[0]==='showShowDetailPageShell'),'startup should select the show-detail shell before app data is ready');
  assert(calls.some(item=>item[0]==='renderShowDetailLoading' && item[1]==='1399'),'startup should show the existing show skeleton');
  assert(!calls.some(item=>item[0]==='showPage' && item[1]==='shows'),'startup must not render WATCHLIST first');
}

{
  const {calls,context}=createRouter('/app/movie/603-the-matrix',{appDataReady:false});
  assert.strictEqual(context.activePage,'movie-detail');
  assert(calls.some(item=>item[0]==='showMovieDetailPageShell'),'startup should select the movie-detail shell');
  assert(calls.some(item=>item[0]==='renderMovieDetailLoading'),'startup should show the existing movie skeleton');
}

{
  const {calls,context}=createRouter('/app/person/525-christopher-nolan',{appDataReady:false});
  assert.strictEqual(context.activePage,'person-detail');
  assert.strictEqual(context.personPageState.role,'');
  assert(calls.some(item=>item[0]==='renderActivePersonPage'),'startup should render the existing person loading layout');
}

{
  const {calls,context}=createRouter('/app/person/525-christopher-nolan?media=movie',{appDataReady:false});
  assert.strictEqual(context.activePage,'person-detail');
  assert.strictEqual(context.personPageState.media,'movie');
  assert(calls.some(item=>item[0]==='renderActivePersonPage'),'movie person startup should preserve media before app data is ready');
}

{
  const {calls,context,router}=createRouter('/app/discover',{appDataReady:false});
  assert.strictEqual(context.activePage,'discover');
  assert(calls.some(item=>item[0]==='renderDiscoverHub'),'Discover startup should render the existing skeleton immediately');
  assert.strictEqual(context.discoverHubState.loading,false,'startup skeleton must not claim the real Discover request is already running');
  calls.length=0;
  context.appDataReady=true;
  router.applyRoute();
  assert(calls.some(item=>item[0]==='openDiscoverHomePage'),'Discover should start its real loader after app state becomes ready');
}

{
  const {calls,context}=createRouter('/app/history',{appDataReady:false});
  assert.strictEqual(context.activeShowsTab,'history');
  assert.strictEqual(context.activePage,'shows');
  assert(!calls.some(item=>item[0]==='renderShowsPage'),'history startup should select the tab without rendering empty app data');
}

{
  const {calls,router}=createRouter('/app');
  assert.strictEqual(router.currentRoute(),'/app/list/watching');
  assert(calls.some(item=>item[0]==='replaceState' && item[1]==='/app/list/watching'),'app root should normalize without adding history');
}

{
  const {calls,context}=createRouter('/app/show/1399',{appDataReady:false});
  assert.strictEqual(context.activePage,'show-detail');
  assert(calls.some(item=>item[0]==='renderShowDetailLoading' && item[1]==='1399'),'ID-only show startup should use the show skeleton');
}

{
  const {calls,context}=createRouter('/app/profile',{appDataReady:false});
  assert.strictEqual(context.activePage,'profile');
  assert(!calls.some(item=>item[0]==='showPage'),'profile startup should select its shell without rendering unloaded state');
}

{
  const {calls,context}=createRouter('/app/settings',{appDataReady:false});
  assert.strictEqual(context.activePage,'settings');
  assert(!calls.some(item=>item[0]==='showPage'),'settings startup should select its shell without rendering unloaded state');
}

{
  const {calls,context}=createRouter('/app/upcoming',{appDataReady:false});
  assert.strictEqual(context.activeShowsTab,'upcoming');
  assert.strictEqual(context.activePage,'shows');
  assert(!calls.some(item=>item[0]==='renderShowsPage'),'upcoming startup should select the tab without rendering unloaded state');
}

{
  const {calls,context}=createRouter('/app/network/213',{appDataReady:false});
  assert.strictEqual(context.activePage,'discovery-detail');
  assert(calls.some(item=>item[0]==='renderActiveDiscoveryFilterPage'),'ID-only discovery startup should reuse the existing grid loading state');
}

{
  const {calls,context,listeners}=createRouter('/app/list/watching');
  calls.length=0;
  context.window.location.pathname='/app/profile';
  context.window.location.search='';
  listeners.popstate();
  assert(calls.some(item=>item[0]==='showPage' && item[1]==='profile'),'browser back/forward should route through the shared parser');
}

{
  const {context,listeners}=createRouter('/app/list/watching?genre=Drama&year=2024&sort=rating-desc');
  context.window.location.pathname='/app/list/completed';
  context.window.location.search='?network=HBO&sort=title-az';
  listeners.popstate();
  assert.strictEqual(context.activeFilter,'finished');
  assert.strictEqual(context.librarySearchQuery,'');
  assert.strictEqual(context.libraryGenreFilter,'all');
  assert.strictEqual(context.libraryNetworkFilter,'HBO');
  assert.strictEqual(context.libraryYearFilter,'all');
  assert.strictEqual(context.librarySortMode,'title-az');
}

{
  const {calls,router}=createRouter('/app/private/notes',{appDataReady:false});
  assert.strictEqual(router.parseRoute('/app/private/notes','').valid,false);
  assert(calls.some(item=>item[0]==='renderAppRouteNotFoundPage'),'unknown startup route should show 404 immediately');
}


{
  const {calls,router}=createRouter('/app/browse/movie/?genre=18,80&provider=8,9&country=JP&year=2024&runtime=120-149&sort=rating-desc&network=213&x=1');
  assert.strictEqual(router.currentRoute(),'/app/browse/movie?genre=18,80&provider=8,9&runtime=120-149&country=jp&year=2024&sort=rating-desc');
  const call=calls.find(item=>item[0]==='openBrowsePage');
  assert(call,'generic Browse route should open the unified browse page');
  assert.strictEqual(call[1].media,'movie');
  assert.deepStrictEqual(Array.from(call[1].genres),['18','80']);
  assert.strictEqual(call[1].country,'jp');
  assert.deepStrictEqual(Array.from(call[1].providers),['8','9']);
  assert.strictEqual(call[1].year,'2024');
  assert.strictEqual(call[1].runtime,'120-149');
  assert.strictEqual(call[1].network,'');
}

{
  const {calls,router}=createRouter('/app/browse/tv?decade=2020&year=bad&sort=rating-desc');
  assert.strictEqual(router.currentRoute(),'/app/browse/tv?decade=2020&sort=rating-desc');
  const call=calls.find(item=>item[0]==='openBrowsePage');
  assert(call,'browse decade route should open the unified browse page');
  assert.strictEqual(call[1].year,'');
  assert.strictEqual(call[1].decade,'2020');
  assert.strictEqual(call[1].sort,'rating-desc');
}

{
  const {calls,router}=createRouter('/app/genre/tv/18-drama?year=2024&sort=rating-desc&country=jp');
  assert.strictEqual(router.currentRoute(),'/app/genre/tv/18-drama?country=jp&year=2024&sort=rating-desc');
  const call=calls.find(item=>item[0]==='openGenrePage');
  assert(call,'genre route should preserve canonical browse state');
  assert.strictEqual(call[2].browseState.year,'2024');
  assert.strictEqual(call[2].browseState.country,'jp');
  assert.strictEqual(call[2].browseState.sort,'rating-desc');
}

{
  const {calls,router}=createRouter('/app/company/movie/49-hbo?genre=18&language=ja&certification=pg-13&status=ended');
  assert.strictEqual(router.currentRoute(),'/app/company/movie/49-hbo?genre=18&language=ja&certification=pg-13');
  const call=calls.find(item=>item[0]==='openDiscoveryFilterPage');
  assert(call,'typed discovery route should preserve compatible Browse state');
  assert.strictEqual(call[3].media,'movie');
  assert.strictEqual(call[3].browseState.language,'ja');
  assert.strictEqual(call[3].browseState.certification,'pg-13');
  assert.deepStrictEqual(Array.from(call[3].browseState.statuses),[]);
}

{
  const {context,calls}=createRouter('/app/browse/tv?genre=18&sort=rating-desc',{appDataReady:false});
  assert.strictEqual(context.activePage,'browse-detail');
  assert(calls.some(item=>item[0]==='showBrowsePageShell'),'startup should immediately render the correct Browse shell');
  assert.strictEqual(context.browsePageState.filters.sort,'rating-desc');
}

{
  const {calls,router}=createRouter('/app/collections');
  assert.strictEqual(router.currentRoute(),'/app/collections');
  const call=calls.find(item=>item[0]==='openCollectionsPage');
  assert(call,'collections route should open collections page');
  assert.strictEqual(call[1].fromRoute,true);
}

{
  const {calls,router}=createRouter('/app/collections?page=2&sort=popularity.desc&decade=2000&genre=28&bad=1');
  assert.strictEqual(router.currentRoute(),'/app/collections?genre=28&decade=2000&page=2');
  const call=calls.find(item=>item[0]==='openCollectionsPage');
  assert(call,'collections route should preserve collection filters');
  assert.strictEqual(call[1].filters.genre,'28');
  assert.strictEqual(call[1].filters.decade,'2000');
  assert.strictEqual(call[1].filters.sort,'popularity.desc');
  assert.strictEqual(call[1].filters.page,2);
}

{
  const {calls,router}=createRouter('/app/collection/1241-harry-potter-collection');
  assert.strictEqual(router.currentRoute(),'/app/collection/1241-harry-potter-collection');
  const call=calls.find(item=>item[0]==='openCollectionDetailPage');
  assert(call,'collection detail route should open collection detail page');
  assert.strictEqual(call[1],'1241');
  assert.strictEqual(call[2].fromRoute,true);
  assert.strictEqual(call[2].routeSlug,'harry-potter-collection');
}

console.log('Real-path router runtime checks passed');


{
  const {calls,router}=createRouter('/app/notifications');
  assert.strictEqual(router.currentRoute(),'/app/notifications');
  const call=calls.find(item=>item[0]==='openNotificationsPage');
  assert(call,'notification route should open the Notifications page');
  assert.strictEqual(call[1].fromRoute,true);
}

{
  const {calls,router}=createRouter('/app/notifications/settings');
  assert.strictEqual(router.currentRoute(),'/app/notifications/settings');
  const call=calls.find(item=>item[0]==='openNotificationSettingsPage');
  assert(call,'notification settings route should open settings page');
  assert.strictEqual(call[1].fromRoute,true);
}
